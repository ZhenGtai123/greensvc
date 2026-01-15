"""
API Dependencies
Dependency injection for FastAPI routes
"""

from functools import lru_cache
from typing import Generator

from app.core.config import Settings, get_settings
from app.services.vision_client import VisionModelClient
from app.services.metrics_manager import MetricsManager
from app.services.metrics_calculator import MetricsCalculator
from app.services.knowledge_base import KnowledgeBase
from app.services.gemini_client import GeminiClient


# Settings dependency
def get_settings_dep() -> Settings:
    """Get application settings"""
    return get_settings()


# Service singletons
_vision_client: VisionModelClient = None
_metrics_manager: MetricsManager = None
_metrics_calculator: MetricsCalculator = None
_knowledge_base: KnowledgeBase = None
_gemini_client: GeminiClient = None


def get_vision_client() -> VisionModelClient:
    """Get Vision API client singleton"""
    global _vision_client
    if _vision_client is None:
        settings = get_settings()
        _vision_client = VisionModelClient(settings.vision_api_url)
    return _vision_client


def get_metrics_manager() -> MetricsManager:
    """Get MetricsManager singleton"""
    global _metrics_manager
    if _metrics_manager is None:
        settings = get_settings()
        _metrics_manager = MetricsManager(
            metrics_library_path=str(settings.metrics_library_full_path),
            metrics_code_dir=str(settings.metrics_code_full_path),
        )
    return _metrics_manager


def get_metrics_calculator() -> MetricsCalculator:
    """Get MetricsCalculator singleton"""
    global _metrics_calculator
    if _metrics_calculator is None:
        settings = get_settings()
        _metrics_calculator = MetricsCalculator(
            metrics_code_dir=str(settings.metrics_code_full_path),
        )
        # Load semantic colors if config exists
        semantic_config = settings.data_path / "Semantic_configuration.json"
        if semantic_config.exists():
            _metrics_calculator.load_semantic_colors(str(semantic_config))
    return _metrics_calculator


def get_knowledge_base() -> KnowledgeBase:
    """Get KnowledgeBase singleton"""
    global _knowledge_base
    if _knowledge_base is None:
        settings = get_settings()
        _knowledge_base = KnowledgeBase(
            knowledge_base_dir=str(settings.knowledge_base_full_path),
        )
        _knowledge_base.load()
    return _knowledge_base


def get_gemini_client() -> GeminiClient:
    """Get GeminiClient singleton"""
    global _gemini_client
    if _gemini_client is None:
        settings = get_settings()
        _gemini_client = GeminiClient(
            api_key=settings.google_api_key,
            model=settings.gemini_model,
        )
    return _gemini_client


def reset_services() -> None:
    """Reset all service singletons (useful for testing)"""
    global _vision_client, _metrics_manager, _metrics_calculator
    global _knowledge_base, _gemini_client

    _vision_client = None
    _metrics_manager = None
    _metrics_calculator = None
    _knowledge_base = None
    _gemini_client = None
