"""Configuration endpoints"""

from fastapi import APIRouter, Depends

from app.core.config import Settings
from app.api.deps import get_settings_dep, get_vision_client, get_gemini_client
from app.services.vision_client import VisionModelClient
from app.services.gemini_client import GeminiClient

router = APIRouter()


@router.get("")
async def get_config(settings: Settings = Depends(get_settings_dep)):
    """Get application configuration (non-sensitive values)"""
    return {
        "vision_api_url": settings.vision_api_url,
        "gemini_model": settings.gemini_model,
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
    gemini_client: GeminiClient = Depends(get_gemini_client),
):
    """Test Gemini API configuration"""
    valid = gemini_client.check_api_key()
    return {
        "configured": valid,
        "model": gemini_client.model if valid else None,
    }


@router.put("/vision-url")
async def update_vision_url(
    url: str,
    settings: Settings = Depends(get_settings_dep),
):
    """Update Vision API URL (runtime only, not persisted)"""
    # Note: This updates the settings object but doesn't persist to .env
    # For a production app, you'd want to handle this differently
    return {
        "message": "Vision URL update not implemented in this version",
        "current_url": settings.vision_api_url,
        "requested_url": url,
    }
