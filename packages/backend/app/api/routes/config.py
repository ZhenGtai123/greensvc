"""Configuration endpoints"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import Settings
from app.api.deps import (
    get_settings_dep,
    get_vision_client,
    get_gemini_client,
    get_llm_client,
    switch_llm_provider as deps_switch_provider,
    get_active_provider,
    _get_api_key_for_provider,
    _get_model_for_provider,
)
from app.services.vision_client import VisionModelClient
from app.services.gemini_client import RecommendationService
from app.services.llm_client import LLMClient, LLM_PROVIDERS

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("")
async def get_config(settings: Settings = Depends(get_settings_dep)):
    """Get application configuration (non-sensitive values)"""
    return {
        "vision_api_url": settings.vision_api_url,
        "llm_provider": get_active_provider(),
        "gemini_model": settings.gemini_model,
        "openai_model": settings.openai_model,
        "anthropic_model": settings.anthropic_model,
        "deepseek_model": settings.deepseek_model,
        "data_dir": settings.data_dir,
        "metrics_code_dir": settings.metrics_code_dir,
        "knowledge_base_dir": settings.knowledge_base_dir,
    }


@router.post("/test-vision")
async def test_vision_connection(
    vision_client: VisionModelClient = Depends(get_vision_client),
):
    """Test connection to Vision API"""
    healthy = await vision_client.check_health()
    config = await vision_client.get_config() if healthy else None
    return {
        "healthy": healthy,
        "config": config,
    }


@router.post("/test-gemini")
async def test_gemini_connection(
    llm: LLMClient = Depends(get_llm_client),
):
    """Test LLM API configuration (backward-compatible endpoint)."""
    valid = llm.check_connection()
    return {
        "configured": valid,
        "provider": llm.provider,
        "model": llm.model if valid else None,
    }


@router.post("/test-llm")
async def test_llm_connection(
    llm: LLMClient = Depends(get_llm_client),
):
    """Test current LLM provider connection."""
    valid = llm.check_connection()
    return {
        "configured": valid,
        "provider": llm.provider,
        "model": llm.model if valid else None,
    }


@router.get("/llm-providers")
async def list_llm_providers(settings: Settings = Depends(get_settings_dep)):
    """List available LLM providers with configuration status."""
    active = get_active_provider()
    providers = []
    for provider_id, info in LLM_PROVIDERS.items():
        api_key = _get_api_key_for_provider(provider_id, settings)
        current_model = _get_model_for_provider(provider_id, settings)
        providers.append({
            "id": provider_id,
            "name": info["name"],
            "default_model": info["default_model"],
            "configured": bool(api_key),
            "active": provider_id == active,
            "current_model": current_model,
        })
    return providers


@router.put("/llm-provider")
async def update_llm_provider(
    provider: str,
    model: str = None,
    settings: Settings = Depends(get_settings_dep),
):
    """Switch active LLM provider at runtime."""
    if provider not in LLM_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider: {provider}. Available: {list(LLM_PROVIDERS.keys())}",
        )

    api_key = _get_api_key_for_provider(provider, settings)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail=f"No API key configured for {provider}. "
                   f"Set the appropriate environment variable.",
        )

    deps_switch_provider(provider, model)
    current_model = model or _get_model_for_provider(provider, settings)
    return {
        "message": f"Switched to {LLM_PROVIDERS[provider]['name']}",
        "provider": provider,
        "model": current_model,
    }


@router.put("/llm-api-key")
async def update_llm_api_key(
    provider: str,
    api_key: str,
    settings: Settings = Depends(get_settings_dep),
):
    """Update API key for a provider at runtime (not persisted to .env file)."""
    if provider not in LLM_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider: {provider}. Available: {list(LLM_PROVIDERS.keys())}",
        )
    # Update the settings object in memory
    key_attr = {
        "gemini": "google_api_key",
        "openai": "openai_api_key",
        "anthropic": "anthropic_api_key",
        "deepseek": "deepseek_api_key",
    }.get(provider)
    if key_attr:
        setattr(settings, key_attr, api_key)
    # Reset LLM singletons so new key takes effect
    deps_switch_provider(provider)
    return {
        "message": f"API key updated for {LLM_PROVIDERS[provider]['name']}",
        "provider": provider,
        "configured": bool(api_key),
    }


@router.put("/vision-url")
async def update_vision_url(
    url: str,
    settings: Settings = Depends(get_settings_dep),
):
    """Update Vision API URL (runtime only, not persisted)"""
    return {
        "message": "Vision URL update not implemented in this version",
        "current_url": settings.vision_api_url,
        "requested_url": url,
    }


def _fetch_gemini_models_sync(api_key: str) -> list[dict]:
    """Fetch available Gemini models from the API (blocking)."""
    from google import genai

    client = genai.Client(api_key=api_key)
    models = []
    for m in client.models.list():
        name = m.name or ""
        # Only include generateContent-capable models
        methods = getattr(m, "supported_generation_methods", None) or []
        if "generateContent" not in methods:
            continue
        # Strip "models/" prefix for the id
        model_id = name.removeprefix("models/")
        display = getattr(m, "display_name", "") or model_id
        models.append({"id": model_id, "label": display})
    # Sort: gemini-3 first, then gemini-2.5, then rest; within group alphabetical
    models.sort(key=lambda x: x["id"])
    return models


@router.get("/models/{provider}")
async def list_provider_models(
    provider: str,
    settings: Settings = Depends(get_settings_dep),
):
    """List available models for a given provider by querying its API."""
    if provider not in LLM_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider: {provider}. Available: {list(LLM_PROVIDERS.keys())}",
        )

    api_key = _get_api_key_for_provider(provider, settings)
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail=f"No API key configured for {provider}.",
        )

    try:
        if provider == "gemini":
            models = await asyncio.to_thread(_fetch_gemini_models_sync, api_key)
            return models
    except Exception as e:
        logger.error("Failed to fetch models for %s: %s", provider, e)
        raise HTTPException(status_code=502, detail=f"Failed to fetch models from {provider}: {e}")

    # Other providers: return empty list (frontend uses hardcoded fallback)
    return []
