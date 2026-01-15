"""Authentication service with JWT token handling."""

import uuid
from datetime import datetime, timedelta
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import get_settings
from app.models.user import TokenPayload, UserCreate, UserInDB

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthService:
    """Authentication service for user management and JWT tokens."""

    def __init__(self):
        self.settings = get_settings()
        # In-memory user storage for now (will be replaced with PostgreSQL)
        self._users: dict[str, UserInDB] = {}
        self._users_by_username: dict[str, str] = {}  # username -> user_id

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash."""
        return pwd_context.verify(plain_password, hashed_password)

    def get_password_hash(self, password: str) -> str:
        """Hash a password."""
        return pwd_context.hash(password)

    def create_access_token(
        self, subject: str, expires_delta: timedelta | None = None
    ) -> tuple[str, int]:
        """Create a JWT access token."""
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(
                minutes=self.settings.access_token_expire_minutes
            )

        expires_in = int((expire - datetime.utcnow()).total_seconds())

        to_encode: dict[str, Any] = {
            "sub": subject,
            "exp": expire,
            "iat": datetime.utcnow(),
        }
        encoded_jwt = jwt.encode(
            to_encode,
            self.settings.secret_key,
            algorithm=self.settings.algorithm,
        )
        return encoded_jwt, expires_in

    def decode_token(self, token: str) -> TokenPayload | None:
        """Decode and validate a JWT token."""
        try:
            payload = jwt.decode(
                token,
                self.settings.secret_key,
                algorithms=[self.settings.algorithm],
            )
            return TokenPayload(**payload)
        except JWTError:
            return None

    def create_user(self, user_data: UserCreate) -> UserInDB:
        """Create a new user."""
        # Check if username already exists
        if user_data.username in self._users_by_username:
            raise ValueError("Username already registered")

        user_id = str(uuid.uuid4())
        now = datetime.utcnow()

        user = UserInDB(
            id=user_id,
            email=user_data.email,
            username=user_data.username,
            full_name=user_data.full_name,
            is_active=user_data.is_active,
            hashed_password=self.get_password_hash(user_data.password),
            created_at=now,
        )

        self._users[user_id] = user
        self._users_by_username[user_data.username] = user_id

        return user

    def get_user_by_id(self, user_id: str) -> UserInDB | None:
        """Get a user by ID."""
        return self._users.get(user_id)

    def get_user_by_username(self, username: str) -> UserInDB | None:
        """Get a user by username."""
        user_id = self._users_by_username.get(username)
        if user_id:
            return self._users.get(user_id)
        return None

    def authenticate_user(self, username: str, password: str) -> UserInDB | None:
        """Authenticate a user by username and password."""
        user = self.get_user_by_username(username)
        if not user:
            return None
        if not self.verify_password(password, user.hashed_password):
            return None
        return user


# Singleton instance
_auth_service: AuthService | None = None


def get_auth_service() -> AuthService:
    """Get or create the auth service singleton."""
    global _auth_service
    if _auth_service is None:
        _auth_service = AuthService()
    return _auth_service
