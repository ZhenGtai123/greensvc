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


class IndicatorRecommendation(BaseModel):
    """Single indicator recommendation from Gemini"""
    indicator_id: str
    indicator_name: str
    relevance_score: float = Field(ge=0, le=1)
    rationale: str
    evidence_ids: list[str] = Field(default_factory=list)
    relationship_direction: str = ""
    confidence: str = ""


class RecommendationRequest(BaseModel):
    """Request for indicator recommendations"""
    project_name: str
    project_location: str = ""
    space_type_id: str = ""
    koppen_zone_id: str = ""
    performance_dimensions: list[str] = Field(default_factory=list)
    subdimensions: list[str] = Field(default_factory=list)
    design_brief: str = ""
    max_recommendations: int = Field(default=10, ge=1, le=50)


class RecommendationResponse(BaseModel):
    """Response with indicator recommendations"""
    success: bool
    recommendations: list[IndicatorRecommendation] = Field(default_factory=list)
    total_evidence_reviewed: int = 0
    model_used: str = ""
    error: Optional[str] = None
