"""
GreenSVC API - FastAPI Application
Urban greenspace visual analysis backend
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.db.project_store import init_project_store, get_project_store
from app.api.routes import health, config, metrics, projects, vision, indicators, tasks, auth, analysis

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    settings = get_settings()
    settings.ensure_directories()
    logger.info("GreenSVC API starting up...")
    logger.info(f"Data directory: {settings.data_path}")
    logger.info(f"Vision API URL: {settings.vision_api_url}")

    # Initialize SQLite project store
    settings.ensure_directories()
    store = init_project_store(settings.sqlite_path)
    logger.info("SQLite project store initialized at %s", settings.sqlite_path)

    yield

    # Shutdown
    store.close()
    logger.info("GreenSVC API shutting down...")


def create_app() -> FastAPI:
    """Create and configure FastAPI application"""
    settings = get_settings()

    app = FastAPI(
        title="GreenSVC API",
        description="Urban greenspace visual analysis API",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # CORS middleware for React frontend
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",   # Create React App default
            "http://localhost:5173",   # Vite default
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(
        health.router,
        tags=["Health"],
    )
    app.include_router(
        config.router,
        prefix="/api/config",
        tags=["Configuration"],
    )
    app.include_router(
        metrics.router,
        prefix="/api/metrics",
        tags=["Metrics"],
    )
    app.include_router(
        projects.router,
        prefix="/api/projects",
        tags=["Projects"],
    )
    app.include_router(
        vision.router,
        prefix="/api/vision",
        tags=["Vision Analysis"],
    )
    app.include_router(
        indicators.router,
        prefix="/api/indicators",
        tags=["Indicators"],
    )
    app.include_router(
        tasks.router,
        prefix="/api/tasks",
        tags=["Background Tasks"],
    )
    app.include_router(
        auth.router,
        prefix="/api/auth",
        tags=["Authentication"],
    )
    app.include_router(
        analysis.router,
        prefix="/api/analysis",
        tags=["Analysis Pipeline"],
    )

    # Serve uploaded images as static files
    uploads_path = settings.temp_full_path / "uploads"
    uploads_path.mkdir(parents=True, exist_ok=True)
    app.mount("/api/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")

    return app


# Create app instance
app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
