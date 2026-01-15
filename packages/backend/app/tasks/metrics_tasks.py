"""
Metrics Calculation Async Tasks
Background tasks for batch metric calculations
"""

import json
import logging
from pathlib import Path
from typing import Optional
from datetime import datetime

from celery import shared_task

from app.core.config import get_settings
from app.services.metrics_calculator import MetricsCalculator

logger = logging.getLogger(__name__)


@shared_task(bind=True)
def calculate_batch_task(
    self,
    indicator_id: str,
    image_paths: list[str],
    output_path: Optional[str] = None,
) -> dict:
    """
    Async task for batch metric calculation

    Args:
        indicator_id: Indicator ID (e.g., "IND_ASV")
        image_paths: List of image paths
        output_path: Optional path to save JSON results

    Returns:
        Calculation results summary
    """
    settings = get_settings()
    calculator = MetricsCalculator(str(settings.metrics_code_full_path))

    # Load semantic colors
    semantic_config = settings.data_path / "Semantic_configuration.json"
    if semantic_config.exists():
        calculator.load_semantic_colors(str(semantic_config))

    results = []
    values = []
    total = len(image_paths)

    for idx, image_path in enumerate(image_paths):
        # Update progress
        self.update_state(
            state="PROGRESS",
            meta={
                "current": idx + 1,
                "total": total,
                "status": f"Calculating {indicator_id} for image {idx + 1}/{total}",
            }
        )

        result = calculator.calculate(indicator_id, image_path)
        results.append(result.model_dump())

        if result.success and result.value is not None:
            values.append(result.value)

    # Calculate statistics
    import numpy as np
    stats = {}
    if values:
        arr = np.array(values)
        stats = {
            "mean": float(np.mean(arr)),
            "std": float(np.std(arr)),
            "min": float(np.min(arr)),
            "max": float(np.max(arr)),
            "median": float(np.median(arr)),
        }

    summary = {
        "indicator_id": indicator_id,
        "total_images": total,
        "successful": len(values),
        "failed": total - len(values),
        "statistics": stats,
        "results": results,
        "computed_at": datetime.now().isoformat(),
    }

    # Save to file if output_path specified
    if output_path:
        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        summary["output_file"] = str(output_file)

    return summary


@shared_task(bind=True)
def calculate_multi_indicator_task(
    self,
    indicator_ids: list[str],
    image_paths: list[str],
    output_dir: Optional[str] = None,
) -> dict:
    """
    Calculate multiple indicators for multiple images

    Args:
        indicator_ids: List of indicator IDs
        image_paths: List of image paths
        output_dir: Optional directory for results

    Returns:
        Combined results for all indicators
    """
    settings = get_settings()
    calculator = MetricsCalculator(str(settings.metrics_code_full_path))

    # Load semantic colors
    semantic_config = settings.data_path / "Semantic_configuration.json"
    if semantic_config.exists():
        calculator.load_semantic_colors(str(semantic_config))

    all_results = {}
    total_ops = len(indicator_ids) * len(image_paths)
    current_op = 0

    for indicator_id in indicator_ids:
        indicator_results = []

        for image_path in image_paths:
            current_op += 1
            self.update_state(
                state="PROGRESS",
                meta={
                    "current": current_op,
                    "total": total_ops,
                    "indicator": indicator_id,
                    "status": f"Processing {indicator_id}: {current_op}/{total_ops}",
                }
            )

            result = calculator.calculate(indicator_id, image_path)
            indicator_results.append({
                "image_path": image_path,
                **result.model_dump(),
            })

        all_results[indicator_id] = indicator_results

    summary = {
        "indicators": indicator_ids,
        "total_images": len(image_paths),
        "total_calculations": total_ops,
        "results": all_results,
        "computed_at": datetime.now().isoformat(),
    }

    # Save combined results
    if output_dir:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        output_file = output_path / f"batch_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        summary["output_file"] = str(output_file)

    return summary
