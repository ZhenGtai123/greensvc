"""Project management endpoints"""

import os
import uuid
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form

from app.models.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectQuery,
    SpatialZone,
    SpatialRelation,
    UploadedImage,
)
from app.core.config import get_settings

router = APIRouter()

# In-memory storage for Phase 1 (will be replaced with database in later phases)
_projects: dict[str, ProjectResponse] = {}


@router.post("", response_model=ProjectResponse)
async def create_project(project: ProjectCreate):
    """Create a new project"""
    project_id = str(uuid.uuid4())[:8]

    # Convert SpatialZoneCreate to SpatialZone with proper IDs
    zones = []
    for i, zone_data in enumerate(project.spatial_zones):
        zone = SpatialZone(
            zone_id=zone_data.zone_id or f"zone_{i+1}",
            zone_name=zone_data.zone_name,
            zone_types=zone_data.zone_types,
            area=zone_data.area,
            status=zone_data.status,
            description=zone_data.description,
        )
        zones.append(zone)

    response = ProjectResponse(
        id=project_id,
        created_at=datetime.now(),
        project_name=project.project_name,
        project_location=project.project_location,
        site_scale=project.site_scale,
        project_phase=project.project_phase,
        koppen_zone_id=project.koppen_zone_id,
        country_id=project.country_id,
        space_type_id=project.space_type_id,
        lcz_type_id=project.lcz_type_id,
        age_group_id=project.age_group_id,
        design_brief=project.design_brief,
        performance_dimensions=project.performance_dimensions,
        subdimensions=project.subdimensions,
        spatial_zones=zones,
        spatial_relations=project.spatial_relations,
        uploaded_images=[],
    )

    _projects[project_id] = response
    return response


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
):
    """List all projects"""
    projects = list(_projects.values())
    return projects[offset:offset + limit]


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str):
    """Get project by ID"""
    if project_id not in _projects:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")
    return _projects[project_id]


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, updates: ProjectUpdate):
    """Update project"""
    if project_id not in _projects:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    project = _projects[project_id]

    # Apply updates
    update_data = updates.model_dump(exclude_unset=True)

    # Handle spatial_zones conversion separately
    if 'spatial_zones' in update_data:
        zones = []
        for i, zone_data in enumerate(update_data['spatial_zones']):
            zone = SpatialZone(
                zone_id=zone_data.get('zone_id') or f"zone_{i+1}",
                zone_name=zone_data.get('zone_name', ''),
                zone_types=zone_data.get('zone_types', []),
                area=zone_data.get('area'),
                status=zone_data.get('status', 'existing'),
                description=zone_data.get('description', ''),
            )
            zones.append(zone)
        project.spatial_zones = zones
        del update_data['spatial_zones']

    # Handle spatial_relations separately
    if 'spatial_relations' in update_data:
        relations = []
        for rel_data in update_data['spatial_relations']:
            relation = SpatialRelation(
                from_zone=rel_data.get('from_zone', ''),
                to_zone=rel_data.get('to_zone', ''),
                relation_type=rel_data.get('relation_type', ''),
                direction=rel_data.get('direction', 'single'),
            )
            relations.append(relation)
        project.spatial_relations = relations
        del update_data['spatial_relations']

    # Apply remaining simple field updates
    for field, value in update_data.items():
        setattr(project, field, value)

    project.updated_at = datetime.now()
    _projects[project_id] = project
    return project


@router.delete("/{project_id}")
async def delete_project(project_id: str):
    """Delete project"""
    if project_id not in _projects:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    del _projects[project_id]
    return {"success": True, "project_id": project_id}


# Zone management
@router.post("/{project_id}/zones", response_model=SpatialZone)
async def add_zone(
    project_id: str,
    zone_name: str,
    zone_types: list[str] = None,
    description: str = "",
):
    """Add a spatial zone to project"""
    if project_id not in _projects:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    project = _projects[project_id]
    zone_id = f"zone_{len(project.spatial_zones) + 1}"

    zone = SpatialZone(
        zone_id=zone_id,
        zone_name=zone_name,
        zone_types=zone_types or [],
        description=description,
    )

    project.spatial_zones.append(zone)
    project.updated_at = datetime.now()
    return zone


@router.delete("/{project_id}/zones/{zone_id}")
async def delete_zone(project_id: str, zone_id: str):
    """Remove a spatial zone"""
    if project_id not in _projects:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    project = _projects[project_id]
    project.spatial_zones = [z for z in project.spatial_zones if z.zone_id != zone_id]

    # Unassign images from deleted zone
    for img in project.uploaded_images:
        if img.zone_id == zone_id:
            img.zone_id = None

    project.updated_at = datetime.now()
    return {"success": True, "zone_id": zone_id}


# Image management
@router.post("/{project_id}/images")
async def upload_images(
    project_id: str,
    files: List[UploadFile] = File(...),
    zone_id: Optional[str] = Form(None),
):
    """Upload images to a project"""
    if project_id not in _projects:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    settings = get_settings()
    project = _projects[project_id]

    # Create project upload directory
    upload_dir = settings.temp_full_path / "uploads" / project_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    uploaded = []
    for file in files:
        # Generate unique image ID
        image_id = f"img_{uuid.uuid4().hex[:8]}"
        filename = f"{image_id}_{file.filename}"
        filepath = upload_dir / filename

        # Save file
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Create image record
        image = UploadedImage(
            image_id=image_id,
            filename=file.filename,
            filepath=str(filepath),
            zone_id=zone_id,
        )
        project.uploaded_images.append(image)
        uploaded.append(image)

    project.updated_at = datetime.now()
    return {
        "success": True,
        "uploaded_count": len(uploaded),
        "images": uploaded,
    }


@router.put("/{project_id}/images/{image_id}/zone")
async def assign_image_to_zone(
    project_id: str,
    image_id: str,
    zone_id: Optional[str] = None,
):
    """Assign or unassign an image to a zone"""
    if project_id not in _projects:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    project = _projects[project_id]

    for img in project.uploaded_images:
        if img.image_id == image_id:
            img.zone_id = zone_id
            project.updated_at = datetime.now()
            return {"success": True, "image_id": image_id, "zone_id": zone_id}

    raise HTTPException(status_code=404, detail=f"Image not found: {image_id}")


@router.delete("/{project_id}/images/{image_id}")
async def delete_image(project_id: str, image_id: str):
    """Delete an image from project"""
    if project_id not in _projects:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    project = _projects[project_id]

    for i, img in enumerate(project.uploaded_images):
        if img.image_id == image_id:
            # Delete file if exists
            try:
                os.remove(img.filepath)
            except Exception:
                pass
            project.uploaded_images.pop(i)
            project.updated_at = datetime.now()
            return {"success": True, "image_id": image_id}

    raise HTTPException(status_code=404, detail=f"Image not found: {image_id}")


@router.get("/{project_id}/images")
async def list_project_images(project_id: str):
    """Get all images for a project"""
    if project_id not in _projects:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    project = _projects[project_id]
    return {
        "project_id": project_id,
        "total": len(project.uploaded_images),
        "images": project.uploaded_images,
    }


# Export
@router.get("/{project_id}/export", response_model=ProjectQuery)
async def export_project(project_id: str):
    """Export project as ProjectQuery format"""
    if project_id not in _projects:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    project = _projects[project_id]
    return ProjectQuery.from_project(project)
