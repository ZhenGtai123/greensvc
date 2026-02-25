"""Vision analysis endpoints"""

import json
import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, UploadFile, File, Form, Query

from app.api.deps import get_vision_client, get_settings_dep
from app.core.config import Settings
from app.services.vision_client import VisionModelClient
from app.models.vision import VisionAnalysisRequest, VisionAnalysisResponse, SemanticConfig
from app.api.routes.projects import get_projects_store

logger = logging.getLogger(__name__)

router = APIRouter()


async def _save_masks_to_project(
    response: VisionAnalysisResponse,
    project_id: str,
    image_id: str,
    settings: Settings,
) -> dict[str, str]:
    """Save mask images from vision response to disk and return filepath mapping."""
    mask_dir = settings.temp_full_path / "masks" / project_id / image_id
    mask_dir.mkdir(parents=True, exist_ok=True)
    saved: dict[str, str] = {}
    for key, data in response.images.items():
        if isinstance(data, bytes) and len(data) > 0:
            path = mask_dir / f"{key}.png"
            path.write_bytes(data)
            saved[key] = str(path)
    return saved


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
    settings: Settings = Depends(get_settings_dep),
    project_id: Optional[str] = Query(None),
    image_id: Optional[str] = Query(None),
):
    """
    Analyze an image from a local path.

    Optionally pass project_id and image_id query params to persist masks.
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

    # Persist masks if project context provided
    if project_id and image_id and result.status == "success" and result.images:
        saved = await _save_masks_to_project(result, project_id, image_id, settings)
        if saved:
            projects_store = get_projects_store()
            project = projects_store.get(project_id)
            if project:
                for img in project.uploaded_images:
                    if img.image_id == image_id:
                        img.mask_filepaths.update(saved)
                        break
                projects_store.save(project)

    return result


@router.post("/analyze/project-image", response_model=VisionAnalysisResponse)
async def analyze_project_image(
    project_id: str = Query(...),
    image_id: str = Query(...),
    request: VisionAnalysisRequest = Body(...),
    vision_client: VisionModelClient = Depends(get_vision_client),
    settings: Settings = Depends(get_settings_dep),
):
    """
    Analyze a project image and persist masks to the project.

    Looks up the image from the in-memory project store, runs vision analysis,
    saves masks to disk, and updates the image's mask_filepaths.
    """
    projects_store = get_projects_store()
    project = projects_store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    # Find image
    img = None
    for i in project.uploaded_images:
        if i.image_id == image_id:
            img = i
            break
    if not img:
        raise HTTPException(status_code=404, detail=f"Image not found: {image_id}")

    if not Path(img.filepath).exists():
        raise HTTPException(status_code=404, detail=f"Image file not found on disk: {img.filepath}")

    # Validate parameters
    logger.debug(
        "analyze_project_image: classes=%d, countability=%d, openness=%d",
        len(request.semantic_classes), len(request.semantic_countability), len(request.openness_list),
    )
    valid, error = vision_client.validate_parameters(
        request.semantic_classes,
        request.semantic_countability,
        request.openness_list,
    )
    if not valid:
        raise HTTPException(status_code=400, detail=error)

    # Call Vision API
    result = await vision_client.analyze_image(img.filepath, request)

    # Save masks to disk and link to project image
    if result.status == "success" and result.images:
        saved = await _save_masks_to_project(result, project_id, image_id, settings)
        img.mask_filepaths.update(saved)
        projects_store.save(project)
        logger.info("Saved %d masks for project %s image %s", len(saved), project_id, image_id)

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
