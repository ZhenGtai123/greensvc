"""
Analysis Pipeline API Routes
Stage 2.5 (zone statistics) + Stage 3 (design strategies)
"""

import asyncio
import gc
import json
import logging
import math
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator, Optional

from PIL import Image as PILImage

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.models.analysis import (
    ZoneAnalysisRequest,
    ZoneAnalysisResult,
    ClusteringResult,
    DesignStrategyRequest,
    DesignStrategyResult,
    FullAnalysisRequest,
    FullAnalysisResult,
    ProjectContext,
    ProjectPipelineRequest,
    ProjectPipelineResult,
    ProjectPipelineProgress,
    SkippedImage,
    IndicatorDefinitionInput,
    IndicatorLayerValue,
    ImageRecord,
    ReportRequest,
    ReportResult,
    GroupingMode,
)
from app.services.zone_analyzer import ZoneAnalyzer
from app.services.design_engine import DesignEngine
from app.services.clustering_service import ClusteringService
from app.services.metrics_calculator import MetricsCalculator
from app.services.metrics_manager import MetricsManager
from app.services.metrics_aggregator import MetricsAggregator
from app.api.deps import (
    get_zone_analyzer,
    get_design_engine,
    get_clustering_service,
    get_metrics_calculator,
    get_metrics_manager,
    get_current_user,
    get_report_service,
    get_chart_summary_service,
)
from app.services.report_service import ReportService
from app.services.chart_summary_service import ChartSummaryService
from app.models.user import UserResponse
from app.api.routes.projects import get_projects_store

logger = logging.getLogger(__name__)

router = APIRouter()


class _SafeJSONEncoder(json.JSONEncoder):
    """JSON encoder that converts NaN/Infinity to null and numpy types to Python types."""

    def default(self, o: Any) -> Any:
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            v = float(o)
            if math.isnan(v) or math.isinf(v):
                return None
            return v
        if isinstance(o, np.ndarray):
            return o.tolist()
        return super().default(o)

    def encode(self, o: Any) -> str:
        return super().encode(self._sanitize(o))

    def _sanitize(self, obj: Any) -> Any:
        if isinstance(obj, float):
            if math.isnan(obj) or math.isinf(obj):
                return None
        elif isinstance(obj, dict):
            return {k: self._sanitize(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple)):
            return [self._sanitize(v) for v in obj]
        return obj


def _safe_json(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, cls=_SafeJSONEncoder)


# ---------------------------------------------------------------------------
# Stage 2.5: Zone Statistics
# ---------------------------------------------------------------------------

@router.post("/zone-statistics", response_model=ZoneAnalysisResult)
def compute_zone_statistics(
    request: ZoneAnalysisRequest,
    analyzer: ZoneAnalyzer = Depends(get_zone_analyzer),
    _user: UserResponse = Depends(get_current_user),
):
    """Run Stage 2.5 cross-zone statistical analysis (sync, pure numpy)."""
    try:
        return analyzer.analyze(request)
    except Exception as e:
        logger.error("Zone analysis failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Clustering: SVC Archetype Discovery
# ---------------------------------------------------------------------------

class ClusteringRequest(BaseModel):
    """Request for SVC archetype clustering (caller-built point_metrics)."""
    point_metrics: list[dict]
    indicator_definitions: dict[str, IndicatorDefinitionInput]
    layer: str = "full"
    max_k: int = 10
    knn_k: int = 7
    min_points: int = 10


class ClusteringByProjectRequest(BaseModel):
    """Request that builds point_metrics from project.uploaded_images (with lat/lng)."""
    project_id: str
    indicator_ids: list[str]
    layer: str = "full"
    max_k: int = 10
    knn_k: int = 7
    min_points: int = 10


class ClusteringResponse(BaseModel):
    clustering: Optional[ClusteringResult] = None
    segment_diagnostics: list = []
    # #1 — full Stage 2.5 result computed with each cluster acting as a virtual
    # zone. Frontend can drop this straight into setZoneAnalysisResult so that
    # z-score / correlation / radar / global stats all reflect cluster
    # membership instead of the original (often single-zone) project layout.
    zone_analysis: Optional[ZoneAnalysisResult] = None
    skipped: bool = False
    reason: str = ""
    n_points_used: int = 0
    n_points_with_gps: int = 0


@router.post("/clustering", response_model=ClusteringResponse)
def run_clustering(
    request: ClusteringRequest,
    service: ClusteringService = Depends(get_clustering_service),
    _user: UserResponse = Depends(get_current_user),
):
    """Run SVC archetype clustering on caller-supplied point metrics.

    Each point_metrics entry should include point_id, optional lat/lng, and
    per-indicator values. For project-sourced data, prefer /clustering/by-project
    which builds this structure directly from uploaded_images.
    """
    try:
        result = service.cluster(
            point_metrics=request.point_metrics,
            indicator_definitions=request.indicator_definitions,
            layer=request.layer,
            max_k=request.max_k,
            knn_k=request.knn_k,
            min_points=request.min_points,
        )
        if result is None:
            return ClusteringResponse(
                skipped=True,
                reason=f"Insufficient data ({len(request.point_metrics)} points, need >= {request.min_points})",
                n_points_used=len(request.point_metrics),
            )
        clustering_result, segment_diagnostics = result
        return ClusteringResponse(
            clustering=clustering_result,
            segment_diagnostics=segment_diagnostics,
            n_points_used=len(clustering_result.point_ids_ordered),
            n_points_with_gps=len(clustering_result.point_lats),
        )
    except Exception as e:
        logger.error("Clustering failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _build_cluster_zone_analysis(
    project,
    clustering_result: ClusteringResult,
    indicator_definitions: dict[str, IndicatorDefinitionInput],
    indicator_ids: list[str],
    analyzer: ZoneAnalyzer,
) -> Optional[ZoneAnalysisResult]:
    """Re-run Stage 2.5 with clusters acting as virtual zones.

    Without this, the existing chart pipeline keeps the original (often
    single-zone) zone_statistics / correlations / radar profiles after
    clustering — making "Run Clustering" feel like a no-op for everything
    except the zone_diagnostics list. This helper turns each cluster into a
    pseudo-zone (zone_id="seg_{cid}", zone_name="Cluster {cid}") and feeds
    the standard analyzer, returning a full ZoneAnalysisResult that the
    frontend can drop into setZoneAnalysisResult wholesale.

    Returns None if no images map to any cluster (shouldn't happen in
    practice — ClusteringService rejects projects with too few points).
    """
    from collections import defaultdict

    pid_to_cluster: dict[str, int] = {
        pid: int(cid)
        for pid, cid in zip(
            clustering_result.point_ids_ordered,
            clustering_result.labels_smoothed,
        )
    }

    grouped: dict[tuple[str, str, str], list[float]] = defaultdict(list)
    image_records: list[ImageRecord] = []

    for img in project.uploaded_images:
        cid = pid_to_cluster.get(img.image_id)
        if cid is None:
            continue
        if not img.metrics_results:
            continue
        zone_id = f"seg_{cid}"
        zone_name = f"Cluster {cid}"
        for ind_id in indicator_ids:
            val = img.metrics_results.get(ind_id)
            if val is not None:
                grouped[(zone_id, ind_id, "full")].append(val)
                image_records.append(ImageRecord(
                    image_id=img.image_id, zone_id=zone_id, zone_name=zone_name,
                    indicator_id=ind_id, layer="full", value=val,
                    lat=img.latitude, lng=img.longitude,
                ))
            for layer in ("foreground", "middleground", "background"):
                val = img.metrics_results.get(f"{ind_id}__{layer}")
                if val is not None:
                    grouped[(zone_id, ind_id, layer)].append(val)
                    image_records.append(ImageRecord(
                        image_id=img.image_id, zone_id=zone_id, zone_name=zone_name,
                        indicator_id=ind_id, layer=layer, value=val,
                        lat=img.latitude, lng=img.longitude,
                    ))

    if not grouped:
        return None

    zone_statistics: list[IndicatorLayerValue] = []
    for (zone_id, ind_id, layer), values in grouped.items():
        cid = zone_id.split("_")[-1]
        arr = np.array(values, dtype=float)
        n = len(values)
        zone_statistics.append(IndicatorLayerValue(
            zone_id=zone_id,
            zone_name=f"Cluster {cid}",
            indicator_id=ind_id,
            layer=layer,
            n_images=n,
            mean=float(np.mean(arr)),
            std=float(np.std(arr, ddof=1)) if n > 1 else 0.0,
            min=float(np.min(arr)),
            max=float(np.max(arr)),
            unit=indicator_definitions[ind_id].unit if ind_id in indicator_definitions else "",
            area_sqm=0,
        ))

    request = ZoneAnalysisRequest(
        indicator_definitions=indicator_definitions,
        zone_statistics=zone_statistics,
        image_records=image_records,
    )
    result = analyzer.analyze(request)
    # Tag the result so the frontend / report writer can label charts with
    # "by cluster" wording instead of "by zone".
    result.zone_source = "cluster"
    result.analysis_mode = "zone_level"
    result.clustering = clustering_result
    return result


@router.post("/clustering/by-project", response_model=ClusteringResponse)
def run_clustering_by_project(
    request: ClusteringByProjectRequest,
    service: ClusteringService = Depends(get_clustering_service),
    manager: MetricsManager = Depends(get_metrics_manager),
    analyzer: ZoneAnalyzer = Depends(get_zone_analyzer),
    _user: UserResponse = Depends(get_current_user),
):
    """Run clustering on image-level point metrics built from a project's uploaded_images.

    Builds one point per zone-assigned image, including lat/lng from EXIF (if
    present) and per-indicator values from img.metrics_results. Requires that
    the project pipeline has already been run (so metrics_results is populated).
    """
    projects_store = get_projects_store()
    project = projects_store.get(request.project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {request.project_id}")

    # Validate indicator_ids against loaded calculators
    valid_ids = [ind for ind in request.indicator_ids if manager.has_calculator(ind)]
    if not valid_ids:
        raise HTTPException(status_code=400, detail="No valid calculator found for provided indicator_ids")

    # Build per-indicator definitions
    indicator_definitions: dict[str, IndicatorDefinitionInput] = {}
    for ind_id in valid_ids:
        info = manager.get_calculator(ind_id)
        if info:
            indicator_definitions[ind_id] = IndicatorDefinitionInput(
                id=ind_id,
                name=info.name,
                unit=info.unit,
                target_direction=info.target_direction or "INCREASE",
                definition=info.definition,
                category=info.category,
            )

    # Build point_metrics: one point per image with computed indicators.
    # Clustering is zone-agnostic — include all images regardless of zone assignment.
    point_metrics: list[dict] = []
    n_with_gps = 0
    n_unassigned_included = 0
    for img in project.uploaded_images:
        row: dict = {
            "point_id": img.image_id,
            "zone_id": img.zone_id,  # may be None; ClusteringService ignores it
        }
        has_gps = img.latitude is not None and img.longitude is not None
        if has_gps:
            row["lat"] = img.latitude
            row["lng"] = img.longitude
        has_any = False
        for ind_id in valid_ids:
            if request.layer == "full":
                key = ind_id
            else:
                key = f"{ind_id}__{request.layer}"
            v = img.metrics_results.get(key)
            if v is not None:
                row[ind_id] = v
                has_any = True
        if has_any:
            point_metrics.append(row)
            if has_gps:
                n_with_gps += 1
            if not img.zone_id:
                n_unassigned_included += 1

    logger.info(
        "clustering/by-project: project=%s layer=%s points=%d (gps=%d, unassigned=%d) indicators=%d",
        request.project_id, request.layer, len(point_metrics), n_with_gps,
        n_unassigned_included, len(valid_ids),
    )

    try:
        result = service.cluster(
            point_metrics=point_metrics,
            indicator_definitions=indicator_definitions,
            layer=request.layer,
            max_k=request.max_k,
            knn_k=request.knn_k,
            min_points=request.min_points,
        )
        if result is None:
            return ClusteringResponse(
                skipped=True,
                reason=(
                    f"Insufficient data ({len(point_metrics)} points with indicators, "
                    f"need >= {request.min_points}). Run the project pipeline first to "
                    f"populate per-image metrics."
                ),
                n_points_used=len(point_metrics),
                n_points_with_gps=n_with_gps,
            )
        clustering_result, segment_diagnostics = result
        # Build the cluster-as-zone Stage 2.5 result so every downstream chart
        # (z-score grid, correlation, radar, layer stats) reflects cluster
        # membership instead of the user's original zones.
        cluster_zone_analysis: Optional[ZoneAnalysisResult] = None
        try:
            cluster_zone_analysis = _build_cluster_zone_analysis(
                project=project,
                clustering_result=clustering_result,
                indicator_definitions=indicator_definitions,
                indicator_ids=valid_ids,
                analyzer=analyzer,
            )
            if cluster_zone_analysis is not None:
                # Carry the segment_diagnostics built by ClusteringService over
                # to the analysis payload as well, so consumers reading
                # zone_analysis_result alone still see the full diagnostics
                # list.
                cluster_zone_analysis.segment_diagnostics = segment_diagnostics
        except Exception as e:
            # Non-fatal: clustering itself succeeded; we just couldn't
            # re-run the analyzer. Log and return without zone_analysis so
            # the FE falls back to legacy partial-replacement behaviour.
            logger.error("Cluster-as-zone analysis failed: %s", e, exc_info=True)
        return ClusteringResponse(
            clustering=clustering_result,
            segment_diagnostics=segment_diagnostics,
            zone_analysis=cluster_zone_analysis,
            n_points_used=len(clustering_result.point_ids_ordered),
            n_points_with_gps=len(clustering_result.point_lats),
        )
    except Exception as e:
        logger.error("Clustering (by-project) failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Merged Export: indicator_results_merged.json
# ---------------------------------------------------------------------------

class MergedExportRequest(BaseModel):
    """Request to generate the merged analysis JSON (Stage 2.5 + clustering)."""
    zone_analysis: ZoneAnalysisResult
    clustering: Optional[ClusteringResult] = None
    segment_diagnostics: list = []


@router.post("/export-merged")
def export_merged(
    request: MergedExportRequest,
    _user: UserResponse = Depends(get_current_user),
):
    """Return a single indicator_results_merged.json combining all Stage 2.5 outputs."""
    za = request.zone_analysis
    meta = za.computation_metadata.model_dump()
    meta["stage3_compatible"] = True
    meta["has_clustering"] = request.clustering is not None
    meta["n_segments"] = len(request.segment_diagnostics)
    meta["design_principle"] = "Color=Z-score(comparison), Text=Original(understanding)"

    merged = {
        "computation_metadata": meta,
        "indicator_definitions": {k: v.model_dump() for k, v in za.indicator_definitions.items()},
        "layer_statistics": za.layer_statistics,
        "zone_statistics": [s.model_dump() for s in za.zone_statistics],
        "zone_diagnostics": [d.model_dump() for d in za.zone_diagnostics],
        "correlation_by_layer": za.correlation_by_layer,
        "pvalue_by_layer": za.pvalue_by_layer,
        "radar_profiles": za.radar_profiles,
    }

    if request.clustering:
        merged["clustering"] = request.clustering.model_dump()
    if request.segment_diagnostics:
        merged["segment_diagnostics"] = request.segment_diagnostics

    return merged


# ---------------------------------------------------------------------------
# Stage 3: Design Strategies
# ---------------------------------------------------------------------------

@router.post("/design-strategies", response_model=DesignStrategyResult)
async def generate_design_strategies(
    request: DesignStrategyRequest,
    engine: DesignEngine = Depends(get_design_engine),
    _user: UserResponse = Depends(get_current_user),
):
    """Run Stage 3 design strategy generation (async, LLM + rule-based fallback).

    When ``request.project_id`` is provided, the result is persisted onto the
    project so reloads / project switches don't lose it.
    """
    try:
        result = await engine.generate_design_strategies(request)
    except Exception as e:
        logger.error("Design strategy generation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    if request.project_id:
        store = get_projects_store()
        project = store.get(request.project_id)
        if project is not None:
            project.design_strategy_result = result.model_dump(mode="json")
            # Stage 3 changed → existing AI report is now stale
            project.ai_report = None
            project.ai_report_meta = None
            project.analysis_results_updated_at = datetime.now()
            store.save(project)
    return result


# ---------------------------------------------------------------------------
# Agent C: Report Generation
# ---------------------------------------------------------------------------

@router.post("/generate-report", response_model=ReportResult)
async def generate_report(
    request: ReportRequest,
    report_service: ReportService = Depends(get_report_service),
    _user: UserResponse = Depends(get_current_user),
):
    """Generate comprehensive evidence-based design strategy report (Agent C).

    When ``request.project_id`` is provided, the rendered report content +
    metadata are persisted onto the project so reloads / project switches
    don't lose them.
    """
    try:
        result = await report_service.generate_report(request)
    except Exception as e:
        logger.error("Report generation failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    if request.project_id:
        store = get_projects_store()
        project = store.get(request.project_id)
        if project is not None:
            project.ai_report = result.content
            # Stamp the active grouping_mode into the persisted metadata so
            # hydrateFromProject can detect a stale report after the user
            # toggles modes (zone <-> cluster) without regenerating.
            meta = dict(result.metadata or {})
            meta["grouping_mode"] = request.grouping_mode
            project.ai_report_meta = meta
            project.analysis_results_updated_at = datetime.now()
            store.save(project)
    return result


# ---------------------------------------------------------------------------
# Per-Chart LLM Summary (5.10.4)
# ---------------------------------------------------------------------------


class ChartSummaryRequest(BaseModel):
    chart_id: str
    chart_title: str
    chart_description: Optional[str] = None
    project_id: str
    payload: dict[str, Any]
    project_context: Optional[dict[str, Any]] = None
    # #6 — grouping mode is folded into the cache key so toggling between
    # zone- and cluster-based views fetches a fresh interpretation tailored
    # to the active grouping unit. Defaults to "zones" for older clients.
    grouping_mode: GroupingMode = "zones"


class ChartFinding(BaseModel):
    point: str
    evidence: str = ""


class ChartLocalDetail(BaseModel):
    unit_id: str = ""
    unit_label: str = ""
    interpretation: str


class ChartSummaryV2(BaseModel):
    overall: str
    findings: list[ChartFinding]
    local_breakdown: list[ChartLocalDetail]
    implication: str


class ChartSummaryResponse(BaseModel):
    # Legacy fields — kept for backward compatibility with older frontend
    # builds. They are derived from summary_v2 when the LLM produces valid
    # structured output.
    summary: str
    highlight_points: list[str]
    cached: bool
    model: str = ""
    error: Optional[str] = None
    # #6 — structured 4-section interpretation. Null when the LLM failed
    # twice to return parseable JSON; in that case `degraded=True` and the
    # frontend renders just the legacy paragraph with a hint.
    summary_v2: Optional[ChartSummaryV2] = None
    degraded: bool = False


@router.post("/chart-summary", response_model=ChartSummaryResponse)
async def chart_summary(
    request: ChartSummaryRequest,
    service: ChartSummaryService = Depends(get_chart_summary_service),
    _user: UserResponse = Depends(get_current_user),
):
    """Return a structured LLM interpretation of a single chart payload.

    Cache-first: identical (chart_id, project_id, hash(payload + grouping_mode))
    tuples reuse a previous answer without an LLM round-trip. Used by the
    "What this means" expandable on each ChartHost card.
    """
    try:
        result = await service.generate(
            chart_id=request.chart_id,
            chart_title=request.chart_title,
            chart_description=request.chart_description,
            project_id=request.project_id,
            payload=request.payload,
            project_context=request.project_context,
            grouping_mode=request.grouping_mode,
        )
        return ChartSummaryResponse(**result)
    except Exception as e:
        logger.error("Chart summary failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Full Pipeline (Stage 2.5 + Stage 3 chained)
# ---------------------------------------------------------------------------

@router.post("/run-full", response_model=FullAnalysisResult)
async def run_full_analysis(
    request: FullAnalysisRequest,
    analyzer: ZoneAnalyzer = Depends(get_zone_analyzer),
    engine: DesignEngine = Depends(get_design_engine),
    _user: UserResponse = Depends(get_current_user),
):
    """Run the full analysis pipeline: Stage 2.5 → Stage 3."""
    try:
        # Stage 2.5
        zone_request = ZoneAnalysisRequest(
            indicator_definitions=request.indicator_definitions,
            zone_statistics=request.zone_statistics,
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
async def run_full_analysis_async(request: FullAnalysisRequest, _user: UserResponse = Depends(get_current_user)):
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

async def _execute_project_pipeline(
    request: ProjectPipelineRequest,
    analyzer: ZoneAnalyzer,
    engine: DesignEngine,
    calculator: MetricsCalculator,
    manager: MetricsManager,
) -> AsyncGenerator[dict[str, Any], None]:
    """Shared pipeline runner. Yields progress events, finally yields a
    ``{"type": "result", ...}`` event containing the full ProjectPipelineResult.

    Event shapes:
      {"type": "status",   "step": str, "detail": str, "status": "completed"|"failed"|"skipped"}
      {"type": "progress", "step": "run_calculations",
                           "current": int, "total": int,
                           "image_id": str, "image_filename": str,
                           "succeeded": int, "failed": int, "cached": int}
      {"type": "result",   "data": ProjectPipelineResult dict}
      {"type": "error",    "message": str}
    """
    steps: list[ProjectPipelineProgress] = []
    projects_store = get_projects_store()

    # 1. Look up project
    project = projects_store.get(request.project_id)
    if not project:
        yield {"type": "error", "message": f"Project not found: {request.project_id}"}
        return

    # 2. Validate indicator_ids
    valid_ids = [ind for ind in request.indicator_ids if manager.has_calculator(ind)]
    if not valid_ids:
        yield {"type": "error", "message": "No valid calculator found for any of the provided indicator_ids"}
        return
    if len(valid_ids) < len(request.indicator_ids):
        skipped_ids = set(request.indicator_ids) - set(valid_ids)
        detail = f"Skipped unknown indicators: {', '.join(skipped_ids)}"
    else:
        detail = f"{len(valid_ids)} indicators validated"
    steps.append(ProjectPipelineProgress(step="validate_indicators", status="completed", detail=detail))
    yield {"type": "status", "step": "validate_indicators", "status": "completed", "detail": detail}

    # 3. Filter to zone-assigned images
    assigned_images = [img for img in project.uploaded_images if img.zone_id]
    if not assigned_images:
        yield {"type": "error", "message": "No images assigned to zones in this project"}
        return

    total_images = len(project.uploaded_images)
    n_unassigned = total_images - len(assigned_images)
    filter_detail = f"{len(assigned_images)} of {total_images} images assigned to zones"
    if n_unassigned:
        filter_detail += f" ({n_unassigned} unassigned — will still get per-image metrics for clustering)"
    steps.append(ProjectPipelineProgress(step="filter_images", status="completed", detail=filter_detail))
    yield {"type": "status", "step": "filter_images", "status": "completed", "detail": filter_detail}

    # 4. Run calculations (use semantic_map when available, plus FMB layers)
    calc_run = 0
    calc_ok = 0
    calc_fail = 0
    calc_cached = 0

    # Always clear previous results so every pipeline run produces fresh calculations
    for img in project.uploaded_images:
        img.metrics_results.clear()
    calculator.clear_cache()

    # Split images: only calculate on those with a semantic_map from Vision API.
    # Images without semantic_map would fall back to the raw JPG, producing
    # meaningless zeros (raw photo pixels don't match semantic colour codes).
    has_semantic = [img for img in project.uploaded_images if img.mask_filepaths.get("semantic_map")]
    no_semantic_images = [img for img in project.uploaded_images if not img.mask_filepaths.get("semantic_map")]
    if no_semantic_images:
        logger.info(
            "Skipping %d/%d images without semantic_map (not yet analysed by Vision API): %s",
            len(no_semantic_images), len(project.uploaded_images),
            [img.filename for img in no_semantic_images[:5]],
        )

    # Track all skipped images with reasons for user feedback
    skipped_list: list[SkippedImage] = [
        SkippedImage(image_id=img.image_id, filename=img.filename, reason="no_semantic_map")
        for img in no_semantic_images
    ]

    # Semantic map validation is done inline (inside the loop) to avoid
    # a slow pre-scan that blocks SSE progress events.
    calc_images = list(has_semantic)
    invalid_images: list = []

    n_total_images = len(calc_images)
    logger.info(
        "Pipeline: %d images with semantic_map, %d without (of %d total)",
        n_total_images, len(no_semantic_images), len(project.uploaded_images),
    )
    img_idx = 0
    for img in calc_images:
        image_path = img.mask_filepaths["semantic_map"]

        # Fast inline validation: check if semantic_map is single-color.
        # A single-color PNG compresses extremely well, so use file size as
        # a fast heuristic (no PIL decode needed). If suspiciously small,
        # do a quick PIL spot-check on a tiny thumbnail.
        try:
            sem_file = Path(image_path)
            file_kb = sem_file.stat().st_size / 1024
            is_invalid = False
            if file_kb < 5:
                # Very small file for any resolution → almost certainly single-color
                is_invalid = True
            elif file_kb < 100:
                # Borderline: do a quick PIL check with a small thumbnail
                with PILImage.open(image_path) as sem_img:
                    thumb = sem_img.resize((32, 32), PILImage.NEAREST).convert("RGB")
                is_invalid = len(set(thumb.getdata())) <= 1
            if is_invalid:
                invalid_images.append(img)
                skipped_list.append(SkippedImage(
                    image_id=img.image_id, filename=img.filename, reason="invalid_semantic_map",
                ))
                logger.warning(
                    "Invalid semantic_map for %s (%s): likely single-color (%.0fKB) — skipping",
                    img.image_id, img.filename, file_kb,
                )
                continue
        except Exception as e:
            logger.warning("Cannot validate semantic_map for %s: %s — skipping", img.image_id, e)
            invalid_images.append(img)
            skipped_list.append(SkippedImage(
                image_id=img.image_id, filename=img.filename, reason="invalid_semantic_map",
            ))
            continue

        img_idx += 1
        logger.info("Calculating image %d/%d: %s (%s)", img_idx, n_total_images - len(invalid_images), img.image_id, img.filename)

        for ind_id in valid_ids:
            # Full layer
            if ind_id in img.metrics_results:
                calc_cached += 1
            else:
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
                if not mask_path:
                    continue
                if layer_key in img.metrics_results:
                    calc_cached += 1
                    continue
                calc_run += 1
                try:
                    result = calculator.calculate_for_layer(ind_id, image_path, mask_path)
                    if result.success and result.value is not None:
                        img.metrics_results[layer_key] = result.value
                        calc_ok += 1
                    else:
                        calc_fail += 1
                        logger.warning("Layer calc failed for %s/%s on %s: %s", ind_id, layer, img.image_id, result.error)
                except Exception as e:
                    calc_fail += 1
                    logger.error("Layer calc exception %s/%s on %s: %s", ind_id, layer, img.image_id, e)

        # Per-image progress event (yielded after all indicators for this image)
        n_valid = n_total_images - len(invalid_images)
        yield {
            "type": "progress",
            "step": "run_calculations",
            "current": img_idx,
            "total": n_valid,
            "image_id": img.image_id,
            "image_filename": img.filename,
            "succeeded": calc_ok,
            "failed": calc_fail,
            "cached": calc_cached,
        }
        # Periodic GC to prevent PIL/numpy memory buildup during long batch runs
        if img_idx % 50 == 0:
            gc.collect()
        # Yield control back to the event loop so SSE events actually flush
        # (calculator.calculate is synchronous and CPU-bound).
        await asyncio.sleep(0)

    # Persist calculated metrics to SQLite
    if calc_ok > 0:
        projects_store.save(project)

    n_skip = len(no_semantic_images) + len(invalid_images)
    skip_parts = []
    if no_semantic_images:
        skip_parts.append(f"{len(no_semantic_images)} no semantic_map")
    if invalid_images:
        skip_parts.append(f"{len(invalid_images)} invalid semantic_map")
    skip_note = f", {n_skip} images skipped ({', '.join(skip_parts)})" if skip_parts else ""
    calc_detail = f"Ran {calc_run} new, {calc_cached} cached: {calc_ok} succeeded, {calc_fail} failed{skip_note}"
    calc_status = "completed" if calc_ok > 0 or calc_run == 0 else "failed"
    steps.append(ProjectPipelineProgress(step="run_calculations", status=calc_status, detail=calc_detail))
    yield {"type": "status", "step": "run_calculations", "status": calc_status, "detail": calc_detail}

    # 5. Aggregate
    calculator_infos = {ind_id: manager.get_calculator(ind_id) for ind_id in valid_ids if manager.get_calculator(ind_id)}
    zone_statistics, indicator_definitions, image_records = MetricsAggregator.aggregate(
        images=assigned_images,
        zones=project.spatial_zones,
        indicator_ids=valid_ids,
        calculator_infos=calculator_infos,
    )
    agg_detail = f"{len(zone_statistics)} zone-stat records, {len(image_records)} image records from {len(set(s.zone_id for s in zone_statistics))} zones"
    steps.append(ProjectPipelineProgress(step="aggregate", status="completed", detail=agg_detail))
    yield {"type": "status", "step": "aggregate", "status": "completed", "detail": agg_detail}

    # 6. Stage 2.5 — Zone analysis
    zone_result: Optional[ZoneAnalysisResult] = None
    design_result = None

    if zone_statistics:
        try:
            zone_request = ZoneAnalysisRequest(
                indicator_definitions=indicator_definitions,
                zone_statistics=zone_statistics,
                image_records=image_records,
            )
            zone_result = analyzer.analyze(zone_request)
            za_detail = f"{len(zone_result.zone_diagnostics)} zone diagnostics"
            steps.append(ProjectPipelineProgress(step="zone_analysis", status="completed", detail=za_detail))
            yield {"type": "status", "step": "zone_analysis", "status": "completed", "detail": za_detail}
        except Exception as e:
            logger.error("Stage 2.5 failed: %s", e, exc_info=True)
            steps.append(ProjectPipelineProgress(step="zone_analysis", status="failed", detail=str(e)))
            yield {"type": "status", "step": "zone_analysis", "status": "failed", "detail": str(e)}
    else:
        steps.append(ProjectPipelineProgress(step="zone_analysis", status="skipped", detail="No zone statistics to analyze"))
        yield {"type": "status", "step": "zone_analysis", "status": "skipped", "detail": "No zone statistics to analyze"}

    # 7. Stage 3 — Design strategies (non-fatal)
    if request.run_stage3 and zone_result:
        yield {"type": "status", "step": "design_strategies", "status": "running", "detail": "Generating design strategies…"}
        try:
            project_context = ProjectContext(
                project={
                    "name": project.project_name,
                    "location": project.project_location or None,
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
            ds_detail = f"{len(design_result.zones)} zones with strategies"
            steps.append(ProjectPipelineProgress(step="design_strategies", status="completed", detail=ds_detail))
            yield {"type": "status", "step": "design_strategies", "status": "completed", "detail": ds_detail}
        except Exception as e:
            logger.error("Stage 3 failed (non-fatal): %s", e, exc_info=True)
            steps.append(ProjectPipelineProgress(step="design_strategies", status="failed", detail=str(e)))
            yield {"type": "status", "step": "design_strategies", "status": "failed", "detail": str(e)}
    elif not request.run_stage3:
        steps.append(ProjectPipelineProgress(step="design_strategies", status="skipped", detail="Stage 3 disabled"))
        yield {"type": "status", "step": "design_strategies", "status": "skipped", "detail": "Stage 3 disabled"}
    else:
        steps.append(ProjectPipelineProgress(step="design_strategies", status="skipped", detail="No zone analysis result"))
        yield {"type": "status", "step": "design_strategies", "status": "skipped", "detail": "No zone analysis result"}

    final = ProjectPipelineResult(
        project_id=request.project_id,
        project_name=project.project_name,
        total_images=len(project.uploaded_images),
        zone_assigned_images=len(assigned_images),
        calculations_run=calc_run,
        calculations_succeeded=calc_ok,
        calculations_failed=calc_fail,
        calculations_cached=calc_cached,
        zone_statistics_count=len(zone_statistics),
        skipped_images=skipped_list,
        zone_analysis=zone_result,
        design_strategies=design_result,
        steps=steps,
    )
    # Strip image_records before sending — they're 1 row per (image × indicator × layer)
    # and can easily run to 5–10 MB for a 1000+ image project. A single SSE event that
    # large risks being truncated by intermediate buffers/proxies, which would silently
    # drop the entire result event. The frontend reconstructs image_records from
    # project.uploaded_images[].metrics_results, which it already has.
    result_dict = final.model_dump(mode="json")
    za = result_dict.get("zone_analysis")
    if isinstance(za, dict):
        za["image_records"] = []

    # Persist analysis artefacts onto the project so they survive page reloads
    # and project switches. Stored as the same dicts the frontend consumes.
    if zone_result is not None or design_result is not None:
        project.zone_analysis_result = za if isinstance(za, dict) else None
        ds = result_dict.get("design_strategies")
        project.design_strategy_result = ds if isinstance(ds, dict) else None
        # A fresh pipeline run invalidates any previously generated AI report —
        # the source data has changed.
        project.ai_report = None
        project.ai_report_meta = None
        project.analysis_results_updated_at = datetime.now()
        projects_store.save(project)

    yield {"type": "result", "data": result_dict}


@router.post("/project-pipeline", response_model=ProjectPipelineResult)
async def run_project_pipeline(
    request: ProjectPipelineRequest,
    analyzer: ZoneAnalyzer = Depends(get_zone_analyzer),
    engine: DesignEngine = Depends(get_design_engine),
    calculator: MetricsCalculator = Depends(get_metrics_calculator),
    manager: MetricsManager = Depends(get_metrics_manager),
    _user: UserResponse = Depends(get_current_user),
):
    """Run the full project pipeline: per-image calculations → aggregate → Stage 2.5 → Stage 3."""
    final_result: Optional[dict] = None
    async for event in _execute_project_pipeline(request, analyzer, engine, calculator, manager):
        if event.get("type") == "error":
            raise HTTPException(
                status_code=404 if "not found" in event["message"].lower() else 400,
                detail=event["message"],
            )
        if event.get("type") == "result":
            final_result = event["data"]

    if final_result is None:
        raise HTTPException(status_code=500, detail="Pipeline finished without producing a result")
    return ProjectPipelineResult(**final_result)


@router.post("/project-pipeline/stream")
async def run_project_pipeline_stream(
    request: ProjectPipelineRequest,
    analyzer: ZoneAnalyzer = Depends(get_zone_analyzer),
    engine: DesignEngine = Depends(get_design_engine),
    calculator: MetricsCalculator = Depends(get_metrics_calculator),
    manager: MetricsManager = Depends(get_metrics_manager),
    _user: UserResponse = Depends(get_current_user),
):
    """Stream project pipeline progress via Server-Sent Events.

    Emits one ``progress`` event per processed image (so users can see a
    live counter during multi-hour batch runs), plus ``status`` events for
    each pipeline stage boundary, and a final ``result`` event carrying the
    complete ProjectPipelineResult.
    """
    async def event_generator():
        try:
            async for event in _execute_project_pipeline(request, analyzer, engine, calculator, manager):
                yield f"data: {_safe_json(event)}\n\n"
        except Exception as e:
            logger.error("Project pipeline stream crashed: %s", e, exc_info=True)
            yield f"data: {_safe_json({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
