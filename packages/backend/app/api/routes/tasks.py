"""Task management endpoints"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

router = APIRouter()


class TaskSubmitResponse(BaseModel):
    """Response when submitting a task"""
    task_id: str
    status: str
    message: str


class TaskStatusResponse(BaseModel):
    """Response for task status check"""
    task_id: str
    status: str
    progress: Optional[dict] = None
    result: Optional[dict] = None
    error: Optional[str] = None


class VisionBatchRequest(BaseModel):
    """Request for batch vision analysis"""
    image_paths: list[str]
    semantic_classes: list[str]
    semantic_countability: list[int]
    openness_list: list[int]
    output_dir: Optional[str] = None


class MetricsBatchRequest(BaseModel):
    """Request for batch metrics calculation"""
    indicator_id: str
    image_paths: list[str]
    output_path: Optional[str] = None


class MultiIndicatorRequest(BaseModel):
    """Request for multi-indicator calculation"""
    indicator_ids: list[str]
    image_paths: list[str]
    output_dir: Optional[str] = None


def get_celery_app():
    """Get Celery app instance"""
    try:
        from app.core.celery_app import celery_app
        return celery_app
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Celery not available: {e}. Make sure Redis is running."
        )


@router.post("/vision/batch", response_model=TaskSubmitResponse)
async def submit_vision_batch(request: VisionBatchRequest):
    """Submit batch vision analysis task"""
    celery_app = get_celery_app()

    from app.tasks.vision_tasks import batch_analyze_task

    request_data = {
        "semantic_classes": request.semantic_classes,
        "semantic_countability": request.semantic_countability,
        "openness_list": request.openness_list,
    }

    task = batch_analyze_task.delay(
        request.image_paths,
        request_data,
        request.output_dir,
    )

    return TaskSubmitResponse(
        task_id=task.id,
        status="PENDING",
        message=f"Task submitted for {len(request.image_paths)} images",
    )


@router.post("/metrics/batch", response_model=TaskSubmitResponse)
async def submit_metrics_batch(request: MetricsBatchRequest):
    """Submit batch metrics calculation task"""
    celery_app = get_celery_app()

    from app.tasks.metrics_tasks import calculate_batch_task

    task = calculate_batch_task.delay(
        request.indicator_id,
        request.image_paths,
        request.output_path,
    )

    return TaskSubmitResponse(
        task_id=task.id,
        status="PENDING",
        message=f"Task submitted for {len(request.image_paths)} images with {request.indicator_id}",
    )


@router.post("/metrics/multi", response_model=TaskSubmitResponse)
async def submit_multi_indicator(request: MultiIndicatorRequest):
    """Submit multi-indicator calculation task"""
    celery_app = get_celery_app()

    from app.tasks.metrics_tasks import calculate_multi_indicator_task

    task = calculate_multi_indicator_task.delay(
        request.indicator_ids,
        request.image_paths,
        request.output_dir,
    )

    total_ops = len(request.indicator_ids) * len(request.image_paths)

    return TaskSubmitResponse(
        task_id=task.id,
        status="PENDING",
        message=f"Task submitted: {len(request.indicator_ids)} indicators x {len(request.image_paths)} images = {total_ops} calculations",
    )


@router.get("/{task_id}", response_model=TaskStatusResponse)
async def get_task_status(task_id: str):
    """Get status of a task"""
    celery_app = get_celery_app()

    from celery.result import AsyncResult

    task_result = AsyncResult(task_id, app=celery_app)

    response = TaskStatusResponse(
        task_id=task_id,
        status=task_result.status,
    )

    if task_result.status == "PROGRESS":
        response.progress = task_result.info
    elif task_result.status == "SUCCESS":
        response.result = task_result.result
    elif task_result.status == "FAILURE":
        response.error = str(task_result.result)

    return response


@router.delete("/{task_id}")
async def cancel_task(task_id: str):
    """Cancel a running task"""
    celery_app = get_celery_app()

    from celery.result import AsyncResult

    task_result = AsyncResult(task_id, app=celery_app)
    task_result.revoke(terminate=True)

    return {
        "task_id": task_id,
        "status": "REVOKED",
        "message": "Task cancellation requested",
    }


@router.get("")
async def list_active_tasks():
    """List active tasks (requires Celery inspection)"""
    try:
        celery_app = get_celery_app()
        inspect = celery_app.control.inspect()

        active = inspect.active() or {}
        reserved = inspect.reserved() or {}
        scheduled = inspect.scheduled() or {}

        return {
            "active": active,
            "reserved": reserved,
            "scheduled": scheduled,
        }
    except Exception as e:
        return {
            "error": str(e),
            "message": "Could not inspect workers. Is Celery running?",
        }
