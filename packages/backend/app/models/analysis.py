"""Pydantic models for Stage 2.5 + Stage 3 analysis pipeline"""

from typing import Optional, Any
from pydantic import BaseModel, Field
from datetime import datetime


# ---------------------------------------------------------------------------
# Shared / Input helpers
# ---------------------------------------------------------------------------

class IndicatorDefinitionInput(BaseModel):
    """Indicator definition provided by the caller (from calculator INDICATOR dict or codebook)."""
    id: str
    name: str
    unit: str = ""
    target_direction: str = "INCREASE"  # INCREASE | DECREASE | NEUTRAL
    definition: str = ""
    category: str = ""


class IndicatorLayerValue(BaseModel):
    """Flat record: one zone x one indicator x one layer."""
    zone_id: str
    zone_name: str
    indicator_id: str
    layer: str  # full | foreground | middleground | background
    n_images: int = 0
    mean: Optional[float] = None
    std: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None
    unit: str = ""
    area_sqm: float = 0


# ---------------------------------------------------------------------------
# Stage 2.5  --  Zone Analysis
# ---------------------------------------------------------------------------

class ZoneAnalysisRequest(BaseModel):
    """Request for Stage 2.5 cross-zone statistical analysis (v6.0 descriptive)."""
    indicator_definitions: dict[str, IndicatorDefinitionInput]
    zone_statistics: list[IndicatorLayerValue]


class EnrichedZoneStat(BaseModel):
    """Zone stat record enriched with Z-score and percentile (v6.0 descriptive)."""
    zone_id: str
    zone_name: str
    indicator_id: str
    layer: str
    unit: str = ""
    n_images: int = 0
    mean: Optional[float] = None
    std: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None
    area_sqm: float = 0
    z_score: Optional[float] = None
    percentile: Optional[float] = None


class ZoneDiagnostic(BaseModel):
    """Diagnostic summary for one zone (v6.0 descriptive — no evaluative fields)."""
    zone_id: str
    zone_name: str
    area_sqm: float = 0
    mean_abs_z: float = 0.0  # descriptive deviation measure
    rank: int = 0  # 1 = most distinctive (highest mean|z|)
    point_count: int = 0
    indicator_status: dict[str, dict[str, Any]] = Field(default_factory=dict)


class ComputationMetadata(BaseModel):
    """Metadata about the Stage 2.5 computation."""
    version: str = "2.5"
    generated_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    system: str = "SceneRx-AI Stage 2.5"
    n_indicators: int = 0
    n_zones: int = 0
    n_segments: int = 0
    layers: list[str] = Field(default_factory=lambda: ["full", "foreground", "middleground", "background"])
    has_spatial_data: bool = False
    has_clustering: bool = False


class ArchetypeProfile(BaseModel):
    """Profile for one KMeans cluster archetype."""
    archetype_id: int
    archetype_label: str = ""
    point_count: int = 0
    centroid_values: dict[str, float] = Field(default_factory=dict)
    centroid_z_scores: dict[str, float] = Field(default_factory=dict)


class SpatialSegment(BaseModel):
    """A spatial segment: one cluster of geo-located image points."""
    segment_id: str
    archetype_id: int
    archetype_label: str = ""
    point_count: int = 0
    point_ids: list[str] = Field(default_factory=list)
    lat_range: list[float] = Field(default_factory=list)
    lng_range: list[float] = Field(default_factory=list)
    centroid_indicators: dict[str, float] = Field(default_factory=dict)
    centroid_z_scores: dict[str, float] = Field(default_factory=dict)
    silhouette_score: float = 0.0


class ClusteringResult(BaseModel):
    """Full clustering output: method, archetypes, spatial segments."""
    method: str = "KMeans + KNN spatial smoothing"
    k: int = 0
    silhouette_score: float = 0.0
    silhouette_scores: list[dict] = Field(default_factory=list)  # [{k, silhouette}, ...]
    spatial_smooth_k: int = 7
    layer_used: str = "full"
    archetype_profiles: list[ArchetypeProfile] = Field(default_factory=list)
    spatial_segments: list[SpatialSegment] = Field(default_factory=list)
    # Per-point data (for before/after-smoothing spatial scatter + future viz)
    point_ids_ordered: list[str] = Field(default_factory=list)
    point_lats: list[float] = Field(default_factory=list)
    point_lngs: list[float] = Field(default_factory=list)
    labels_raw: list[int] = Field(default_factory=list)  # labels before KNN smoothing
    labels_smoothed: list[int] = Field(default_factory=list)  # labels after KNN smoothing
    # Ward hierarchical clustering linkage matrix (for dendrogram). Rows: [id1, id2, dist, count].
    dendrogram_linkage: list[list[float]] = Field(default_factory=list)


class ZoneAnalysisResult(BaseModel):
    """Complete result of Stage 2.5 zone analysis."""
    zone_statistics: list[EnrichedZoneStat] = Field(default_factory=list)
    zone_diagnostics: list[ZoneDiagnostic] = Field(default_factory=list)
    correlation_by_layer: dict[str, dict[str, dict[str, float]]] = Field(default_factory=dict)
    pvalue_by_layer: dict[str, dict[str, dict[str, float]]] = Field(default_factory=dict)
    indicator_definitions: dict[str, IndicatorDefinitionInput] = Field(default_factory=dict)
    layer_statistics: dict[str, dict] = Field(default_factory=dict)
    radar_profiles: dict[str, dict[str, float]] = Field(default_factory=dict)
    computation_metadata: ComputationMetadata = Field(default_factory=ComputationMetadata)
    # Clustering (optional — requires geo-located image points with ≥20 data points)
    segment_diagnostics: list[ZoneDiagnostic] = Field(default_factory=list)
    clustering: Optional[ClusteringResult] = None


# ---------------------------------------------------------------------------
# Stage 3  --  Design Strategies
# ---------------------------------------------------------------------------

class ProjectContext(BaseModel):
    """Project context passed to the design engine."""
    project: dict = Field(default_factory=dict)
    context: dict = Field(default_factory=dict)
    performance_query: dict = Field(default_factory=dict)


class IOMQuery(BaseModel):
    """A single IOM query derived from diagnosis."""
    indicator_id: str
    direction: str  # increase | decrease | maintain
    direction_rationale: str = ""  # v6.0: why this direction
    priority: int = 1
    qualitative_target: str = ""
    constraints: list[str] = Field(default_factory=list)


class MatchedIOM(BaseModel):
    """An IOM record matched to a query, with score and expanded encodings."""
    iom_id: Optional[str] = None
    indicator_id: str = ""
    indicator_name: str = ""
    direction: str = ""
    score: float = 0
    linked_evidence_id: Optional[str] = None
    operation: dict = Field(default_factory=dict)
    predicted_effect: dict = Field(default_factory=dict)
    confidence_expanded: dict = Field(default_factory=dict)
    source_indicator: dict = Field(default_factory=dict)
    # v5.0 — signature-based matching
    signatures: list[dict] = Field(default_factory=list)
    scope: dict = Field(default_factory=dict)
    transferability: dict = Field(default_factory=dict)
    is_descriptive: bool = False
    source_citation: Optional[str] = None


class DesignStrategy(BaseModel):
    """One design strategy for a zone."""
    priority: int = 1
    strategy_name: Optional[str] = ""
    target_indicators: list[str] = Field(default_factory=list)
    spatial_location: Optional[str] = ""
    intervention: dict = Field(default_factory=dict)
    expected_effects: list[dict] = Field(default_factory=list)
    confidence: Optional[str] = ""
    potential_tradeoffs: Optional[str] = ""
    supporting_ioms: list[str] = Field(default_factory=list)
    # v5.0 — signature & evidence detail
    signatures: list[dict] = Field(default_factory=list)
    pathway: dict = Field(default_factory=dict)
    boundary_effects: Optional[str] = None
    transferability_note: Optional[str] = None
    implementation_guidance: Optional[str] = None


class ZoneDesignOutput(BaseModel):
    """Full design output for a single zone (v6.0)."""
    zone_id: str
    zone_name: str = ""
    mean_abs_z: float = 0.0  # v6.0: descriptive deviation
    diagnosis: dict = Field(default_factory=dict)  # v6.0: Agent A's diagnosis + iom_queries
    overall_assessment: str = ""
    matched_ioms: list[MatchedIOM] = Field(default_factory=list)
    design_strategies: list[DesignStrategy] = Field(default_factory=list)
    implementation_sequence: str = ""
    synergies: str = ""


class DesignStrategyRequest(BaseModel):
    """Request for Stage 3 design strategy generation."""
    zone_analysis: ZoneAnalysisResult
    project_context: ProjectContext = Field(default_factory=ProjectContext)
    allowed_indicator_ids: list[str] = Field(default_factory=list)
    use_llm: bool = True
    max_ioms_per_query: int = Field(default=6, ge=1, le=20)
    max_strategies_per_zone: int = Field(default=5, ge=1, le=10)


class DesignStrategyResult(BaseModel):
    """Complete result of Stage 3 design strategy generation."""
    zones: dict[str, ZoneDesignOutput] = Field(default_factory=dict)
    metadata: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Agent C  --  Report Generation
# ---------------------------------------------------------------------------

class ReportRequest(BaseModel):
    """Request for comprehensive report generation (Agent C)."""
    zone_analysis: ZoneAnalysisResult
    design_strategies: Optional[DesignStrategyResult] = None
    stage1_recommendations: Optional[list[dict]] = None
    project_context: ProjectContext = Field(default_factory=ProjectContext)
    format: str = "markdown"  # markdown | pdf


class ReportResult(BaseModel):
    """Generated report output."""
    content: str = ""
    format: str = "markdown"
    metadata: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Full pipeline (chained)
# ---------------------------------------------------------------------------

class FullAnalysisRequest(BaseModel):
    """Request that chains Stage 2.5 + Stage 3."""
    indicator_definitions: dict[str, IndicatorDefinitionInput]
    zone_statistics: list[IndicatorLayerValue]
    project_context: ProjectContext = Field(default_factory=ProjectContext)
    allowed_indicator_ids: list[str] = Field(default_factory=list)
    use_llm: bool = True
    max_ioms_per_query: int = Field(default=6, ge=1, le=20)
    max_strategies_per_zone: int = Field(default=5, ge=1, le=10)


class FullAnalysisResult(BaseModel):
    """Combined result of Stage 2.5 + Stage 3."""
    zone_analysis: ZoneAnalysisResult
    design_strategies: DesignStrategyResult


# ---------------------------------------------------------------------------
# Project Pipeline (images → calculators → aggregation → analysis)
# ---------------------------------------------------------------------------

class ProjectPipelineRequest(BaseModel):
    """Request for the project pipeline endpoint."""
    project_id: str
    indicator_ids: list[str]
    run_stage3: bool = True
    use_llm: bool = False
    max_ioms_per_query: int = Field(default=6, ge=1, le=20)
    max_strategies_per_zone: int = Field(default=5, ge=1, le=10)


class ProjectPipelineProgress(BaseModel):
    """Progress step in the project pipeline."""
    step: str
    status: str  # completed | skipped | failed
    detail: str = ""


class ProjectPipelineResult(BaseModel):
    """Complete result of the project pipeline."""
    project_id: str
    project_name: str
    total_images: int = 0
    zone_assigned_images: int = 0
    calculations_run: int = 0
    calculations_succeeded: int = 0
    calculations_failed: int = 0
    calculations_cached: int = 0
    zone_statistics_count: int = 0
    zone_analysis: Optional[ZoneAnalysisResult] = None
    design_strategies: Optional[DesignStrategyResult] = None
    steps: list[ProjectPipelineProgress] = Field(default_factory=list)
