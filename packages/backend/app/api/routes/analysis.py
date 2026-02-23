"""
Analysis Pipeline API Routes
Stage 2.5 (zone statistics) + Stage 3 (design strategies)
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models.analysis import (
    ZoneAnalysisRequest,
    ZoneAnalysisResult,
    DesignStrategyRequest,
    DesignStrategyResult,
    FullAnalysisRequest,
    FullAnalysisResult,
    ProjectContext,
)
from app.services.zone_analyzer import ZoneAnalyzer
from app.services.design_engine import DesignEngine
from app.api.deps import get_zone_analyzer, get_design_engine

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Stage 2.5: Zone Statistics
# ---------------------------------------------------------------------------

@router.post("/zone-statistics", response_model=ZoneAnalysisResult)
def compute_zone_statistics(
    request: ZoneAnalysisRequest,
    analyzer: ZoneAnalyzer = Depends(get_zone_analyzer),
):
    """Run Stage 2.5 cross-zone statistical analysis (sync, pure numpy)."""
    try:
        return analyzer.analyze(request)
    except Exception as e:
        logger.error("Zone analysis failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Stage 3: Design Strategies
# ---------------------------------------------------------------------------

@router.post("/design-strategies", response_model=DesignStrategyResult)
async def generate_design_strategies(
    request: DesignStrategyRequest,
    engine: DesignEngine = Depends(get_design_engine),
):
    """Run Stage 3 design strategy generation (async, LLM + rule-based fallback)."""
    try:
        return await engine.generate_design_strategies(request)
    except Exception as e:
        logger.error("Design strategy generation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Full Pipeline (Stage 2.5 + Stage 3 chained)
# ---------------------------------------------------------------------------

@router.post("/run-full", response_model=FullAnalysisResult)
async def run_full_analysis(
    request: FullAnalysisRequest,
    analyzer: ZoneAnalyzer = Depends(get_zone_analyzer),
    engine: DesignEngine = Depends(get_design_engine),
):
    """Run the full analysis pipeline: Stage 2.5 → Stage 3."""
    try:
        # Stage 2.5
        zone_request = ZoneAnalysisRequest(
            indicator_definitions=request.indicator_definitions,
            zone_statistics=request.zone_statistics,
            zscore_moderate=request.zscore_moderate,
            zscore_significant=request.zscore_significant,
            zscore_critical=request.zscore_critical,
        )
        zone_result = analyzer.analyze(zone_request)

        # Stage 3
        design_request = DesignStrategyRequest(
            zone_analysis=zone_result,
            project_context=request.project_context,
            allowed_indicator_ids=request.allowed_indicator_ids,
            use_llm=request.use_llm,
            max_ioms_per_query=request.max_ioms_per_query,
            max_strategies_per_zone=request.max_strategies_per_zone,
        )
        design_result = await engine.generate_design_strategies(design_request)

        return FullAnalysisResult(
            zone_analysis=zone_result,
            design_strategies=design_result,
        )
    except Exception as e:
        logger.error("Full analysis pipeline failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Async (Celery) endpoint for full pipeline
# ---------------------------------------------------------------------------

class AsyncAnalysisResponse(BaseModel):
    task_id: str
    status: str
    message: str


@router.post("/run-full/async", response_model=AsyncAnalysisResponse)
async def run_full_analysis_async(request: FullAnalysisRequest):
    """Submit full analysis pipeline as a background Celery task."""
    try:
        from app.core.celery_app import celery_app  # noqa: F811
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Celery not available: {e}. Make sure Redis is running.",
        )

    from app.tasks.analysis_tasks import run_full_analysis_task

    task = run_full_analysis_task.delay(request.model_dump())

    return AsyncAnalysisResponse(
        task_id=task.id,
        status="PENDING",
        message=f"Full analysis pipeline submitted for {len(request.zone_statistics)} zone-stat records",
    )
