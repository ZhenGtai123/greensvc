"""
Metrics Calculation Service
Executes indicator calculations using calculator modules
"""

import os
import json
import logging
import importlib.util
from pathlib import Path
from typing import Optional, Any

import numpy as np

from app.models.metrics import CalculationResult, BatchCalculationResponse

logger = logging.getLogger(__name__)


class MetricsCalculator:
    """Metrics Calculator - executes indicator calculations"""

    def __init__(self, metrics_code_dir: str):
        self.metrics_code_dir = Path(metrics_code_dir)
        self.loaded_modules: dict[str, Any] = {}
        self.semantic_colors: dict[str, tuple[int, int, int]] = {}

        # Ensure directory exists
        self.metrics_code_dir.mkdir(parents=True, exist_ok=True)

    def load_semantic_colors(self, config_path: str) -> bool:
        """Load semantic color configuration from JSON"""
        try:
            path = Path(config_path)
            if not path.exists():
                logger.error(f"Semantic config not found: {config_path}")
                return False

            with open(path, 'r', encoding='utf-8') as f:
                config = json.load(f)

            self.semantic_colors = {}
            for item in config:
                name = item.get('name', '')
                hex_color = item.get('color', '')
                if name and hex_color:
                    h = hex_color.lstrip('#')
                    rgb = tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
                    self.semantic_colors[name] = rgb

            logger.info(f"Loaded {len(self.semantic_colors)} semantic classes")
            return True

        except Exception as e:
            logger.error(f"Failed to load semantic colors: {e}")
            return False

    def load_calculator_module(self, indicator_id: str) -> Optional[Any]:
        """Load a calculator module by indicator ID"""
        try:
            cache_key = f"calc_{indicator_id}"
            if cache_key in self.loaded_modules:
                return self.loaded_modules[cache_key]

            calc_path = self.metrics_code_dir / f"calculator_layer_{indicator_id}.py"
            if not calc_path.exists():
                logger.error(f"Calculator not found: {calc_path}")
                return None

            # Load module
            spec = importlib.util.spec_from_file_location(
                f"calculator_{indicator_id}",
                calc_path
            )
            module = importlib.util.module_from_spec(spec)

            # Inject semantic_colors before execution
            module.semantic_colors = self.semantic_colors

            # Execute module
            spec.loader.exec_module(module)

            # Validate required components
            if not hasattr(module, 'INDICATOR'):
                logger.error(f"Calculator missing INDICATOR dict: {indicator_id}")
                return None

            if not hasattr(module, 'calculate_indicator'):
                logger.error(f"Calculator missing calculate_indicator function: {indicator_id}")
                return None

            # Cache and return
            self.loaded_modules[cache_key] = module
            return module

        except Exception as e:
            logger.error(f"Failed to load calculator module {indicator_id}: {e}")
            return None

    def calculate(self, indicator_id: str, image_path: str) -> CalculationResult:
        """Calculate indicator for a single image"""
        try:
            module = self.load_calculator_module(indicator_id)
            if not module:
                return CalculationResult(
                    success=False,
                    indicator_id=indicator_id,
                    error=f"Failed to load calculator: {indicator_id}"
                )

            # Call calculate_indicator function
            result = module.calculate_indicator(image_path)

            return CalculationResult(
                success=result.get('success', False),
                indicator_id=indicator_id,
                indicator_name=module.INDICATOR.get('name', ''),
                value=result.get('value'),
                unit=module.INDICATOR.get('unit', ''),
                target_pixels=result.get('target_pixels'),
                total_pixels=result.get('total_pixels'),
                class_breakdown=result.get('class_breakdown', {}),
                error=result.get('error'),
                image_path=image_path,
            )

        except Exception as e:
            logger.error(f"Calculator error {indicator_id}: {e}")
            return CalculationResult(
                success=False,
                indicator_id=indicator_id,
                error=str(e),
                image_path=image_path,
            )

    def calculate_for_layer(
        self,
        indicator_id: str,
        semantic_map_path: str,
        mask_path: str,
    ) -> CalculationResult:
        """
        Calculate indicator within a masked spatial layer.

        Loads the calculator module's TARGET_RGB, counts matching pixels
        in the semantic map that fall within the mask region.
        """
        try:
            module = self.load_calculator_module(indicator_id)
            if not module:
                return CalculationResult(
                    success=False,
                    indicator_id=indicator_id,
                    error=f"Failed to load calculator: {indicator_id}",
                )

            from PIL import Image

            # Load semantic map as RGB numpy array
            sem_img = Image.open(semantic_map_path).convert("RGB")
            sem_arr = np.array(sem_img)

            # Load layer mask as grayscale
            mask_img = Image.open(mask_path).convert("L")
            mask_arr = np.array(mask_img) > 127  # boolean mask

            if mask_arr.shape[:2] != sem_arr.shape[:2]:
                # Resize mask to match semantic map
                mask_img = mask_img.resize((sem_arr.shape[1], sem_arr.shape[0]), Image.NEAREST)
                mask_arr = np.array(mask_img) > 127

            mask_pixels = int(np.sum(mask_arr))
            if mask_pixels == 0:
                return CalculationResult(
                    success=True,
                    indicator_id=indicator_id,
                    indicator_name=module.INDICATOR.get("name", ""),
                    value=0.0,
                    unit=module.INDICATOR.get("unit", ""),
                    target_pixels=0,
                    total_pixels=0,
                    image_path=semantic_map_path,
                )

            # Get TARGET_RGB from module (set by each calculator)
            target_rgb = getattr(module, "TARGET_RGB", None)
            if target_rgb is None:
                # Fallback: run full calculate_indicator on semantic map
                # (won't be layer-restricted but better than nothing)
                result = module.calculate_indicator(semantic_map_path)
                return CalculationResult(
                    success=result.get("success", False),
                    indicator_id=indicator_id,
                    indicator_name=module.INDICATOR.get("name", ""),
                    value=result.get("value"),
                    unit=module.INDICATOR.get("unit", ""),
                    target_pixels=result.get("target_pixels"),
                    total_pixels=result.get("total_pixels"),
                    error=result.get("error"),
                    image_path=semantic_map_path,
                )

            # Count target pixels within the masked region
            if isinstance(target_rgb, (list, tuple)) and len(target_rgb) == 3 and isinstance(target_rgb[0], (int, float)):
                # Single target color
                target_colors = [tuple(int(c) for c in target_rgb)]
            elif isinstance(target_rgb, (list, tuple)):
                # Multiple target colors
                target_colors = [tuple(int(c) for c in rgb) for rgb in target_rgb]
            else:
                target_colors = []

            target_mask = np.zeros(sem_arr.shape[:2], dtype=bool)
            for rgb in target_colors:
                match = (
                    (sem_arr[:, :, 0] == rgb[0])
                    & (sem_arr[:, :, 1] == rgb[1])
                    & (sem_arr[:, :, 2] == rgb[2])
                )
                target_mask |= match

            # Combine: target pixels that are within the layer mask
            combined = target_mask & mask_arr
            target_pixels = int(np.sum(combined))
            value = (target_pixels / mask_pixels) * 100.0

            return CalculationResult(
                success=True,
                indicator_id=indicator_id,
                indicator_name=module.INDICATOR.get("name", ""),
                value=value,
                unit=module.INDICATOR.get("unit", ""),
                target_pixels=target_pixels,
                total_pixels=mask_pixels,
                image_path=semantic_map_path,
            )

        except Exception as e:
            logger.error("calculate_for_layer error %s: %s", indicator_id, e)
            return CalculationResult(
                success=False,
                indicator_id=indicator_id,
                error=str(e),
                image_path=semantic_map_path,
            )

    def batch_calculate(
        self,
        indicator_id: str,
        image_paths: list[str],
    ) -> BatchCalculationResponse:
        """Calculate indicator for multiple images"""
        results = []
        values = []

        for image_path in image_paths:
            result = self.calculate(indicator_id, image_path)
            results.append(result)
            if result.success and result.value is not None:
                values.append(result.value)

        # Get indicator info
        module = self.load_calculator_module(indicator_id)
        indicator_name = module.INDICATOR.get('name', '') if module else ''
        unit = module.INDICATOR.get('unit', '') if module else ''

        # Calculate statistics
        stats = {}
        if values:
            arr = np.array(values)
            stats = {
                'mean_value': float(np.mean(arr)),
                'std_value': float(np.std(arr)),
                'min_value': float(np.min(arr)),
                'max_value': float(np.max(arr)),
            }

        successful = sum(1 for r in results if r.success)

        return BatchCalculationResponse(
            success=successful > 0,
            indicator_id=indicator_id,
            indicator_name=indicator_name,
            unit=unit,
            total_images=len(image_paths),
            successful_calculations=successful,
            failed_calculations=len(image_paths) - successful,
            results=results,
            **stats,
        )

    def get_calculator_info(self, indicator_id: str) -> Optional[dict]:
        """Get INDICATOR dict from a calculator module"""
        module = self.load_calculator_module(indicator_id)
        if module and hasattr(module, 'INDICATOR'):
            return dict(module.INDICATOR)
        return None

    def clear_cache(self) -> None:
        """Clear loaded modules cache"""
        self.loaded_modules.clear()
        logger.info("Cleared calculator module cache")
