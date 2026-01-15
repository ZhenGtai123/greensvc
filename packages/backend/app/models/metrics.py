"""Metrics calculation Pydantic models"""

from typing import Optional, Any
from pydantic import BaseModel, Field


class CalculatorInfo(BaseModel):
    """Information about a calculator module"""
    id: str
    name: str
    unit: str = ""
    formula: str = ""
    target_direction: str = ""
    definition: str = ""
    category: str = ""
    calc_type: str = ""
    target_classes: list[str] = Field(default_factory=list)
    filepath: str = ""
    filename: str = ""


class CalculationRequest(BaseModel):
    """Request for metric calculation"""
    indicator_id: str
    image_paths: list[str]


class CalculationResult(BaseModel):
    """Result of a single metric calculation"""
    success: bool
    indicator_id: str = ""
    indicator_name: str = ""
    value: Optional[float] = None
    unit: str = ""
    target_pixels: Optional[int] = None
    total_pixels: Optional[int] = None
    class_breakdown: dict[str, int] = Field(default_factory=dict)
    error: Optional[str] = None
    image_path: str = ""


class BatchCalculationResponse(BaseModel):
    """Response for batch calculation"""
    success: bool
    indicator_id: str
    indicator_name: str
    unit: str = ""
    total_images: int = 0
    successful_calculations: int = 0
    failed_calculations: int = 0
    results: list[CalculationResult] = Field(default_factory=list)

    # Statistics
    mean_value: Optional[float] = None
    std_value: Optional[float] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None

    error: Optional[str] = None


class ZoneStatistics(BaseModel):
    """Statistics for a single zone"""
    zone_id: str
    zone_name: str
    indicator_id: str
    n_images: int = 0
    mean: Optional[float] = None
    std: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None
    median: Optional[float] = None

    # Layer breakdown
    full_mean: Optional[float] = None
    foreground_mean: Optional[float] = None
    middleground_mean: Optional[float] = None
    background_mean: Optional[float] = None


class CalculationReport(BaseModel):
    """Full calculation report"""
    computation_metadata: dict = Field(default_factory=dict)
    indicator_definition: dict = Field(default_factory=dict)
    computation_summary: dict = Field(default_factory=dict)
    descriptive_statistics_overall: dict = Field(default_factory=dict)
    zone_statistics: list[ZoneStatistics] = Field(default_factory=list)
    raw_results: list[CalculationResult] = Field(default_factory=list)
