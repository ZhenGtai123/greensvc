"""Vision analysis Pydantic models"""

from typing import Optional, Any
from pydantic import BaseModel, Field


class SemanticClass(BaseModel):
    """Single semantic class configuration"""
    name: str
    color: str  # Hex color code
    countable: int = 0  # 0 or 1
    openness: int = 0  # 0 or 1


class VisionAnalysisRequest(BaseModel):
    """Request for vision analysis"""
    image_id: str = ""
    semantic_classes: list[str]
    semantic_countability: list[int]
    openness_list: list[int]
    encoder: str = Field(default="vitb", pattern="^(vitb|vitl|vits)$")
    segmentation_mode: str = Field(default="single_label", pattern="^(single_label|instance)$")
    detection_threshold: float = Field(default=0.3, ge=0.1, le=0.9)
    min_object_area_ratio: float = Field(default=0.0001, ge=0, le=1)
    enable_hole_filling: bool = False
    enable_median_blur: bool = True


class VisionAnalysisResponse(BaseModel):
    """Response from vision analysis"""
    status: str
    image_path: str = ""
    processing_time: float = 0.0
    encoder: str = ""
    segmentation_mode: str = ""
    hole_filling_enabled: bool = False
    image_count: int = 0

    # Statistics
    statistics: dict = Field(default_factory=dict)

    # Image data (bytes from Vision API — excluded from JSON serialization)
    images: dict[str, Any] = Field(default_factory=dict, exclude=True)

    # Mask file paths (populated after saving masks to disk)
    mask_paths: dict[str, str] = Field(default_factory=dict)

    # Instance detection results
    instances: list[dict] = Field(default_factory=list)

    # Error info
    error: Optional[str] = None


class SemanticConfig(BaseModel):
    """Full semantic configuration"""
    classes: list[SemanticClass] = Field(default_factory=list)

    def get_class_names(self) -> list[str]:
        return [c.name for c in self.classes]

    def get_countability(self) -> list[int]:
        return [c.countable for c in self.classes]

    def get_openness(self) -> list[int]:
        return [c.openness for c in self.classes]

    def get_colors_dict(self) -> dict[str, tuple[int, int, int]]:
        """Get mapping of class name to RGB tuple"""
        result = {}
        for cls in self.classes:
            hex_color = cls.color.lstrip('#')
            rgb = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
            result[cls.name] = rgb
        return result
