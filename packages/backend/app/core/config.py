"""
Application Configuration
Uses Pydantic Settings for environment variable management
"""

from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",  # Ignore extra env vars from old .env files
    )

    # LLM Provider
    llm_provider: str = "gemini"  # gemini | openai | anthropic | deepseek

    # API Keys (per provider)
    google_api_key: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    deepseek_api_key: str = ""

    # Model names (per provider)
    gemini_model: str = "gemini-3-pro-preview"
    openai_model: str = "gpt-4o"
    anthropic_model: str = "claude-sonnet-4-20250514"
    deepseek_model: str = "deepseek-chat"

    # External Services
    vision_api_url: str = "http://127.0.0.1:8000"

    # Server Configuration
    host: str = "0.0.0.0"
    port: int = 8080
    debug: bool = False

    # Redis Configuration
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0

    # JWT Authentication
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    # PostgreSQL Database
    database_url: str = "postgresql://postgres:postgres@localhost:5432/greensvc"

    # Paths (relative to backend/)
    data_dir: str = "data"
    metrics_library_path: str = "data/A_indicators.xlsx"
    metrics_code_dir: str = "data/metrics_code"
    knowledge_base_dir: str = "data/knowledge_base"
    output_dir: str = "outputs"
    temp_dir: str = "temp"

    # Computed paths
    @property
    def base_dir(self) -> Path:
        """Get the base directory (backend/)"""
        return Path(__file__).parent.parent.parent

    @property
    def data_path(self) -> Path:
        return self.base_dir / self.data_dir

    @property
    def metrics_library_full_path(self) -> Path:
        return self.base_dir / self.metrics_library_path

    @property
    def metrics_code_full_path(self) -> Path:
        return self.base_dir / self.metrics_code_dir

    @property
    def knowledge_base_full_path(self) -> Path:
        return self.base_dir / self.knowledge_base_dir

    @property
    def output_full_path(self) -> Path:
        return self.base_dir / self.output_dir

    @property
    def temp_full_path(self) -> Path:
        return self.base_dir / self.temp_dir

    def ensure_directories(self) -> None:
        """Ensure all required directories exist"""
        for path in [
            self.data_path,
            self.metrics_code_full_path,
            self.knowledge_base_full_path,
            self.output_full_path,
            self.temp_full_path,
        ]:
            path.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
