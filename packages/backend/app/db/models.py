"""SQLAlchemy database models."""

import uuid
from datetime import datetime
from typing import List

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text, JSON
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class User(Base):
    """User database model."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, onupdate=datetime.utcnow, nullable=True
    )

    # Relationships
    projects: Mapped[List["Project"]] = relationship("Project", back_populates="owner")


class Project(Base):
    """Project database model."""

    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    project_name: Mapped[str] = mapped_column(String(255))
    project_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    site_scale: Mapped[str | None] = mapped_column(String(100), nullable=True)
    project_phase: Mapped[str | None] = mapped_column(String(100), nullable=True)
    koppen_zone_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    country_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    space_type_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    lcz_type_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    age_group_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    design_brief: Mapped[str | None] = mapped_column(Text, nullable=True)
    performance_dimensions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    subdimensions: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime, onupdate=datetime.utcnow, nullable=True
    )

    # Relationships
    owner: Mapped["User"] = relationship("User", back_populates="projects")
    spatial_zones: Mapped[List["SpatialZone"]] = relationship(
        "SpatialZone", back_populates="project", cascade="all, delete-orphan"
    )
    uploaded_images: Mapped[List["UploadedImage"]] = relationship(
        "UploadedImage", back_populates="project", cascade="all, delete-orphan"
    )


class SpatialZone(Base):
    """Spatial zone database model."""

    __tablename__ = "spatial_zones"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False
    )
    zone_id: Mapped[str] = mapped_column(String(100))
    zone_name: Mapped[str] = mapped_column(String(255))
    zone_types: Mapped[list | None] = mapped_column(JSON, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="spatial_zones")


class UploadedImage(Base):
    """Uploaded image database model."""

    __tablename__ = "uploaded_images"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False
    )
    image_id: Mapped[str] = mapped_column(String(100))
    filename: Mapped[str] = mapped_column(String(255))
    filepath: Mapped[str] = mapped_column(String(500))
    zone_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    has_gps: Mapped[bool] = mapped_column(Boolean, default=False)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Analysis results stored as JSON
    vision_results: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    metrics_results: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Relationships
    project: Mapped["Project"] = relationship(
        "Project", back_populates="uploaded_images"
    )
