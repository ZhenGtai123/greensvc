"""Pydantic models for API schemas"""

from .project import (
    SpatialZone,
    UploadedImage,
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectQuery,
)
from .indicator import (
    IndicatorDefinition,
    IndicatorRecommendation,
    RecommendationRequest,
    RecommendationResponse,
)
from .vision import (
    VisionAnalysisRequest,
    VisionAnalysisResponse,
    SemanticClass,
)
from .metrics import (
    CalculatorInfo,
    CalculationRequest,
    CalculationResult,
    BatchCalculationResponse,
)
from .user import (
    UserBase,
    UserCreate,
    UserLogin,
    UserResponse,
    UserInDB,
    Token,
    TokenPayload,
)

__all__ = [
    # Project
    "SpatialZone",
    "UploadedImage",
    "ProjectCreate",
    "ProjectUpdate",
    "ProjectResponse",
    "ProjectQuery",
    # Indicator
    "IndicatorDefinition",
    "IndicatorRecommendation",
    "RecommendationRequest",
    "RecommendationResponse",
    # Vision
    "VisionAnalysisRequest",
    "VisionAnalysisResponse",
    "SemanticClass",
    # Metrics
    "CalculatorInfo",
    "CalculationRequest",
    "CalculationResult",
    "BatchCalculationResponse",
    # User
    "UserBase",
    "UserCreate",
    "UserLogin",
    "UserResponse",
    "UserInDB",
    "Token",
    "TokenPayload",
]
