"""Indicator-related Pydantic models"""

from typing import Optional
from pydantic import BaseModel, Field


class IndicatorDefinition(BaseModel):
    """Indicator definition from calculator file"""
    id: str
    name: str
    unit: str = ""
    formula: str = ""
    target_direction: str = ""
    definition: str = ""
    category: str = ""
    calc_type: str = ""
    target_classes: list[str] = Field(default_factory=list)
    note: str = ""


class EvidenceCitation(BaseModel):
    """Citation detail for a recommended indicator."""
    evidence_id: str
    citation: str = ""
    year: int | None = None
    doi: str = ""
    direction: str = ""
    effect_size: str = ""
    confidence: str = ""


class TransferabilitySummary(BaseModel):
    """Pre-computed transferability profile for an indicator's evidence."""
    high_count: int = 0
    moderate_count: int = 0
    low_count: int = 0
    unknown_count: int = 0


class EvidenceSummary(BaseModel):
    """Agent 1 assessment card condensed into the final output."""
    evidence_ids: list[str] = Field(default_factory=list)
    inferential_count: int = 0
    descriptive_count: int = 0
    strength_score: str = ""        # A / B / C
    strongest_tier: str = ""        # TIR_T1 / TIR_T2 / TIR_T3
    best_significance: str = ""     # SIG_001 / SIG_01 / SIG_05 / SIG_NS
    dominant_direction: str = ""    # DIR_POS / DIR_NEG / DIR_MIX


class IndicatorRelationship(BaseModel):
    """Relationship between two recommended indicators."""
    indicator_a: str
    indicator_b: str
    relationship_type: str = ""  # SYNERGISTIC / TRADE_OFF / INDEPENDENT
    explanation: str = ""


class RecommendationSummary(BaseModel):
    key_findings: list[str] = Field(default_factory=list)
    evidence_gaps: list[str] = Field(default_factory=list)
    transferability_caveats: list[str] = Field(default_factory=list)
    dimension_coverage: list[dict] = Field(default_factory=list)


class IndicatorRecommendation(BaseModel):
    """Single indicator recommendation from LLM"""
    indicator_id: str
    indicator_name: str
    relevance_score: float = Field(default=0, ge=0, le=1)
    rationale: str = ""
    evidence_ids: list[str] = Field(default_factory=list)
    evidence_citations: list[EvidenceCitation] = Field(default_factory=list)
    rank: int = 0
    relationship_direction: str = ""  # INCREASE / DECREASE
    confidence: str = ""  # high / medium / low
    # New fields from two-agent pipeline
    strength_score: str = ""          # A / B / C
    evidence_summary: EvidenceSummary | None = None
    transferability_summary: TransferabilitySummary | None = None
    dimension_id: str = ""
    subdimension_id: str = ""


class RecommendationRequest(BaseModel):
    """Request for indicator recommendations"""
    project_name: str
    project_location: str = ""
    space_type_id: str = ""
    koppen_zone_id: str = ""
    lcz_type_id: str = ""
    age_group_id: str = ""
    performance_dimensions: list[str] = Field(default_factory=list)
    subdimensions: list[str] = Field(default_factory=list)
    design_brief: str = ""
    max_recommendations: int = Field(default=10, ge=1, le=50)
    # When set, the resulting Stage 1 output is persisted onto the project
    # (recommendations + relationships + summary + an initial
    # selected_indicators seeded from the recommendations themselves).
    project_id: Optional[str] = None


class RecommendationResponse(BaseModel):
    """Response with indicator recommendations"""
    success: bool
    recommendations: list[IndicatorRecommendation] = Field(default_factory=list)
    indicator_relationships: list[IndicatorRelationship] = Field(default_factory=list)
    summary: RecommendationSummary | None = None
    total_evidence_reviewed: int = 0
    model_used: str = ""
    error: Optional[str] = None
