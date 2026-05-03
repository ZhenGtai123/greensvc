"""Indicator recommendation endpoints"""

import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.api.deps import get_gemini_client, get_knowledge_base, get_current_user
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
    if not project.selected_indicators or not (prev_ids & new_ids):
        project.selected_indicators = list(project.stage1_recommendations)
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

    # Get recommendations
    response = await recommendation_service.recommend_indicators(request, knowledge_base)

    if not response.success:
        raise HTTPException(
            status_code=502,
            detail=response.error or "Failed to get recommendations"
        )

    if request.project_id:
        _persist_stage1(request.project_id, response)

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
