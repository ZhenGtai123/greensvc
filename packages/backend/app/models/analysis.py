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
    """Request for Stage 2.5 cross-zone statistical analysis."""
    indicator_definitions: dict[str, IndicatorDefinitionInput]
    zone_statistics: list[IndicatorLayerValue]
    zscore_moderate: float = Field(default=0.5, ge=0)
    zscore_significant: float = Field(default=1.0, ge=0)
    zscore_critical: float = Field(default=1.5, ge=0)


class EnrichedZoneStat(BaseModel):
    """Zone stat record enriched with Z-score, priority, classification."""
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
    priority: int = 0
    classification: str = ""


class ZoneProblem(BaseModel):
    """A single problem identified for a zone (priority >= 4)."""
    indicator_id: str
    indicator_name: str
    layer: str
    value: Optional[float] = None
    unit: str = ""
    z_score: float = 0
    priority: int = 0
    classification: str = ""
    target_direction: str = ""


class ZoneDiagnostic(BaseModel):
    """Diagnostic summary for one zone."""
    zone_id: str
    zone_name: str
    area_sqm: float = 0
    status: str = ""  # Critical | Poor | Moderate | Good
    total_priority: int = 0
    composite_zscore: float = 0.0
    rank: int = 0
    priority_by_layer: dict[str, int] = Field(default_factory=dict)
    problems_by_layer: dict[str, list[ZoneProblem]] = Field(default_factory=dict)
    indicator_status: dict[str, dict[str, Any]] = Field(default_factory=dict)


class ComputationMetadata(BaseModel):
    """Metadata about the Stage 2.5 computation."""
    version: str = "2.5"
    generated_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    system: str = "GreenSVC-AI Stage 2.5"
    n_indicators: int = 0
    n_zones: int = 0
    layers: list[str] = Field(default_factory=lambda: ["full", "foreground", "middleground", "background"])


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


class DesignStrategy(BaseModel):
    """One design strategy for a zone."""
    priority: int = 1
    strategy_name: str = ""
    target_indicators: list[str] = Field(default_factory=list)
    spatial_location: str = ""
    intervention: dict = Field(default_factory=dict)
    expected_effects: list[dict] = Field(default_factory=list)
    confidence: str = ""
    potential_tradeoffs: str = ""
    supporting_ioms: list[str] = Field(default_factory=list)


class ZoneDesignOutput(BaseModel):
    """Full design output for a single zone."""
    zone_id: str
    zone_name: str = ""
    status: str = ""
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
# Full pipeline (chained)
# ---------------------------------------------------------------------------

class FullAnalysisRequest(BaseModel):
    """Request that chains Stage 2.5 + Stage 3."""
    indicator_definitions: dict[str, IndicatorDefinitionInput]
    zone_statistics: list[IndicatorLayerValue]
    project_context: ProjectContext = Field(default_factory=ProjectContext)
    allowed_indicator_ids: list[str] = Field(default_factory=list)
    use_llm: bool = True
    zscore_moderate: float = Field(default=0.5, ge=0)
    zscore_significant: float = Field(default=1.0, ge=0)
    zscore_critical: float = Field(default=1.5, ge=0)
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
    zscore_moderate: float = Field(default=0.5, ge=0)
    zscore_significant: float = Field(default=1.0, ge=0)
    zscore_critical: float = Field(default=1.5, ge=0)
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
    zone_statistics_count: int = 0
    zone_analysis: Optional[ZoneAnalysisResult] = None
    design_strategies: Optional[DesignStrategyResult] = None
    steps: list[ProjectPipelineProgress] = Field(default_factory=list)
