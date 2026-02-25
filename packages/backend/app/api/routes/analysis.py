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
    ProjectPipelineRequest,
    ProjectPipelineResult,
    ProjectPipelineProgress,
)
from app.services.zone_analyzer import ZoneAnalyzer
from app.services.design_engine import DesignEngine
from app.services.metrics_calculator import MetricsCalculator
from app.services.metrics_manager import MetricsManager
from app.services.metrics_aggregator import MetricsAggregator
from app.api.deps import get_zone_analyzer, get_design_engine, get_metrics_calculator, get_metrics_manager
from app.api.routes.projects import get_projects_store

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


# ---------------------------------------------------------------------------
# Project Pipeline (images → calculators → aggregation → Stage 2.5 → Stage 3)
# ---------------------------------------------------------------------------

@router.post("/project-pipeline", response_model=ProjectPipelineResult)
async def run_project_pipeline(
    request: ProjectPipelineRequest,
    analyzer: ZoneAnalyzer = Depends(get_zone_analyzer),
    engine: DesignEngine = Depends(get_design_engine),
    calculator: MetricsCalculator = Depends(get_metrics_calculator),
    manager: MetricsManager = Depends(get_metrics_manager),
):
    """Run the full project pipeline: per-image calculations → aggregate → Stage 2.5 → Stage 3."""
    steps: list[ProjectPipelineProgress] = []
    projects_store = get_projects_store()

    # 1. Look up project
    project = projects_store.get(request.project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {request.project_id}")

    # 2. Validate indicator_ids
    valid_ids = [ind for ind in request.indicator_ids if manager.has_calculator(ind)]
    if not valid_ids:
        raise HTTPException(status_code=400, detail="No valid calculator found for any of the provided indicator_ids")
    if len(valid_ids) < len(request.indicator_ids):
        skipped = set(request.indicator_ids) - set(valid_ids)
        steps.append(ProjectPipelineProgress(
            step="validate_indicators",
            status="completed",
            detail=f"Skipped unknown indicators: {', '.join(skipped)}",
        ))
    else:
        steps.append(ProjectPipelineProgress(step="validate_indicators", status="completed",
                                             detail=f"{len(valid_ids)} indicators validated"))

    # 3. Filter to zone-assigned images
    assigned_images = [img for img in project.uploaded_images if img.zone_id]
    if not assigned_images:
        raise HTTPException(status_code=400, detail="No images assigned to zones in this project")

    steps.append(ProjectPipelineProgress(
        step="filter_images",
        status="completed",
        detail=f"{len(assigned_images)} of {len(project.uploaded_images)} images assigned to zones",
    ))

    # 4. Run calculations (use semantic_map when available, plus FMB layers)
    calc_run = 0
    calc_ok = 0
    calc_fail = 0

    for img in assigned_images:
        # Prefer semantic_map mask over raw photo
        image_path = img.mask_filepaths.get("semantic_map", img.filepath)

        for ind_id in valid_ids:
            # Full layer
            if ind_id not in img.metrics_results:
                calc_run += 1
                try:
                    result = calculator.calculate(ind_id, image_path)
                    if result.success and result.value is not None:
                        img.metrics_results[ind_id] = result.value
                        calc_ok += 1
                    else:
                        calc_fail += 1
                        logger.warning("Calculation failed for %s on %s: %s", ind_id, img.image_id, result.error)
                except Exception as e:
                    calc_fail += 1
                    logger.error("Calculator exception %s on %s: %s", ind_id, img.image_id, e)

            # FMB layers (only if layer masks exist)
            for layer in ["foreground", "middleground", "background"]:
                layer_key = f"{ind_id}__{layer}"
                mask_name = f"{layer}_map"
                mask_path = img.mask_filepaths.get(mask_name)
                if mask_path and layer_key not in img.metrics_results:
                    calc_run += 1
                    try:
                        result = calculator.calculate_for_layer(
                            ind_id,
                            image_path,
                            mask_path,
                        )
                        if result.success and result.value is not None:
                            img.metrics_results[layer_key] = result.value
                            calc_ok += 1
                        else:
                            calc_fail += 1
                            logger.warning("Layer calc failed for %s/%s on %s: %s", ind_id, layer, img.image_id, result.error)
                    except Exception as e:
                        calc_fail += 1
                        logger.error("Layer calc exception %s/%s on %s: %s", ind_id, layer, img.image_id, e)

    steps.append(ProjectPipelineProgress(
        step="run_calculations",
        status="completed" if calc_ok > 0 or calc_run == 0 else "failed",
        detail=f"Ran {calc_run} calculations: {calc_ok} succeeded, {calc_fail} failed",
    ))

    # 5. Aggregate
    calculator_infos = {ind_id: manager.get_calculator(ind_id) for ind_id in valid_ids if manager.get_calculator(ind_id)}
    zone_statistics, indicator_definitions = MetricsAggregator.aggregate(
        images=assigned_images,
        zones=project.spatial_zones,
        indicator_ids=valid_ids,
        calculator_infos=calculator_infos,
    )

    steps.append(ProjectPipelineProgress(
        step="aggregate",
        status="completed",
        detail=f"{len(zone_statistics)} zone-stat records from {len(set(s.zone_id for s in zone_statistics))} zones",
    ))

    # 6. Stage 2.5 — Zone analysis
    zone_result: Optional[ZoneAnalysisResult] = None
    design_result = None

    if zone_statistics:
        try:
            zone_request = ZoneAnalysisRequest(
                indicator_definitions=indicator_definitions,
                zone_statistics=zone_statistics,
                zscore_moderate=request.zscore_moderate,
                zscore_significant=request.zscore_significant,
                zscore_critical=request.zscore_critical,
            )
            zone_result = analyzer.analyze(zone_request)
            steps.append(ProjectPipelineProgress(step="zone_analysis", status="completed",
                                                 detail=f"{len(zone_result.zone_diagnostics)} zone diagnostics"))
        except Exception as e:
            logger.error("Stage 2.5 failed: %s", e, exc_info=True)
            steps.append(ProjectPipelineProgress(step="zone_analysis", status="failed", detail=str(e)))
    else:
        steps.append(ProjectPipelineProgress(step="zone_analysis", status="skipped", detail="No zone statistics to analyze"))

    # 7. Stage 3 — Design strategies (non-fatal)
    if request.run_stage3 and zone_result:
        try:
            project_context = ProjectContext(
                project={
                    "name": project.project_name,
                    "location": project.project_location or None,
                    "scale": project.site_scale or None,
                    "phase": project.project_phase or None,
                },
                context={
                    "climate": {"koppen_zone_id": project.koppen_zone_id},
                    "urban_form": {
                        "space_type_id": project.space_type_id,
                        "lcz_type_id": project.lcz_type_id or None,
                    },
                    "user": {"age_group_id": project.age_group_id or None},
                    "country_id": project.country_id or None,
                },
                performance_query={
                    "design_brief": project.design_brief or None,
                    "dimensions": project.performance_dimensions,
                    "subdimensions": project.subdimensions,
                },
            )
            design_request = DesignStrategyRequest(
                zone_analysis=zone_result,
                project_context=project_context,
                allowed_indicator_ids=valid_ids,
                use_llm=request.use_llm,
                max_ioms_per_query=request.max_ioms_per_query,
                max_strategies_per_zone=request.max_strategies_per_zone,
            )
            design_result = await engine.generate_design_strategies(design_request)
            steps.append(ProjectPipelineProgress(step="design_strategies", status="completed",
                                                 detail=f"{len(design_result.zones)} zones with strategies"))
        except Exception as e:
            logger.error("Stage 3 failed (non-fatal): %s", e, exc_info=True)
            steps.append(ProjectPipelineProgress(step="design_strategies", status="failed", detail=str(e)))
    elif not request.run_stage3:
        steps.append(ProjectPipelineProgress(step="design_strategies", status="skipped", detail="Stage 3 disabled"))
    else:
        steps.append(ProjectPipelineProgress(step="design_strategies", status="skipped", detail="No zone analysis result"))

    return ProjectPipelineResult(
        project_id=request.project_id,
        project_name=project.project_name,
        total_images=len(project.uploaded_images),
        zone_assigned_images=len(assigned_images),
        calculations_run=calc_run,
        calculations_succeeded=calc_ok,
        calculations_failed=calc_fail,
        zone_statistics_count=len(zone_statistics),
        zone_analysis=zone_result,
        design_strategies=design_result,
        steps=steps,
    )
