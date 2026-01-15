"""User models for authentication."""

from datetime import datetime
from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    """Base user schema."""

    email: EmailStr
    username: str
    full_name: str | None = None
    is_active: bool = True


class UserCreate(UserBase):
    """User creation schema."""

    password: str


class UserLogin(BaseModel):
    """User login schema."""

    username: str
    password: str


class UserResponse(UserBase):
    """User response schema."""

    id: str
    created_at: datetime
    updated_at: datetime | None = None

    class Config:
        from_attributes = True


class UserInDB(UserBase):
    """User stored in database."""

    id: str
    hashed_password: str
    created_at: datetime
    updated_at: datetime | None = None


class Token(BaseModel):
    """JWT token response."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenPayload(BaseModel):
    """JWT token payload."""

    sub: str  # user id
    exp: int
    iat: int
