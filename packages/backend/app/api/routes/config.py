"""Configuration endpoints"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import Settings, update_env_file
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
    """Test connection to Vision API and return its health/model info."""
    info = await vision_client.get_health_info()
    healthy = info is not None and info.get("status") == "healthy"
    config = await vision_client.get_config() if healthy else None
    return {
        "healthy": healthy,
        "info": info,
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


_MODEL_ENV_KEY = {
    "gemini": "GEMINI_MODEL",
    "openai": "OPENAI_MODEL",
    "anthropic": "ANTHROPIC_MODEL",
    "deepseek": "DEEPSEEK_MODEL",
}

_MODEL_ATTR = {
    "gemini": "gemini_model",
    "openai": "openai_model",
    "anthropic": "anthropic_model",
    "deepseek": "deepseek_model",
}


@router.put("/llm-provider")
async def update_llm_provider(
    provider: str,
    model: str = None,
    settings: Settings = Depends(get_settings_dep),
):
    """Switch active LLM provider and persist to .env."""
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

    # Persist to .env
    env_updates = {"LLM_PROVIDER": provider}
    if model:
        env_key = _MODEL_ENV_KEY.get(provider)
        if env_key:
            env_updates[env_key] = model
        # Also update in-memory settings
        attr = _MODEL_ATTR.get(provider)
        if attr:
            setattr(settings, attr, model)
    update_env_file(env_updates)

    return {
        "message": f"Switched to {LLM_PROVIDERS[provider]['name']}",
        "provider": provider,
        "model": current_model,
    }


_KEY_ATTR = {
    "gemini": "google_api_key",
    "openai": "openai_api_key",
    "anthropic": "anthropic_api_key",
    "deepseek": "deepseek_api_key",
}

_KEY_ENV = {
    "gemini": "GOOGLE_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
}


@router.put("/llm-api-key")
async def update_llm_api_key(
    provider: str,
    api_key: str,
    settings: Settings = Depends(get_settings_dep),
):
    """Update API key for a provider and persist to .env."""
    if provider not in LLM_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider: {provider}. Available: {list(LLM_PROVIDERS.keys())}",
        )
    # Update in-memory settings
    attr = _KEY_ATTR.get(provider)
    if attr:
        setattr(settings, attr, api_key)
    # Persist to .env
    env_key = _KEY_ENV.get(provider)
    if env_key:
        update_env_file({env_key: api_key})
    # Reset LLM singletons so new key takes effect
    deps_switch_provider(provider)
    return {
        "message": f"API key saved for {LLM_PROVIDERS[provider]['name']}",
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
    # Exclude embedding / AQA / vision-only models that can't do generateContent
    _SKIP = {"embedding", "aqa", "imagen", "veo", "chirp", "medlm"}
    for m in client.models.list():
        name = m.name or ""
        model_id = name.removeprefix("models/").removeprefix("publishers/google/models/")
        if not model_id.startswith("gemini"):
            continue
        if any(s in model_id for s in _SKIP):
            continue
        display = getattr(m, "display_name", "") or model_id
        models.append({"id": model_id, "label": display})
    models.sort(key=lambda x: x["id"])
    return models


def _fetch_openai_models_sync(api_key: str) -> list[dict]:
    """Fetch available OpenAI models from the API (blocking).

    Filters to chat-capable model families (gpt-*, o1, o3, o4) and skips
    embedding / audio / image / moderation variants the chat endpoint can't use.
    """
    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    _PREFIXES = ("gpt-", "chatgpt", "o1", "o3", "o4")
    _SKIP = (
        "embedding", "embed", "tts", "whisper", "audio",
        "moderation", "image", "dall-e", "realtime", "search",
        "transcribe", "instruct", "babbage", "davinci",
    )
    models = []
    seen = set()
    for m in client.models.list().data:
        model_id = (m.id or "").lower()
        if not model_id or model_id in seen:
            continue
        if not any(model_id.startswith(p) for p in _PREFIXES):
            continue
        if any(s in model_id for s in _SKIP):
            continue
        seen.add(model_id)
        models.append({"id": m.id, "label": m.id})
    models.sort(key=lambda x: x["id"])
    return models


def _fetch_anthropic_models_sync(api_key: str) -> list[dict]:
    """Fetch available Anthropic Claude models from the API (blocking).

    Uses the SDK's models.list() endpoint (anthropic >= 0.39 / API 2024-10-22).
    Falls back to the messages-capable endpoint if that fails.
    """
    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    models = []
    for m in client.models.list().data:
        model_id = m.id or ""
        if not model_id:
            continue
        display = getattr(m, "display_name", "") or model_id
        models.append({"id": model_id, "label": display})
    # Anthropic returns newest-first; keep that ordering for the dropdown.
    return models


def _fetch_deepseek_models_sync(api_key: str) -> list[dict]:
    """Fetch available DeepSeek models from the API (blocking).

    DeepSeek serves an OpenAI-compatible /models endpoint.
    """
    from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
    models = []
    for m in client.models.list().data:
        model_id = m.id or ""
        if not model_id:
            continue
        models.append({"id": model_id, "label": model_id})
    models.sort(key=lambda x: x["id"])
    return models


_PROVIDER_FETCHERS = {
    "gemini": _fetch_gemini_models_sync,
    "openai": _fetch_openai_models_sync,
    "anthropic": _fetch_anthropic_models_sync,
    "deepseek": _fetch_deepseek_models_sync,
}


@router.get("/models/{provider}")
async def list_provider_models(
    provider: str,
    settings: Settings = Depends(get_settings_dep),
):
    """List available models for a given provider by querying its API.

    Returns an empty list (instead of an error) when the key is missing or
    the upstream call fails, so the frontend can fall back to its hardcoded list.
    """
    if provider not in LLM_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider: {provider}. Available: {list(LLM_PROVIDERS.keys())}",
        )

    api_key = _get_api_key_for_provider(provider, settings)
    if not api_key:
        return []  # frontend falls back to hardcoded list

    fetcher = _PROVIDER_FETCHERS.get(provider)
    if fetcher is None:
        return []

    try:
        return await asyncio.to_thread(fetcher, api_key)
    except Exception as e:
        logger.warning("Failed to fetch models for %s: %s", provider, e)
        return []  # frontend falls back to hardcoded list
