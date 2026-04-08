"""Project management endpoints"""

import os
import re
import uuid
import shutil
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, List

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse

from pydantic import BaseModel

from app.models.project import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectQuery,
    SpatialZone,
    SpatialRelation,
    UploadedImage,
)
from app.models.user import UserResponse
from app.api.deps import get_current_user


class ZoneAssignment(BaseModel):
    image_id: str
    zone_id: Optional[str] = None


class BatchImageDelete(BaseModel):
    image_ids: List[str]
from app.core.config import get_settings
from app.db.project_store import get_project_store, ProjectStore

router = APIRouter()


def _parse_coords_from_filename(filename: str) -> tuple[float, float] | None:
    """Try to extract (latitude, longitude) from the filename.

    Supports underscore/space-separated formats common in street-view datasets::

        0_0_120.1256806_30.2549131_杨公堤_201709_front
              ^^^^^^^^^  ^^^^^^^^^
              longitude   latitude

    Also handles dot-separated legacy format (``0.0.120.1256806.30.2549131...``).

    Returns (latitude, longitude) rounded to 7 decimal places, or None.
    """
    stem = Path(filename).stem

    # Split by common separators, then find segments that look like coordinates
    # e.g. "0_0_120.1256806_30.2549131_杨公堤_201709_front" → ["120.1256806", "30.2549131"]
    candidates: list[float] = []
    for seg in re.split(r'[_ \-]+', stem):
        m = re.fullmatch(r'\d{1,3}\.\d{4,}', seg)
        if m:
            value = float(m.group())
            if 1.0 <= abs(value) <= 180.0:
                candidates.append(value)

    if len(candidates) >= 2:
        a, b = candidates[-2], candidates[-1]
        return _assign_lat_lng(a, b)

    # Legacy fallback: dot-separated format where dots serve as both decimal
    # separator AND field delimiter (e.g. "0.0.120.1256806.30.2549131...")
    ascii_prefix = re.split(r'[^\x00-\x7f]', stem, maxsplit=1)[0].rstrip('. _-')
    parts = ascii_prefix.split('.')
    legacy_candidates: list[float] = []
    i = 0
    while i < len(parts) - 1:
        int_part = parts[i]
        dec_part = parts[i + 1]
        if re.fullmatch(r'\d{1,3}', int_part) and re.fullmatch(r'\d{4,}', dec_part):
            value = float(f"{int_part}.{dec_part}")
            if 1.0 <= abs(value) <= 180.0:
                legacy_candidates.append(value)
                i += 2
                continue
        i += 1

    if len(legacy_candidates) >= 2:
        a, b = legacy_candidates[-2], legacy_candidates[-1]
        return _assign_lat_lng(a, b)

    return None


def _assign_lat_lng(a: float, b: float) -> tuple[float, float] | None:
    """Given two coordinate candidates, return (latitude, longitude)."""
    if abs(a) <= 90 and abs(b) <= 90:
        # Both could be latitude — assume (lng, lat) order (common in Chinese datasets)
        lat, lng = b, a
    elif abs(a) <= 90:
        lat, lng = a, b
    elif abs(b) <= 90:
        lat, lng = b, a
    else:
        return None
    return round(lat, 7), round(lng, 7)


def get_projects_store() -> ProjectStore:
    """Get the SQLite-backed project store (used by vision.py, analysis.py)."""
    return get_project_store()


@router.post("", response_model=ProjectResponse)
async def create_project(project: ProjectCreate, _user: UserResponse = Depends(get_current_user)):
    """Create a new project"""
    store = get_project_store()
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

    store.save(response)
    return response


@router.get("", response_model=list[ProjectResponse])
async def list_projects(
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
):
    """List all projects"""
    store = get_project_store()
    return store.list(limit, offset)


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str):
    """Get project by ID"""
    store = get_project_store()
    project = store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, updates: ProjectUpdate, _user: UserResponse = Depends(get_current_user)):
    """Update project"""
    store = get_project_store()
    project = store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

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
    store.save(project)
    return project


@router.delete("/{project_id}")
async def delete_project(project_id: str, _user: UserResponse = Depends(get_current_user)):
    """Delete project"""
    store = get_project_store()
    if not store.delete(project_id):
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")
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
    store = get_project_store()
    project = store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    zone_id = f"zone_{len(project.spatial_zones) + 1}"

    zone = SpatialZone(
        zone_id=zone_id,
        zone_name=zone_name,
        zone_types=zone_types or [],
        description=description,
    )

    project.spatial_zones.append(zone)
    project.updated_at = datetime.now()
    store.save(project)
    return zone


@router.delete("/{project_id}/zones/{zone_id}")
async def delete_zone(project_id: str, zone_id: str):
    """Remove a spatial zone"""
    store = get_project_store()
    project = store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    project.spatial_zones = [z for z in project.spatial_zones if z.zone_id != zone_id]

    # Unassign images from deleted zone
    for img in project.uploaded_images:
        if img.zone_id == zone_id:
            img.zone_id = None

    project.updated_at = datetime.now()
    store.save(project)
    return {"success": True, "zone_id": zone_id}


# Image management
@router.post("/{project_id}/images")
async def upload_images(
    project_id: str,
    files: List[UploadFile] = File(...),
    zone_id: Optional[str] = Form(None),
    _user: UserResponse = Depends(get_current_user),
):
    """Upload images to a project"""
    store = get_project_store()
    project = store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    settings = get_settings()

    # Create project upload directory
    upload_dir = settings.temp_full_path / "uploads" / project_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    uploaded = []
    for file in files:
        # Generate unique image ID
        image_id = f"img_{uuid.uuid4().hex[:8]}"
        # Strip directory part from filename (folder uploads send relative path)
        raw_name = file.filename or "unknown.jpg"
        safe_name = raw_name.replace('\\', '/').rsplit('/', 1)[-1]
        filename = f"{image_id}_{safe_name}"
        filepath = upload_dir / filename

        # Save file
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Extract EXIF GPS coordinates
        has_gps = False
        latitude = None
        longitude = None
        try:
            from PIL import Image as PILImage
            from PIL.ExifTags import TAGS, GPSTAGS

            with PILImage.open(filepath) as img:
                exif = img.getexif()
                if exif:
                    # GPS info is in IFD 0x8825
                    gps_ifd = exif.get_ifd(0x8825)
                    if gps_ifd:
                        def _dms_to_dd(dms, ref):
                            d, m, s = float(dms[0]), float(dms[1]), float(dms[2])
                            dd = d + m / 60 + s / 3600
                            return -dd if ref in ("S", "W") else dd

                        lat_dms = gps_ifd.get(2)  # GPSLatitude
                        lat_ref = gps_ifd.get(1)   # GPSLatitudeRef
                        lng_dms = gps_ifd.get(4)  # GPSLongitude
                        lng_ref = gps_ifd.get(3)   # GPSLongitudeRef
                        if lat_dms and lng_dms and lat_ref and lng_ref:
                            latitude = round(_dms_to_dd(lat_dms, lat_ref), 6)
                            longitude = round(_dms_to_dd(lng_dms, lng_ref), 6)
                            has_gps = True
        except Exception:
            pass  # Not an image with EXIF or Pillow issue — skip silently

        # Fallback: extract coordinates from filename
        # Handles patterns like: 0.0.120.1256806.30.2549131桥公 201709 rightp9
        if not has_gps:
            coords = _parse_coords_from_filename(safe_name)
            if coords:
                latitude, longitude = coords
                has_gps = True
                logger.debug("GPS from filename %s: lat=%s, lng=%s", safe_name, latitude, longitude)

        # Create image record (use safe_name, not file.filename which may contain path)
        image = UploadedImage(
            image_id=image_id,
            filename=safe_name,
            filepath=str(filepath),
            zone_id=zone_id,
            has_gps=has_gps,
            latitude=latitude,
            longitude=longitude,
        )
        project.uploaded_images.append(image)
        uploaded.append(image)

    project.updated_at = datetime.now()
    store.save(project)
    return {
        "success": True,
        "uploaded_count": len(uploaded),
        "images": uploaded,
    }


@router.get("/{project_id}/images/{image_id}/thumbnail")
async def get_image_thumbnail(
    project_id: str,
    image_id: str,
    size: int = Query(default=160, ge=40, le=400),
):
    """Return a cached thumbnail for the given image."""
    store = get_project_store()
    project = store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    img = next((i for i in project.uploaded_images if i.image_id == image_id), None)
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    original = Path(img.filepath)
    if not original.exists():
        raise HTTPException(status_code=404, detail="Image file missing")

    settings = get_settings()
    thumb_dir = settings.temp_full_path / "thumbnails" / project_id
    thumb_dir.mkdir(parents=True, exist_ok=True)
    thumb_path = thumb_dir / f"{image_id}_{size}.jpg"

    if not thumb_path.exists():
        from PIL import Image as PILImage

        with PILImage.open(original) as pil_img:
            pil_img.thumbnail((size, size))
            if pil_img.mode in ("RGBA", "P"):
                pil_img = pil_img.convert("RGB")
            pil_img.save(thumb_path, "JPEG", quality=75)

    return FileResponse(
        thumb_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.put("/{project_id}/images/batch-zone")
async def batch_assign_zones(
    project_id: str,
    assignments: List[ZoneAssignment],
):
    """Batch assign images to zones"""
    store = get_project_store()
    project = store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    image_lookup = {img.image_id: img for img in project.uploaded_images}

    updated = 0
    for item in assignments:
        img = image_lookup.get(item.image_id)
        if img:
            img.zone_id = item.zone_id
            updated += 1

    if updated > 0:
        project.updated_at = datetime.now()
        store.save(project)

    return {"success": True, "updated": updated}


@router.put("/{project_id}/images/{image_id}/zone")
async def assign_image_to_zone(
    project_id: str,
    image_id: str,
    zone_id: Optional[str] = None,
):
    """Assign or unassign an image to a zone"""
    store = get_project_store()
    project = store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    for img in project.uploaded_images:
        if img.image_id == image_id:
            img.zone_id = zone_id
            project.updated_at = datetime.now()
            store.save(project)
            return {"success": True, "image_id": image_id, "zone_id": zone_id}

    raise HTTPException(status_code=404, detail=f"Image not found: {image_id}")


@router.post("/{project_id}/images/batch-delete")
async def batch_delete_images(
    project_id: str,
    payload: BatchImageDelete,
    _user: UserResponse = Depends(get_current_user),
):
    """Delete multiple images from a project in one request."""
    store = get_project_store()
    project = store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    target_ids = set(payload.image_ids)
    if not target_ids:
        return {"success": True, "deleted": 0, "deleted_ids": [], "not_found": []}

    deleted_ids: list[str] = []
    remaining: list[UploadedImage] = []
    for img in project.uploaded_images:
        if img.image_id in target_ids:
            try:
                os.remove(img.filepath)
            except Exception:
                pass
            deleted_ids.append(img.image_id)
        else:
            remaining.append(img)

    not_found = sorted(target_ids - set(deleted_ids))

    if deleted_ids:
        project.uploaded_images = remaining
        project.updated_at = datetime.now()
        store.save(project)

    return {
        "success": True,
        "deleted": len(deleted_ids),
        "deleted_ids": deleted_ids,
        "not_found": not_found,
    }


@router.delete("/{project_id}/images/{image_id}")
async def delete_image(project_id: str, image_id: str, _user: UserResponse = Depends(get_current_user)):
    """Delete an image from project"""
    store = get_project_store()
    project = store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    for i, img in enumerate(project.uploaded_images):
        if img.image_id == image_id:
            # Delete file if exists
            try:
                os.remove(img.filepath)
            except Exception:
                pass
            project.uploaded_images.pop(i)
            project.updated_at = datetime.now()
            store.save(project)
            return {"success": True, "image_id": image_id}

    raise HTTPException(status_code=404, detail=f"Image not found: {image_id}")


@router.get("/{project_id}/images")
async def list_project_images(project_id: str):
    """Get all images for a project"""
    store = get_project_store()
    project = store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    return {
        "project_id": project_id,
        "total": len(project.uploaded_images),
        "images": project.uploaded_images,
    }


@router.post("/{project_id}/images/reparse-gps")
async def reparse_image_gps(
    project_id: str,
    _user: UserResponse = Depends(get_current_user),
):
    """Re-extract GPS coordinates from filenames for images that have no GPS data.

    This is useful when images were uploaded before filename-based coordinate
    parsing was available, or when EXIF data was missing.  It does NOT touch
    Vision API results or metrics — only updates ``has_gps / latitude / longitude``.
    """
    store = get_project_store()
    project = store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    updated = 0
    for img in project.uploaded_images:
        if img.has_gps:
            continue
        coords = _parse_coords_from_filename(img.filename)
        if coords:
            img.latitude, img.longitude = coords
            img.has_gps = True
            updated += 1

    if updated > 0:
        project.updated_at = datetime.now()
        store.save(project)

    return {
        "project_id": project_id,
        "total_images": len(project.uploaded_images),
        "already_had_gps": sum(1 for img in project.uploaded_images if img.has_gps) - updated,
        "updated_from_filename": updated,
        "still_no_gps": sum(1 for img in project.uploaded_images if not img.has_gps),
    }


# Export
@router.get("/{project_id}/export", response_model=ProjectQuery)
async def export_project(project_id: str):
    """Export project as ProjectQuery format"""
    store = get_project_store()
    project = store.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail=f"Project not found: {project_id}")

    return ProjectQuery.from_project(project)
