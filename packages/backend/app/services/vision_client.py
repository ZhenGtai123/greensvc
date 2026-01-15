"""
Vision Model API Client
Async HTTP client for communicating with the Vision API backend
"""

import json
import time
import logging
from typing import Optional
from pathlib import Path

import httpx

from app.models.vision import VisionAnalysisRequest, VisionAnalysisResponse

logger = logging.getLogger(__name__)


class VisionModelClient:
    """Async Vision Model API client"""

    def __init__(self, base_url: str, timeout: float = 600.0):
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self._health_cache: Optional[bool] = None
        self._health_cache_time: float = 0
        self._config_cache: Optional[dict] = None

    def _get_default_colors(self) -> dict:
        """Get default color configuration"""
        semantic_colors = {
            "0": [0, 0, 0], "1": [6, 230, 230], "2": [4, 250, 7],
            "3": [250, 127, 4], "4": [4, 200, 3], "5": [204, 255, 4],
            "6": [9, 7, 230], "7": [120, 120, 70], "8": [180, 120, 120],
            "9": [255, 41, 10], "10": [150, 5, 61], "11": [120, 120, 120],
            "12": [140, 140, 140], "13": [235, 255, 7], "14": [255, 82, 0],
            "15": [0, 102, 200], "16": [204, 70, 3], "17": [255, 31, 0],
            "18": [255, 224, 0], "19": [255, 184, 6], "20": [255, 5, 153],
        }

        # Generate additional colors for up to 100 classes
        import random
        random.seed(42)
        color_set = set(tuple(c) for c in semantic_colors.values())

        for i in range(21, 100):
            while True:
                new_color = [random.randint(30, 255) for _ in range(3)]
                if tuple(new_color) not in color_set:
                    semantic_colors[str(i)] = new_color
                    color_set.add(tuple(new_color))
                    break

        return {
            'semantic_colors': semantic_colors,
            'openness_colors': {"0": [113, 6, 230], "1": [173, 255, 0]},
            'fmb_colors': {"0": [220, 20, 60], "1": [46, 125, 50], "2": [30, 144, 255]}
        }

    def _generate_colors_for_classes(self, num_classes: int) -> dict[str, list[int]]:
        """Generate color mapping for specified number of classes"""
        colors = self._get_default_colors()['semantic_colors']
        return {str(i): colors.get(str(i), [128, 128, 128]) for i in range(num_classes + 1)}

    async def check_health(self) -> bool:
        """Check API health status with caching"""
        current_time = time.time()
        if self._health_cache is not None and current_time - self._health_cache_time < 5:
            return self._health_cache

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.base_url}/health", timeout=3.0)
                if response.status_code == 200:
                    data = response.json()
                    self._health_cache = data.get('status') == 'healthy'
                else:
                    self._health_cache = False
        except Exception as e:
            logger.warning(f"Health check failed: {e}")
            self._health_cache = False

        self._health_cache_time = current_time
        return self._health_cache

    async def get_config(self) -> Optional[dict]:
        """Get API configuration with caching"""
        if self._config_cache is not None:
            return self._config_cache

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.base_url}/config", timeout=5.0)
                if response.status_code == 200:
                    self._config_cache = response.json()
                    return self._config_cache
        except Exception as e:
            logger.error(f"Failed to get config: {e}")

        return None

    async def analyze_image(
        self,
        image_path: str,
        request: VisionAnalysisRequest,
    ) -> VisionAnalysisResponse:
        """
        Analyze image using Vision API

        Args:
            image_path: Path to the image file
            request: Analysis request parameters

        Returns:
            VisionAnalysisResponse with results
        """
        try:
            # Validate file exists
            path = Path(image_path)
            if not path.exists():
                return VisionAnalysisResponse(
                    status="error",
                    error=f"Image file not found: {image_path}"
                )

            # Generate colors
            semantic_colors = self._generate_colors_for_classes(len(request.semantic_classes))
            default_colors = self._get_default_colors()

            # Prepare request data
            request_data = {
                "image_id": request.image_id or f"img_{int(time.time() * 1000)}",
                "semantic_classes": request.semantic_classes,
                "semantic_countability": request.semantic_countability,
                "openness_list": request.openness_list,
                "encoder": request.encoder,
                "semantic_colors": semantic_colors,
                "openness_colors": default_colors['openness_colors'],
                "fmb_colors": default_colors['fmb_colors'],
                "segmentation_mode": request.segmentation_mode,
                "detection_threshold": request.detection_threshold,
                "min_object_area_ratio": request.min_object_area_ratio,
                "enable_hole_filling": request.enable_hole_filling,
            }

            start_time = time.time()

            async with httpx.AsyncClient(timeout=self.timeout) as client:
                with open(image_path, 'rb') as f:
                    files = {'file': (path.name, f, 'image/jpeg')}
                    data = {'request_data': json.dumps(request_data)}

                    response = await client.post(
                        f"{self.base_url}/analyze",
                        files=files,
                        data=data,
                    )

            elapsed_time = time.time() - start_time

            if response.status_code == 200:
                result = response.json()

                if result.get('status') == 'success':
                    # Process image data (convert hex to bytes)
                    processed_images = {}
                    if 'images' in result:
                        for key, hex_data in result['images'].items():
                            if isinstance(hex_data, str):
                                processed_images[key] = bytes.fromhex(hex_data)

                    return VisionAnalysisResponse(
                        status="success",
                        image_path=image_path,
                        processing_time=elapsed_time,
                        encoder=request.encoder,
                        segmentation_mode=result.get('segmentation_mode', request.segmentation_mode),
                        hole_filling_enabled=result.get('hole_filling_enabled', False),
                        image_count=len(processed_images),
                        statistics={
                            'detected_classes': result.get('detected_classes', 0),
                            'total_classes': result.get('total_classes', len(request.semantic_classes)),
                            'class_statistics': result.get('class_statistics', {}),
                            'fmb_statistics': result.get('fmb_statistics', {}),
                        },
                        images=processed_images,
                        instances=result.get('instances', []),
                    )
                else:
                    return VisionAnalysisResponse(
                        status="error",
                        error=result.get('detail', 'API returned error status')
                    )
            else:
                error_msg = f"API error: {response.status_code}"
                try:
                    error_detail = response.json()
                    error_msg += f" - {error_detail.get('detail', response.text[:200])}"
                except Exception:
                    error_msg += f" - {response.text[:200]}"

                return VisionAnalysisResponse(status="error", error=error_msg)

        except Exception as e:
            logger.error(f"Vision API exception: {e}", exc_info=True)
            return VisionAnalysisResponse(status="error", error=str(e))

    async def batch_analyze(
        self,
        image_paths: list[str],
        request: VisionAnalysisRequest,
    ) -> list[VisionAnalysisResponse]:
        """Analyze multiple images"""
        results = []
        for idx, image_path in enumerate(image_paths):
            logger.info(f"Batch analyzing image {idx + 1}/{len(image_paths)}")
            result = await self.analyze_image(image_path, request)
            results.append(result)
        return results

    def validate_parameters(
        self,
        semantic_classes: list[str],
        semantic_countability: list[int],
        openness_list: list[int],
    ) -> tuple[bool, str]:
        """Validate analysis parameters"""
        if not semantic_classes:
            return False, "Semantic classes list cannot be empty"

        if len(semantic_classes) > 99:
            return False, f"Class count ({len(semantic_classes)}) exceeds maximum (99)"

        if len(semantic_countability) != len(semantic_classes):
            return False, f"Countability length ({len(semantic_countability)}) doesn't match classes ({len(semantic_classes)})"

        if len(openness_list) != len(semantic_classes):
            return False, f"Openness length ({len(openness_list)}) doesn't match classes ({len(semantic_classes)})"

        if not all(x in [0, 1] for x in semantic_countability):
            return False, "Countability values must be 0 or 1"

        if not all(x in [0, 1] for x in openness_list):
            return False, "Openness values must be 0 or 1"

        return True, ""
