"""Indicator recommendation endpoints"""

import asyncio
import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.api.deps import get_gemini_client, get_knowledge_base, get_current_user
from app.api.routes.projects import _invalidate_analysis_artefacts
from app.db.project_store import get_project_store
from app.models.user import UserResponse
from app.services.gemini_client import RecommendationService
from app.services.knowledge_base import KnowledgeBase
from app.models.indicator import (
    RecommendationRequest,
    RecommendationResponse,
    IndicatorDefinition,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# In-flight Stage 1 recommendation futures, keyed by project_id. When a
# second client (or the same client after a hard refresh) fires another
# recommend POST while the first one is still awaiting Gemini, we reuse the
# existing future instead of starting a new LLM call. The dict is cleared
# after the future resolves (success or error). project_id-less requests
# get a synthetic key built from a hash of the request body so they still
# benefit from dedup within a single browser session.
_in_flight_recommendations: dict[str, asyncio.Future] = {}


def _flight_key(request: RecommendationRequest) -> str:
    """Stable key for in-flight dedup. Prefers project_id; falls back to a
    hash of the project context for project-less ad-hoc calls."""
    if request.project_id:
        return f"project:{request.project_id}"
    # Hash a few stable fields so the same ad-hoc request dedups within a
    # session (no need to be perfect — collisions are harmless, just less
    # efficient).
    blob = json.dumps(
        {
            "name": request.project_name,
            "dims": sorted(request.performance_dimensions or []),
            "ko": request.koppen_zone_id,
            "lcz": request.lcz_type_id,
            "space": request.space_type_id,
        },
        sort_keys=True,
    )
    return f"adhoc:{hash(blob)}"


async def _run_recommendation(
    request: RecommendationRequest,
    recommendation_service: RecommendationService,
    knowledge_base: KnowledgeBase,
) -> RecommendationResponse:
    """Inner runner — wrapped by the dedup layer."""
    response = await recommendation_service.recommend_indicators(request, knowledge_base)
    if response.success and request.project_id:
        _persist_stage1(request.project_id, response)
    return response


def _persist_stage1(project_id: str, response: RecommendationResponse) -> None:
    """Save Stage 1 output onto the project so it survives reloads.

    Seeds selected_indicators from the recommendation list (initial state =
    everything selected); the user can refine later via PUT
    /projects/{id}/selected-indicators.
    """
    store = get_project_store()
    project = store.get(project_id)
    if project is None:
        logger.warning("Stage 1 persist: project %s not found", project_id)
        return
    payload = response.model_dump(mode="json")
    project.stage1_recommendations = payload.get("recommendations", [])
    project.stage1_relationships = payload.get("indicator_relationships", [])
    project.stage1_summary = payload.get("summary")
    # Re-seed selection only on the first run, or when the recommendation set
    # changed enough that the previous selection is meaningless. Cheap proxy:
    # if existing selection is empty OR all of its indicator_ids are absent
    # from the new recommendation list, replace it; otherwise keep the user's
    # previous picks intact.
    new_ids = {r["indicator_id"] for r in project.stage1_recommendations if "indicator_id" in r}
    prev_ids = {s["indicator_id"] for s in project.selected_indicators if "indicator_id" in s}
    selection_was_reseeded = False
    if not project.selected_indicators or not (prev_ids & new_ids):
        project.selected_indicators = list(project.stage1_recommendations)
        selection_was_reseeded = True

    # Stage 1 just got refreshed → cached pipeline / strategies / AI report
    # were computed against the previous indicator universe. Always wipe
    # downstream artefacts when the recommendations change so the user is
    # forced to re-run the pipeline against the new (or newly re-seeded)
    # indicator set. We don't need to be clever about "did the IDs actually
    # differ" — Stage 1 only re-runs on explicit user action, so a no-op
    # double-click is rare enough that aggressive invalidation is the right
    # safety/sanity tradeoff. selection_was_reseeded is logged for context.
    if _invalidate_analysis_artefacts(project):
        logger.info(
            "Project %s: invalidated analysis artefacts after Stage 1 re-run "
            "(selection_reseeded=%s)",
            project_id, selection_was_reseeded,
        )

    project.updated_at = datetime.now()
    store.save(project)


@router.post("/recommend", response_model=RecommendationResponse)
async def recommend_indicators(
    request: RecommendationRequest,
    recommendation_service: RecommendationService = Depends(get_gemini_client),
    knowledge_base: KnowledgeBase = Depends(get_knowledge_base),
    _user: UserResponse = Depends(get_current_user),
):
    """
    Get AI-powered indicator recommendations based on project context.

    Uses the knowledge base evidence and the active LLM provider to recommend
    the most relevant indicators for the project.
    """
    if not recommendation_service.check_api_key():
        provider = recommendation_service.llm.provider
        raise HTTPException(
            status_code=503,
            detail=f"LLM provider '{provider}' failed to initialize. "
                   f"Check the API key and that the required SDK is installed. "
                   f"See server logs for details."
        )

    # Layer 1 dedup — if the same project already has a recommendation in
    # flight, reuse its future instead of firing another Gemini call.
    key = _flight_key(request)
    fut = _in_flight_recommendations.get(key)
    if fut is not None and not fut.done():
        logger.info("Stage 1 dedup: reusing in-flight future for %s", key)
        try:
            response = await fut
        except Exception as exc:
            # Don't propagate the leader's exception verbatim — fall through
            # to a fresh attempt below in case the leader hit a transient.
            logger.warning("Stage 1 leader future raised; retrying: %s", exc)
            response = None
    else:
        response = None

    if response is None:
        # No live future, or the leader errored — start a new one and
        # register it so concurrent followers can attach.
        loop = asyncio.get_running_loop()
        new_fut = loop.create_task(
            _run_recommendation(request, recommendation_service, knowledge_base)
        )
        _in_flight_recommendations[key] = new_fut
        try:
            response = await new_fut
        finally:
            # Always clear the slot so the next request starts a fresh call.
            _in_flight_recommendations.pop(key, None)

    if not response.success:
        raise HTTPException(
            status_code=502,
            detail=response.error or "Failed to get recommendations"
        )

    return response


@router.post("/recommend/stream")
async def recommend_indicators_stream(
    request: RecommendationRequest,
    recommendation_service: RecommendationService = Depends(get_gemini_client),
    knowledge_base: KnowledgeBase = Depends(get_knowledge_base),
    _user: UserResponse = Depends(get_current_user),
):
    """Stream indicator recommendations via Server-Sent Events.

    Events: status | chunk | result | error
    """
    if not recommendation_service.check_api_key():
        raise HTTPException(
            status_code=503,
            detail=f"LLM provider '{recommendation_service.llm.provider}' not configured",
        )

    async def event_generator():
        async for event in recommendation_service.recommend_indicators_stream(
            request, knowledge_base
        ):
            # Intercept the final result and persist it onto the project
            # before forwarding, so the next page mount can hydrate from
            # the backend regardless of network conditions on the SSE tail.
            if request.project_id and event.get("type") == "result":
                try:
                    response = RecommendationResponse(**event["data"])
                    _persist_stage1(request.project_id, response)
                except Exception as e:
                    logger.warning("Stage 1 stream persist failed: %s", e)
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/definitions", response_model=list[dict])
async def get_indicator_definitions(
    knowledge_base: KnowledgeBase = Depends(get_knowledge_base),
):
    """Get all indicator definitions from knowledge base"""
    return knowledge_base.get_indicator_definitions()


@router.get("/dimensions", response_model=list[dict])
async def get_performance_dimensions(
    knowledge_base: KnowledgeBase = Depends(get_knowledge_base),
):
    """Get all performance dimensions from knowledge base"""
    return knowledge_base.get_performance_dimensions()


@router.get("/subdimensions", response_model=list[dict])
async def get_subdimensions(
    knowledge_base: KnowledgeBase = Depends(get_knowledge_base),
):
    """Get all subdimensions from knowledge base"""
    return knowledge_base.get_subdimensions()


@router.get("/evidence/dimension/{dimension_id}")
async def get_evidence_for_dimension(
    dimension_id: str,
    knowledge_base: KnowledgeBase = Depends(get_knowledge_base),
):
    """Get evidence records for a specific performance dimension"""
    evidence = knowledge_base.get_evidence_for_dimension(dimension_id)
    return {
        "dimension_id": dimension_id,
        "evidence_count": len(evidence),
        "evidence": evidence,
    }


@router.get("/evidence/{indicator_id}")
async def get_evidence_for_indicator(
    indicator_id: str,
    knowledge_base: KnowledgeBase = Depends(get_knowledge_base),
):
    """Get evidence records for a specific indicator"""
    evidence = knowledge_base.get_evidence_for_indicator(indicator_id)
    return {
        "indicator_id": indicator_id,
        "evidence_count": len(evidence),
        "evidence": evidence,
    }


@router.get("/knowledge-base/summary")
async def get_knowledge_base_summary(
    knowledge_base: KnowledgeBase = Depends(get_knowledge_base),
):
    """Get knowledge base summary"""
    return knowledge_base.get_summary()
