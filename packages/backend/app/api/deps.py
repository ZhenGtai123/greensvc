"""
API Dependencies
Dependency injection for FastAPI routes
"""

from functools import lru_cache
from typing import Optional

from app.core.config import Settings, get_settings
from app.services.vision_client import VisionModelClient
from app.services.metrics_manager import MetricsManager
from app.services.metrics_calculator import MetricsCalculator
from app.services.knowledge_base import KnowledgeBase
from app.services.gemini_client import RecommendationService
from app.services.llm_client import LLMClient, LLM_PROVIDERS, create_llm_client
from app.services.zone_analyzer import ZoneAnalyzer
from app.services.design_engine import DesignEngine


# Settings dependency
def get_settings_dep() -> Settings:
    """Get application settings"""
    return get_settings()


# Service singletons
_vision_client: VisionModelClient = None
_metrics_manager: MetricsManager = None
_metrics_calculator: MetricsCalculator = None
_knowledge_base: KnowledgeBase = None
_recommendation_service: RecommendationService = None
_llm_client: LLMClient = None
_zone_analyzer: ZoneAnalyzer = None
_design_engine: DesignEngine = None

# Runtime provider override (None = use settings default)
_active_provider: Optional[str] = None
_active_model: Optional[str] = None


def _get_api_key_for_provider(provider: str, settings: Settings) -> str:
    """Get the API key for a given provider from settings."""
    key_map = {
        "gemini": settings.google_api_key,
        "openai": settings.openai_api_key,
        "anthropic": settings.anthropic_api_key,
        "deepseek": settings.deepseek_api_key,
    }
    return key_map.get(provider, "")


def _get_model_for_provider(provider: str, settings: Settings) -> str:
    """Get the model name for a given provider from settings."""
    model_map = {
        "gemini": settings.gemini_model,
        "openai": settings.openai_model,
        "anthropic": settings.anthropic_model,
        "deepseek": settings.deepseek_model,
    }
    return model_map.get(provider, LLM_PROVIDERS.get(provider, {}).get("default_model", ""))


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


def get_llm_client() -> LLMClient:
    """Get LLM client singleton (creates based on active provider)."""
    global _llm_client
    if _llm_client is None:
        settings = get_settings()
        provider = _active_provider or settings.llm_provider
        api_key = _get_api_key_for_provider(provider, settings)
        model = _active_model or _get_model_for_provider(provider, settings)
        _llm_client = create_llm_client(provider, api_key, model)
    return _llm_client


def get_gemini_client() -> RecommendationService:
    """Get RecommendationService singleton (backward-compatible name)."""
    global _recommendation_service
    if _recommendation_service is None:
        llm = get_llm_client()
        _recommendation_service = RecommendationService(llm=llm)
    return _recommendation_service


def get_zone_analyzer() -> ZoneAnalyzer:
    """Get ZoneAnalyzer singleton"""
    global _zone_analyzer
    if _zone_analyzer is None:
        _zone_analyzer = ZoneAnalyzer()
    return _zone_analyzer


def get_design_engine() -> DesignEngine:
    """Get DesignEngine singleton"""
    global _design_engine
    if _design_engine is None:
        kb = get_knowledge_base()
        llm = get_llm_client()
        _design_engine = DesignEngine(knowledge_base=kb, llm_client=llm)
    return _design_engine


def switch_llm_provider(provider: str, model: Optional[str] = None):
    """Switch active LLM provider at runtime. Resets dependent singletons."""
    global _llm_client, _active_provider, _active_model
    global _recommendation_service, _design_engine
    _active_provider = provider
    _active_model = model
    # Reset singletons that depend on LLM
    _llm_client = None
    _recommendation_service = None
    _design_engine = None


def get_active_provider() -> str:
    """Get the currently active provider name."""
    return _active_provider or get_settings().llm_provider


def reset_services() -> None:
    """Reset all service singletons (useful for testing)"""
    global _vision_client, _metrics_manager, _metrics_calculator
    global _knowledge_base, _recommendation_service, _llm_client
    global _zone_analyzer, _design_engine
    global _active_provider, _active_model

    _vision_client = None
    _metrics_manager = None
    _metrics_calculator = None
    _knowledge_base = None
    _recommendation_service = None
    _llm_client = None
    _zone_analyzer = None
    _design_engine = None
    _active_provider = None
    _active_model = None
