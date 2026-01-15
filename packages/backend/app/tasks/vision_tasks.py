"""
Vision Analysis Async Tasks
Long-running vision analysis tasks executed by Celery workers
"""

import json
import logging
from pathlib import Path
from typing import Optional

from celery import shared_task

from app.core.config import get_settings
from app.services.vision_client import VisionModelClient
from app.models.vision import VisionAnalysisRequest

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3)
def analyze_image_task(
    self,
    image_path: str,
    request_data: dict,
) -> dict:
    """
    Async task for single image analysis

    Args:
        image_path: Path to the image file
        request_data: VisionAnalysisRequest as dict

    Returns:
        Analysis result dict
    """
    import asyncio

    try:
        settings = get_settings()
        client = VisionModelClient(settings.vision_api_url)
        request = VisionAnalysisRequest(**request_data)

        # Run async function in sync context
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(
                client.analyze_image(image_path, request)
            )
        finally:
            loop.close()

        # Convert to serializable dict
        return {
            "status": result.status,
            "image_path": result.image_path,
            "processing_time": result.processing_time,
            "statistics": result.statistics,
            "error": result.error,
            # Note: images are bytes, need special handling for storage
            "image_count": result.image_count,
        }

    except Exception as e:
        logger.error(f"Vision analysis task failed: {e}")
        self.retry(countdown=60, exc=e)


@shared_task(bind=True)
def batch_analyze_task(
    self,
    image_paths: list[str],
    request_data: dict,
    output_dir: Optional[str] = None,
) -> dict:
    """
    Async task for batch image analysis

    Args:
        image_paths: List of image paths
        request_data: VisionAnalysisRequest as dict
        output_dir: Optional directory to save results

    Returns:
        Batch result summary
    """
    import asyncio

    settings = get_settings()
    client = VisionModelClient(settings.vision_api_url)
    request = VisionAnalysisRequest(**request_data)

    results = []
    successful = 0
    failed = 0

    total = len(image_paths)

    for idx, image_path in enumerate(image_paths):
        # Update task progress
        self.update_state(
            state="PROGRESS",
            meta={
                "current": idx + 1,
                "total": total,
                "status": f"Processing image {idx + 1}/{total}",
            }
        )

        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(
                    client.analyze_image(image_path, request)
                )
            finally:
                loop.close()

            if result.status == "success":
                successful += 1

                # Save result images if output_dir specified
                if output_dir and result.images:
                    save_result_images(image_path, result.images, output_dir)

            else:
                failed += 1

            results.append({
                "image_path": image_path,
                "status": result.status,
                "error": result.error,
            })

        except Exception as e:
            failed += 1
            results.append({
                "image_path": image_path,
                "status": "error",
                "error": str(e),
            })

    return {
        "total": total,
        "successful": successful,
        "failed": failed,
        "results": results,
        "output_dir": output_dir,
    }


def save_result_images(
    image_path: str,
    images: dict,
    output_dir: str,
) -> None:
    """Save result images to output directory"""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    image_name = Path(image_path).stem

    for img_type, img_bytes in images.items():
        if isinstance(img_bytes, bytes):
            file_path = output_path / f"{image_name}_{img_type}.png"
            with open(file_path, "wb") as f:
                f.write(img_bytes)
