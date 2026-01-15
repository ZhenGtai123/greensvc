"""Vision analysis endpoints"""

import json
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form

from app.api.deps import get_vision_client, get_settings_dep
from app.core.config import Settings
from app.services.vision_client import VisionModelClient
from app.models.vision import VisionAnalysisRequest, VisionAnalysisResponse, SemanticConfig

router = APIRouter()


@router.get("/semantic-config")
async def get_semantic_config(
    settings: Settings = Depends(get_settings_dep),
):
    """Get semantic class configuration"""
    config_path = settings.data_path / "Semantic_configuration.json"

    if not config_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Semantic configuration file not found"
        )

    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)

    return {
        "total_classes": len(config),
        "classes": config,
    }


@router.post("/analyze", response_model=VisionAnalysisResponse)
async def analyze_image(
    file: UploadFile = File(...),
    request_data: str = Form(...),
    vision_client: VisionModelClient = Depends(get_vision_client),
    settings: Settings = Depends(get_settings_dep),
):
    """
    Analyze an uploaded image using Vision API

    The request_data should be a JSON string with VisionAnalysisRequest fields.
    """
    # Parse request data
    try:
        request_dict = json.loads(request_data)
        request = VisionAnalysisRequest(**request_dict)
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid request data: {e}")

    # Validate parameters
    valid, error = vision_client.validate_parameters(
        request.semantic_classes,
        request.semantic_countability,
        request.openness_list,
    )
    if not valid:
        raise HTTPException(status_code=400, detail=error)

    # Save uploaded file to temp location
    settings.ensure_directories()
    temp_path = settings.temp_full_path / f"upload_{file.filename}"

    try:
        content = await file.read()
        with open(temp_path, 'wb') as f:
            f.write(content)

        # Call Vision API
        result = await vision_client.analyze_image(str(temp_path), request)

        # Update image path in result
        result.image_path = str(temp_path)

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze/path", response_model=VisionAnalysisResponse)
async def analyze_image_by_path(
    image_path: str,
    request: VisionAnalysisRequest,
    vision_client: VisionModelClient = Depends(get_vision_client),
):
    """
    Analyze an image from a local path

    Use this endpoint when the image is already on the server.
    """
    # Validate image exists
    if not Path(image_path).exists():
        raise HTTPException(status_code=404, detail=f"Image not found: {image_path}")

    # Validate parameters
    valid, error = vision_client.validate_parameters(
        request.semantic_classes,
        request.semantic_countability,
        request.openness_list,
    )
    if not valid:
        raise HTTPException(status_code=400, detail=error)

    # Call Vision API
    result = await vision_client.analyze_image(image_path, request)
    return result


@router.post("/batch", response_model=list[VisionAnalysisResponse])
async def batch_analyze(
    image_paths: list[str],
    request: VisionAnalysisRequest,
    vision_client: VisionModelClient = Depends(get_vision_client),
):
    """Analyze multiple images"""
    # Validate all images exist
    missing = [p for p in image_paths if not Path(p).exists()]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Images not found: {missing[:5]}..."
        )

    # Validate parameters
    valid, error = vision_client.validate_parameters(
        request.semantic_classes,
        request.semantic_countability,
        request.openness_list,
    )
    if not valid:
        raise HTTPException(status_code=400, detail=error)

    results = await vision_client.batch_analyze(image_paths, request)
    return results


@router.get("/health")
async def vision_health(
    vision_client: VisionModelClient = Depends(get_vision_client),
):
    """Check Vision API health"""
    healthy = await vision_client.check_health()
    return {"healthy": healthy, "url": vision_client.base_url}
