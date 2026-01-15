"""Project-related Pydantic models"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class SpatialZone(BaseModel):
    """Spatial zone within a project"""
    zone_id: str
    zone_name: str
    zone_types: list[str] = Field(default_factory=list)
    description: str = ""


class UploadedImage(BaseModel):
    """Uploaded image metadata"""
    image_id: str
    filename: str
    filepath: str
    zone_id: Optional[str] = None
    has_gps: bool = False
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class ProjectCreate(BaseModel):
    """Schema for creating a new project"""
    project_name: str
    project_location: str = ""
    site_scale: str = ""
    project_phase: str = ""

    # Site Context
    koppen_zone_id: str = ""
    country_id: str = ""
    space_type_id: str = ""
    lcz_type_id: str = ""
    age_group_id: str = ""

    # Performance Goals
    design_brief: str = ""
    performance_dimensions: list[str] = Field(default_factory=list)
    subdimensions: list[str] = Field(default_factory=list)


class ProjectUpdate(BaseModel):
    """Schema for updating an existing project"""
    project_name: Optional[str] = None
    project_location: Optional[str] = None
    site_scale: Optional[str] = None
    project_phase: Optional[str] = None
    koppen_zone_id: Optional[str] = None
    country_id: Optional[str] = None
    space_type_id: Optional[str] = None
    lcz_type_id: Optional[str] = None
    age_group_id: Optional[str] = None
    design_brief: Optional[str] = None
    performance_dimensions: Optional[list[str]] = None
    subdimensions: Optional[list[str]] = None


class ProjectResponse(ProjectCreate):
    """Schema for project response"""
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    spatial_zones: list[SpatialZone] = Field(default_factory=list)
    uploaded_images: list[UploadedImage] = Field(default_factory=list)


class ProjectQuery(BaseModel):
    """Full project query for export/API calls"""
    query_metadata: dict = Field(default_factory=dict)
    project: dict = Field(default_factory=dict)
    context: dict = Field(default_factory=dict)
    performance_query: dict = Field(default_factory=dict)
    spatial_zones: list[dict] = Field(default_factory=list)
    site_photos: dict = Field(default_factory=dict)

    @classmethod
    def from_project(cls, project: ProjectResponse) -> "ProjectQuery":
        """Create ProjectQuery from ProjectResponse"""
        return cls(
            query_metadata={
                "query_version": "2.0",
                "generated_at": datetime.now().isoformat(),
                "system": "GreenSVC-AI"
            },
            project={
                "name": project.project_name,
                "location": project.project_location or None,
                "scale": project.site_scale or None,
                "phase": project.project_phase or None
            },
            context={
                "climate": {"koppen_zone_id": project.koppen_zone_id},
                "urban_form": {
                    "space_type_id": project.space_type_id,
                    "lcz_type_id": project.lcz_type_id or None
                },
                "user": {"age_group_id": project.age_group_id or None},
                "country_id": project.country_id or None
            },
            performance_query={
                "design_brief": project.design_brief or None,
                "dimensions": project.performance_dimensions,
                "subdimensions": project.subdimensions
            },
            spatial_zones=[
                {
                    "zone_id": z.zone_id,
                    "zone_name": z.zone_name,
                    "zone_types": z.zone_types,
                    "description": z.description
                }
                for z in project.spatial_zones
            ],
            site_photos={
                "total_images": len(project.uploaded_images),
                "grouped_images": len([i for i in project.uploaded_images if i.zone_id]),
            }
        )
