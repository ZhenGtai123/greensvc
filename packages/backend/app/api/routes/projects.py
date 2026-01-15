"""Project management endpoints"""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectQuery,
    SpatialZone,
    UploadedImage,
)

router = APIRouter()

# In-memory storage for Phase 1 (will be replaced with database in later phases)
_projects: dict[str, ProjectResponse] = {}


@router.post("", response_model=ProjectResponse)
async def create_project(project: ProjectCreate):
    """Create a new project"""
    project_id = str(uuid.uuid4())[:8]

    response = ProjectResponse(
        id=project_id,
        created_at=datetime.now(),
        **project.model_dump(),
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


# Export
@router.get("/{project_id}/export", response_model=ProjectQuery)
async def export_project(project_id: str):
    """Export project as ProjectQuery format"""
    if project_id not in _projects:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    project = _projects[project_id]
    return ProjectQuery.from_project(project)
