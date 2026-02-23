"""
Celery Application Configuration
For async task processing (vision analysis, batch calculations)
"""

from celery import Celery

from app.core.config import get_settings

settings = get_settings()


def create_celery_app() -> Celery:
    """Create and configure Celery application"""

    celery_app = Celery(
        "greensvc",
        broker=f"redis://{settings.redis_host}:{settings.redis_port}/{settings.redis_db}",
        backend=f"redis://{settings.redis_host}:{settings.redis_port}/{settings.redis_db}",
        include=["app.tasks.vision_tasks", "app.tasks.metrics_tasks", "app.tasks.analysis_tasks"],
    )

    celery_app.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
        enable_utc=True,
        task_track_started=True,
        task_time_limit=1800,  # 30 minutes max
        task_soft_time_limit=1500,  # 25 minutes soft limit
        worker_prefetch_multiplier=1,  # One task at a time for heavy tasks
        result_expires=86400,  # Results expire after 24 hours
    )

    return celery_app


# Create celery instance
celery_app = create_celery_app()
