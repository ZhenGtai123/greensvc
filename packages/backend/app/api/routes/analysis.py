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
from pydantic import BaseModel, Field

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
    # v4 / Phase A — multi-view payload for within-zone clustering. Keyed by
    # viewId; the frontend's segmented control reads this dict to populate
    # all available views in one round-trip. Conventions:
    #   "parent_zones"          → N parent zones aggregated (zone-level view
    #                             of within-zone clustering)
    #   "all_sub_clusters"      → flat NK sub-clusters (the legacy view that
    #                             `zone_analysis` mirrors above for backward
    #                             compat with older frontend builds)
    #   "within_zone:<zone_id>" → K sub-clusters of one parent zone, for
    #                             drill-down. One entry per parent zone that
    #                             actually got clustered.
    # Single-zone /clustering/by-project endpoint leaves this empty (its
    # only view is the legacy `zone_analysis`).
    analysis_views: dict[str, ZoneAnalysisResult] = Field(default_factory=dict)
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

        # v4.1 — PERSIST the clustering payload into the project's
        # zone_analysis_result so the nature-bundle export (and any other
        # backend consumer) can render the 8 cluster-diagnostic charts.
        # Previously only the frontend kept this state in React; the bundle
        # export read from the DB and saw an empty `clustering` field, so
        # the backend silently skipped all E-section charts and the
        # frontend fell back to live-DOM Recharts SVGs — locking users
        # into the OLD chart style for everything cluster-related until
        # the FE was rebuilt.
        try:
            # v4.7 — STOP overwriting zone_analysis_result.
            # Persist the cluster-rebuilt payload under the
            # `cluster_view` sub-key so the original zone-level result
            # (e.g. 1 user zone) survives. The Reports page reads
            # top-level fields and now sees the correct zone count;
            # the nature-bundle endpoint switches to `cluster_view`
            # when the request asks for cluster mode.
            if project.zone_analysis_result is None:
                project.zone_analysis_result = {}
            if cluster_zone_analysis is not None:
                project.zone_analysis_result["cluster_view"] = (
                    cluster_zone_analysis.model_dump()
                )
            # Also keep the raw clustering payload + segment_diagnostics
            # at the top level so cluster-diagnostic charts (silhouette,
            # dendrogram, etc.) that consume `zar.clustering` directly
            # still find it in zone view too.
            project.zone_analysis_result["clustering"] = (
                clustering_result.model_dump()
            )
            project.zone_analysis_result["segment_diagnostics"] = [
                s.model_dump() for s in segment_diagnostics
            ]
            projects_store.save(project)
            logger.info(
                "Clustering persisted to project %s (k=%d, n_points=%d)",
                project.id, clustering_result.k,
                len(clustering_result.point_ids_ordered),
            )
        except Exception as e:
            # Non-fatal — bundle export will fall back to FE Recharts.
            logger.error("Failed to persist clustering to project: %s",
                         e, exc_info=True)

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


def _build_grouped_zone_analysis(
    project,
    img_to_unit: dict[str, "tuple[str, str]"],
    indicator_definitions: dict[str, IndicatorDefinitionInput],
    indicator_ids: list[str],
    analyzer: ZoneAnalyzer,
    *,
    zone_source: str = "cluster",
) -> Optional[ZoneAnalysisResult]:
    """Generic helper: aggregate per-image indicator values into "zone-level"
    statistics keyed by an arbitrary unit_id taken from ``img_to_unit``.

    The view-specific builders below all share this aggregation pipeline; they
    differ only in how each image is mapped to its grouping unit:

      - ``_build_within_zone_cluster_analysis`` → image → ``zone_id__subN``
      - ``_build_parent_zone_analysis``         → image → ``parent_zone_id``
      - ``_build_within_zone_subset_analysis``  → image → ``zone_id__subN`` (one zone only)

    Returns None if no image has any indicator value to contribute.
    """
    from collections import defaultdict

    grouped: dict[tuple[str, str, str], list[float]] = defaultdict(list)
    image_records: list[ImageRecord] = []
    unit_names: dict[str, str] = {}

    for img in project.uploaded_images:
        unit = img_to_unit.get(img.image_id)
        if unit is None:
            continue
        unit_id, unit_name = unit
        unit_names[unit_id] = unit_name
        if not img.metrics_results:
            continue
        for ind_id in indicator_ids:
            val = img.metrics_results.get(ind_id)
            if val is not None:
                grouped[(unit_id, ind_id, "full")].append(val)
                image_records.append(ImageRecord(
                    image_id=img.image_id, zone_id=unit_id, zone_name=unit_name,
                    indicator_id=ind_id, layer="full", value=val,
                    lat=img.latitude, lng=img.longitude,
                ))
            for layer in ("foreground", "middleground", "background"):
                v = img.metrics_results.get(f"{ind_id}__{layer}")
                if v is not None:
                    grouped[(unit_id, ind_id, layer)].append(v)
                    image_records.append(ImageRecord(
                        image_id=img.image_id, zone_id=unit_id, zone_name=unit_name,
                        indicator_id=ind_id, layer=layer, value=v,
                        lat=img.latitude, lng=img.longitude,
                    ))

    if not grouped:
        return None

    zone_statistics: list[IndicatorLayerValue] = []
    for (unit_id, ind_id, layer), values in grouped.items():
        arr = np.array(values, dtype=float)
        n = len(values)
        zone_statistics.append(IndicatorLayerValue(
            zone_id=unit_id,
            zone_name=unit_names.get(unit_id, unit_id),
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

    req = ZoneAnalysisRequest(
        indicator_definitions=indicator_definitions,
        zone_statistics=zone_statistics,
        image_records=image_records,
    )
    result = analyzer.analyze(req)
    result.zone_source = zone_source
    result.analysis_mode = "zone_level"
    return result


def _build_parent_zone_analysis(
    project,
    cluster_results_by_zone: dict[str, "tuple[ClusteringResult, list[ZoneDiagnostic]]"],
    indicator_definitions: dict[str, IndicatorDefinitionInput],
    indicator_ids: list[str],
    analyzer: ZoneAnalyzer,
) -> Optional[ZoneAnalysisResult]:
    """Build the "parent_zones" view: each parent zone is a single grouping
    unit, aggregating across all of that zone's images (including images that
    fell into different sub-clusters during HDBSCAN). Used by the multi-zone
    within-zone clustering Reports view to give the user a "here are the N
    parent zones at a glance" perspective before drilling into sub-clusters.
    """
    img_to_unit: dict[str, tuple[str, str]] = {}
    zone_name_by_id = {z.zone_id: (z.zone_name or z.zone_id) for z in project.spatial_zones}
    # Only include images that were actually clustered (skip too-small zones
    # that didn't run HDBSCAN — those would muddy the parent-zone view since
    # their images aren't part of the within-zone analysis at all).
    for zone_id, (clustering, _diags) in cluster_results_by_zone.items():
        zone_name = zone_name_by_id.get(zone_id, zone_id)
        for pid in clustering.point_ids_ordered:
            img_to_unit[pid] = (zone_id, zone_name)

    # Use zone_source='zone' (not 'cluster') because in this view each unit
    # is a real user-defined parent zone, not a cluster-derived virtual zone.
    return _build_grouped_zone_analysis(
        project, img_to_unit, indicator_definitions, indicator_ids, analyzer,
        zone_source="zone",
    )


def _build_within_zone_subset_analysis(
    project,
    target_zone_id: str,
    cluster_results_by_zone: dict[str, "tuple[ClusteringResult, list[ZoneDiagnostic]]"],
    indicator_definitions: dict[str, IndicatorDefinitionInput],
    indicator_ids: list[str],
    analyzer: ZoneAnalyzer,
) -> Optional[ZoneAnalysisResult]:
    """Build the "within_zone:<zone_id>" view: K sub-clusters of a single
    parent zone, with no other zones' sub-clusters mixed in. This is the
    drill-down view: user picks a specific parent zone from the segmented
    control's expanded list and sees only its internal heterogeneity.
    """
    if target_zone_id not in cluster_results_by_zone:
        return None
    img_to_unit: dict[str, tuple[str, str]] = {}
    zone_name_by_id = {z.zone_id: (z.zone_name or z.zone_id) for z in project.spatial_zones}
    zone_name = zone_name_by_id.get(target_zone_id, target_zone_id)
    clustering, _diags = cluster_results_by_zone[target_zone_id]
    for pid, cid in zip(clustering.point_ids_ordered, clustering.labels_smoothed):
        sub_id = f"{target_zone_id}__sub{int(cid)}"
        sub_name = f"{zone_name} · sub-cluster {int(cid)}"
        img_to_unit[pid] = (sub_id, sub_name)

    return _build_grouped_zone_analysis(
        project, img_to_unit, indicator_definitions, indicator_ids, analyzer,
        zone_source="cluster",
    )


def _build_within_zone_cluster_analysis(
    project,
    cluster_results_by_zone: dict[str, "tuple[ClusteringResult, list[ZoneDiagnostic]]"],
    indicator_definitions: dict[str, IndicatorDefinitionInput],
    indicator_ids: list[str],
    analyzer: ZoneAnalyzer,
) -> Optional[ZoneAnalysisResult]:
    """Build the "all_sub_clusters" view: every sub-cluster across every
    parent zone treated as a separate grouping unit (NK total).

    For each user zone we already ran HDBSCAN separately and got back a
    ClusteringResult. This helper maps every image to a sub-zone id of the
    form ``{zone_id}__sub{cid}``, then delegates aggregation to the shared
    ``_build_grouped_zone_analysis``.

    The returned ZoneAnalysisResult has ``analysis_mode='zone_level'`` and
    ``zone_source='cluster'`` so the frontend's existing chart machinery
    treats every sub-zone exactly like a real zone.
    """
    img_to_unit: dict[str, tuple[str, str]] = {}
    zone_name_by_id = {z.zone_id: (z.zone_name or z.zone_id) for z in project.spatial_zones}
    for zone_id, (clustering, _diags) in cluster_results_by_zone.items():
        zone_name = zone_name_by_id.get(zone_id, zone_id)
        for pid, cid in zip(clustering.point_ids_ordered, clustering.labels_smoothed):
            sub_zone_id = f"{zone_id}__sub{int(cid)}"
            sub_zone_name = f"{zone_name} · sub-cluster {int(cid)}"
            img_to_unit[pid] = (sub_zone_id, sub_zone_name)

    return _build_grouped_zone_analysis(
        project, img_to_unit, indicator_definitions, indicator_ids, analyzer,
        zone_source="cluster",
    )


@router.post("/clustering/within-zones", response_model=ClusteringResponse)
def run_clustering_within_zones(
    request: ClusteringByProjectRequest,
    service: ClusteringService = Depends(get_clustering_service),
    manager: MetricsManager = Depends(get_metrics_manager),
    analyzer: ZoneAnalyzer = Depends(get_zone_analyzer),
    _user: UserResponse = Depends(get_current_user),
):
    """Within-zone HDBSCAN: cluster each zone's images independently.

    For multi-zone projects where the user wants to surface intra-zone
    heterogeneity. Output is one composite ZoneAnalysisResult where each
    sub-cluster appears as a virtual zone (zone_id = `{zone_id}__sub{cid}`).
    Zones with too few images to cluster (< min_points) are kept whole, with
    a single sub-zone id `{zone_id}__sub0`.
    """
    projects_store = get_projects_store()
    project = projects_store.get(request.project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {request.project_id}")
    if not project.spatial_zones or len(project.spatial_zones) < 2:
        raise HTTPException(
            status_code=400,
            detail=(
                "Within-zone clustering requires the project to have ≥ 2 zones. "
                "Use /clustering/by-project for single-zone projects."
            ),
        )

    valid_ids = [ind for ind in request.indicator_ids if manager.has_calculator(ind)]
    if not valid_ids:
        raise HTTPException(status_code=400, detail="No valid calculator found for provided indicator_ids")

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

    # Group images by zone
    from collections import defaultdict as _dd
    by_zone: dict[str, list] = _dd(list)
    for img in project.uploaded_images:
        if img.zone_id and img.metrics_results:
            by_zone[img.zone_id].append(img)

    cluster_results_by_zone: dict[str, "tuple[ClusteringResult, list[ZoneDiagnostic]]"] = {}
    n_total_points = 0
    n_total_gps = 0
    n_zones_clustered = 0
    n_zones_too_small = 0

    for zone_id, imgs in by_zone.items():
        # Build point_metrics for this zone's images
        zone_pts: list[dict] = []
        for img in imgs:
            row: dict = {"point_id": img.image_id, "zone_id": img.zone_id}
            if img.latitude is not None and img.longitude is not None:
                row["lat"] = img.latitude
                row["lng"] = img.longitude
                n_total_gps += 1
            has_any = False
            for ind_id in valid_ids:
                key = ind_id if request.layer == "full" else f"{ind_id}__{request.layer}"
                v = img.metrics_results.get(key)
                if v is not None:
                    row[ind_id] = v
                    has_any = True
            if has_any:
                zone_pts.append(row)
        n_total_points += len(zone_pts)

        if len(zone_pts) < request.min_points:
            # Too small to cluster — keep zone whole as a single "sub0"
            n_zones_too_small += 1
            continue

        try:
            res = service.cluster(
                point_metrics=zone_pts,
                indicator_definitions=indicator_definitions,
                layer=request.layer,
                max_k=request.max_k,
                knn_k=request.knn_k,
                min_points=request.min_points,
            )
            if res is not None:
                cluster_results_by_zone[zone_id] = res
                n_zones_clustered += 1
        except Exception as e:
            logger.warning("Within-zone clustering failed for zone %s: %s", zone_id, e)

    # Zones that were too small or failed → assign a synthetic single-cluster
    # result so they still appear as one sub-zone in the output.
    for zone_id, imgs in by_zone.items():
        if zone_id in cluster_results_by_zone:
            continue
        # Fake a 1-cluster ClusteringResult covering all of this zone's images
        from app.models.analysis import ClusteringResult, ArchetypeProfile
        pids = [img.image_id for img in imgs]
        if not pids:
            continue
        labels = [0] * len(pids)
        cluster_results_by_zone[zone_id] = (
            ClusteringResult(
                method="single-cluster fallback (zone too small)",
                k=1,
                silhouette_score=0.0,
                spatial_smooth_k=0,
                layer_used=request.layer,
                archetype_profiles=[ArchetypeProfile(
                    archetype_id=0,
                    archetype_label=f"{zone_name_by_id_for(project, zone_id)} (whole)",
                    point_count=len(pids),
                    centroid_values={},
                    centroid_z_scores={},
                )],
                spatial_segments=[],
                point_ids_ordered=pids,
                point_lats=[], point_lngs=[],
                labels_raw=labels,
                labels_smoothed=labels,
                dendrogram_linkage=[],
            ),
            [],
        )

    if not cluster_results_by_zone:
        return ClusteringResponse(
            skipped=True,
            reason=(
                f"No zone had ≥ {request.min_points} points with indicators. "
                "Run the project pipeline first."
            ),
            n_points_used=n_total_points,
            n_points_with_gps=n_total_gps,
        )

    composite_analysis = _build_within_zone_cluster_analysis(
        project=project,
        cluster_results_by_zone=cluster_results_by_zone,
        indicator_definitions=indicator_definitions,
        indicator_ids=valid_ids,
        analyzer=analyzer,
    )

    if composite_analysis is None:
        return ClusteringResponse(
            skipped=True,
            reason="Could not build within-zone composite analysis (no images mapped).",
            n_points_used=n_total_points,
        )

    # v4 / Phase A — build the additional views in one pass so the frontend
    # can switch between them without round-trips. Total cost: same
    # ZoneAnalyzer pipeline reused per view (~50-200ms each), much cheaper
    # than the LLM phases that follow.
    parent_zone_analysis = _build_parent_zone_analysis(
        project=project,
        cluster_results_by_zone=cluster_results_by_zone,
        indicator_definitions=indicator_definitions,
        indicator_ids=valid_ids,
        analyzer=analyzer,
    )
    per_zone_analyses: dict[str, ZoneAnalysisResult] = {}
    for zone_id in cluster_results_by_zone:
        sub_view = _build_within_zone_subset_analysis(
            project=project,
            target_zone_id=zone_id,
            cluster_results_by_zone=cluster_results_by_zone,
            indicator_definitions=indicator_definitions,
            indicator_ids=valid_ids,
            analyzer=analyzer,
        )
        if sub_view is not None:
            per_zone_analyses[zone_id] = sub_view

    # Assemble the analysis_views dict that the frontend's segmented control
    # reads. Always-present keys: 'all_sub_clusters' (matches the legacy
    # zone_analysis field). Optional: 'parent_zones' (only if at least one
    # zone got clustered, which is implied here since we're past the early
    # return). Per-zone keys are only included when the zone produced a
    # non-empty sub-view.
    views: dict[str, ZoneAnalysisResult] = {"all_sub_clusters": composite_analysis}
    if parent_zone_analysis is not None:
        views["parent_zones"] = parent_zone_analysis
    for zone_id, sub_view in per_zone_analyses.items():
        views[f"within_zone:{zone_id}"] = sub_view

    # Pick the first ClusteringResult for the response's `clustering` field
    # (frontend expects a single object). Frontend will treat the composite
    # zone_analysis as the source of truth for charts.
    first_cl, first_diags = next(iter(cluster_results_by_zone.values()))

    logger.info(
        "clustering/within-zones: project=%s clustered_zones=%d too_small=%d total_pts=%d views=%s",
        request.project_id, n_zones_clustered, n_zones_too_small, n_total_points,
        list(views.keys()),
    )

    return ClusteringResponse(
        clustering=first_cl,
        segment_diagnostics=composite_analysis.segment_diagnostics or first_diags,
        zone_analysis=composite_analysis,
        analysis_views=views,
        n_points_used=n_total_points,
        n_points_with_gps=n_total_gps,
    )


def zone_name_by_id_for(project, zone_id: str) -> str:
    """Helper: pull zone_name out of a project for a given zone_id."""
    for z in project.spatial_zones:
        if z.zone_id == zone_id:
            return z.zone_name or zone_id
    return zone_id


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
            payload = result.model_dump(mode="json")
            # v4 / Module 14 — write to the per-view slot first; mirror to
            # the legacy single field so older frontend builds keep reading
            # whichever view was generated most recently.
            # v4 / Phase C — prefer view_id when present (full multi-view
            # id like 'parent_zones' or 'within_zone:zone_3'); else fall
            # back to the legacy 2-state grouping_mode for older clients.
            slot = (request.view_id or request.grouping_mode) or "zones"
            project.design_strategy_results = {
                **(project.design_strategy_results or {}),
                slot: payload,
            }
            project.design_strategy_result = payload
            # Stage 3 changed → the AI report for the SAME view is now
            # stale; the OTHER view's AI report is unaffected (it was
            # generated against its own strategies).
            (project.ai_reports or {}).pop(slot, None)
            (project.ai_report_metas or {}).pop(slot, None)
            # Legacy single field also gets cleared because it mirrors
            # whichever view was generated last; the per-view dict above
            # is now the authoritative source.
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
            meta = dict(result.metadata or {})
            meta["grouping_mode"] = request.grouping_mode
            # v4 / Module 12 — write to the per-view slot so zones and
            # clusters narratives persist independently. Mirror to the
            # legacy single field too so backward-compat readers (older
            # frontend builds, scripts inspecting project records) still
            # work — they'll see whichever was last written.
            # v4 / Phase C — prefer view_id when present (full multi-view
            # id like 'parent_zones' or 'within_zone:zone_3'); else fall
            # back to the legacy 2-state grouping_mode for older clients.
            slot = (request.view_id or request.grouping_mode) or "zones"
            project.ai_reports = {**(project.ai_reports or {}), slot: result.content}
            project.ai_report_metas = {**(project.ai_report_metas or {}), slot: meta}
            project.ai_report = result.content
            project.ai_report_meta = meta
            project.analysis_results_updated_at = datetime.now()
            store.save(project)
    return result


# ---------------------------------------------------------------------------
# SSE streaming variants — emit per-unit progress for the AI Report flow.
# v4 / Module 13 — the basic non-streaming endpoints above are kept for
# backward compatibility (and for callers that don't care about progress).
# ---------------------------------------------------------------------------


def _sse_event_stream(producer):
    """Wrap an async event producer with SSE framing and a top-level error
    catch so a crash inside the producer surfaces as a structured ``error``
    event instead of an HTTP 500 mid-stream (which the EventSource client
    can't display)."""

    async def gen():
        try:
            async for event in producer():
                yield f"data: {_safe_json(event)}\n\n"
        except Exception as e:
            logger.error("SSE producer crashed: %s", e, exc_info=True)
            yield f"data: {_safe_json({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/design-strategies/stream")
async def generate_design_strategies_stream(
    request: DesignStrategyRequest,
    engine: DesignEngine = Depends(get_design_engine),
    _user: UserResponse = Depends(get_current_user),
):
    """SSE streaming version of /design-strategies.

    Emits one ``progress`` event per sub-step inside the per-unit loop
    (``diagnosis`` → ``strategies`` → ``unit_done`` for each zone/cluster),
    plus a final ``result`` event carrying the full DesignStrategyResult.
    The connection closes naturally once result is sent.
    """

    async def producer() -> AsyncGenerator[dict, None]:
        # asyncio.Queue lets the LLM coroutine and the SSE generator interleave —
        # progress events are flushed to the client as they happen, not buffered
        # until generate_design_strategies returns. We hold the final
        # DesignStrategyResult in a closure-scoped dict so the persistence
        # block below can write it to the project store regardless of how
        # `runner()` exited.
        queue: asyncio.Queue = asyncio.Queue()
        DONE = object()
        captured: dict[str, Any] = {"result": None, "errored": False}

        async def on_progress(event: dict) -> None:
            await queue.put({"type": "progress", **event})

        async def runner():
            try:
                result = await engine.generate_design_strategies(
                    request, on_progress=on_progress
                )
                captured["result"] = result
                await queue.put({"type": "result", "data": result.model_dump(mode="json")})
            except Exception as e:
                captured["errored"] = True
                logger.error("Design strategy stream runner crashed: %s", e, exc_info=True)
                await queue.put({"type": "error", "message": str(e)})
            finally:
                await queue.put(DONE)

        task = asyncio.create_task(runner())
        # initial "started" event so the client can render the progress bar
        # immediately instead of waiting for the first per-unit step.
        unit_total = len(
            request.zone_analysis.segment_diagnostics
            or request.zone_analysis.zone_diagnostics
            or []
        )
        yield {"type": "started", "unit_total": unit_total}

        try:
            while True:
                evt = await queue.get()
                if evt is DONE:
                    break
                yield evt
        finally:
            if not task.done():
                task.cancel()

        # Persist on success — mirror the non-streaming endpoint's bookkeeping
        # so refreshing the page (or switching projects and back) recovers the
        # generated strategies and forces existing AI reports to be regenerated
        # against the new strategies.
        if request.project_id and captured["result"] is not None and not captured["errored"]:
            store = get_projects_store()
            project = store.get(request.project_id)
            if project is not None:
                payload = captured["result"].model_dump(mode="json")
                # v4 / Phase C — prefer view_id when present (full multi-view
                # id like 'parent_zones' or 'within_zone:zone_3'); else fall
                # back to the legacy 2-state grouping_mode for older clients.
                slot = (request.view_id or request.grouping_mode) or "zones"
                project.design_strategy_results = {
                    **(project.design_strategy_results or {}),
                    slot: payload,
                }
                project.design_strategy_result = payload
                # Stage 3 changed for THIS view → drop the matching AI
                # report slot only; the other view's AI report still
                # corresponds to its own (unchanged) strategies.
                (project.ai_reports or {}).pop(slot, None)
                (project.ai_report_metas or {}).pop(slot, None)
                project.ai_report = None
                project.ai_report_meta = None
                project.analysis_results_updated_at = datetime.now()
                store.save(project)

    return _sse_event_stream(producer)


@router.post("/generate-report/stream")
async def generate_report_stream(
    request: ReportRequest,
    report_service: ReportService = Depends(get_report_service),
    _user: UserResponse = Depends(get_current_user),
):
    """SSE streaming version of /generate-report.

    Emits ``started`` → ``progress`` (preparing prompt / awaiting LLM) → ``result``
    so the frontend can show a determinate progress bar even though the report
    itself is one big LLM call. Total time is dominated by the LLM round-trip,
    so the bar moves between known phase boundaries rather than tracking tokens.
    """

    async def producer() -> AsyncGenerator[dict, None]:
        yield {"type": "started"}

        # Phase 1: prompt assembly is fast (<100ms) but emit a marker so the
        # bar shows movement immediately.
        yield {"type": "progress", "phase": "preparing", "label": "Preparing prompt…"}

        # Phase 2: dispatch the LLM call. We don't have token-level streaming
        # here yet, but emitting "awaiting_llm" lets the frontend switch to an
        # indeterminate animation during the wait.
        yield {"type": "progress", "phase": "awaiting_llm", "label": "Calling LLM…"}

        try:
            result = await report_service.generate_report(request)
        except Exception as e:
            yield {"type": "error", "message": str(e)}
            return

        # Persist (mirror non-streaming endpoint).
        if request.project_id:
            store = get_projects_store()
            project = store.get(request.project_id)
            if project is not None:
                meta = dict(result.metadata or {})
                meta["grouping_mode"] = request.grouping_mode
                # v4 / Phase C — prefer view_id when present (full multi-view
                # id like 'parent_zones' or 'within_zone:zone_3'); else fall
                # back to the legacy 2-state grouping_mode for older clients.
                slot = (request.view_id or request.grouping_mode) or "zones"
                project.ai_reports = {**(project.ai_reports or {}), slot: result.content}
                project.ai_report_metas = {**(project.ai_report_metas or {}), slot: meta}
                project.ai_report = result.content
                project.ai_report_meta = meta
                project.analysis_results_updated_at = datetime.now()
                store.save(project)

        yield {"type": "progress", "phase": "rendering", "label": "Finalizing…"}
        yield {"type": "result", "data": result.model_dump(mode="json")}

    return _sse_event_stream(producer)


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
        # v8.0 — pull the ORIGINAL photograph too. Calculators that compute
        # photographic features (colorfulness, brightness, GLCM texture,
        # Canny edges, HSV saturation) need the unmodified RGB photo; the
        # semantic map's discrete class palette compresses every output to
        # near-constant values and made IND_BEA_VIS, IND_BRIGHT, IND_CSI
        # etc. produce values that looked identical across the 1254-image
        # West Lake project. We pass photo_path alongside image_path so
        # each calculator can pick the one it actually needs.
        photo_path = img.filepath
        # v8.0 — also expose the depth map (Depth Anything output, grayscale)
        # for indicators that compute distance/depth statistics, not class
        # ratios. Mapped by the vision pipeline alongside semantic_map.
        depth_path = img.mask_filepaths.get("depth_map")

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
                    # v8.0 — full-image (non-layered) calc routed through
                    # calculate_for_layer with mask_path=None so photo_path
                    # propagation behaves identically to the layered path.
                    # This keeps the photo-vs-semantic dispatch in one place.
                    result = calculator.calculate_for_layer(
                        ind_id, image_path, None,
                        original_photo_path=photo_path,
                        depth_map_path=depth_path,
                    )
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
                    result = calculator.calculate_for_layer(
                        ind_id, image_path, mask_path,
                        original_photo_path=photo_path,
                        depth_map_path=depth_path,
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

    # 7. Stage 3 — Design strategies (non-fatal).
    # v4 / Module 14 — skip Stage 3 in the pipeline for ALL projects (both
    # single-zone and multi-zone). The user must first pick a path on the
    # Reports page entry gate; strategies are then generated on demand
    # for whichever path was picked, with the right grouping_mode and
    # against the right zone_analysis payload:
    #
    #   single-zone path:
    #     - Single View  → autoFireDesignStrategies on pick → zones slot
    #     - Dual View    → handleRunClustering → clusters slot
    #   multi-zone path:
    #     - Zone-only            → autoFireDesignStrategies on pick → zones slot
    #     - Within-zone clustering → handleRunWithinZoneClustering → clusters slot
    #
    # Pre-generating in the pipeline wastes 60-90s of LLM time whenever
    # the user picks a path that invalidates the cached strategies (e.g.,
    # multi-zone user picks Within-zone clustering after pipeline has
    # already produced zone-level strategies). We previously only skipped
    # for single-zone (when analysis_mode == 'image_level'); v4 / Module
    # 14 extends the skip to multi-zone projects too, since their entry
    # gate also gives the user a clustering vs no-clustering choice.
    if zone_result is not None:
        skip_msg = (
            "Skipped — strategies are generated on demand after you pick a path "
            "on the Reports page entry gate (Single View / Dual View for "
            "single-zone, Zone-only / Within-zone for multi-zone)."
        )
        steps.append(ProjectPipelineProgress(step="design_strategies", status="skipped", detail=skip_msg))
        yield {"type": "status", "step": "design_strategies", "status": "skipped", "detail": skip_msg}
    else:
        # No zone_result → Stage 2.5 was itself skipped/failed. Without
        # zone diagnostics we can't run Stage 3 even if the user wanted to.
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
    # CRITICAL — image_records must be:
    #   • STRIPPED from the SSE result event (single SSE frame can be 10MB+
    #     for projects with thousands of images, and intermediate proxies
    #     truncate large frames). The stripped copy goes out over the wire.
    #   • PRESERVED in the persisted zone_analysis_result so that when the
    #     user reloads the Reports page, the GET /api/projects/{id} call
    #     returns image_records and the frontend ChartContext can render
    #     C1 / C3 / C4 (distribution violins, within-zone distribution,
    #     value spatial map) — those charts gate on imageRecords.length.
    #
    # Previously a single za dict was mutated in place, which clobbered
    # image_records in BOTH places and forced the frontend to fall back to
    # rebuildImageRecords(currentProject) — which only worked when
    # uploaded_images[].metrics_results was populated, leading to flaky
    # "Indicator Drill-Down section disappears after refresh" behaviour.
    za_full = result_dict.get("zone_analysis")
    za_for_sse: Optional[dict] = None
    if isinstance(za_full, dict):
        # Shallow copy + replace image_records with [] only for the SSE copy.
        za_for_sse = {**za_full, "image_records": []}

    # Persist analysis artefacts onto the project so they survive page reloads
    # and project switches. Stored as the same dicts the frontend consumes.
    if zone_result is not None or design_result is not None:
        # Save the FULL za (with image_records intact) to the project record.
        project.zone_analysis_result = za_full if isinstance(za_full, dict) else None
        ds = result_dict.get("design_strategies")
        project.design_strategy_result = ds if isinstance(ds, dict) else None
        # A fresh pipeline run invalidates any previously generated AI report —
        # the source data has changed. Clear both the legacy single-slot and
        # the per-view dict slots.
        project.ai_report = None
        project.ai_report_meta = None
        project.ai_reports = {}
        project.ai_report_metas = {}
        project.analysis_results_updated_at = datetime.now()
        projects_store.save(project)

    # SSE event uses the stripped copy of zone_analysis (image_records=[])
    # to keep the wire payload small. The persisted project (just saved
    # above) keeps the full image_records.
    if za_for_sse is not None:
        result_dict = {**result_dict, "zone_analysis": za_for_sse}
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
