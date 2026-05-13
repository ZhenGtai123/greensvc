"""Calculator Layer.

Indicator ID:   IND_DIV_SIMP
Indicator Name: Simpson Diversity Index
Type:           TYPE B (custom layer-aware)

Description:
    Simpson visual diversity D = 1 - Sum n_i(n_i-1)/(N(N-1)) computed over a fixed set of 5 segmentation categories (excluding sky) aggregated either per-image or across multiple images of a neighborhood.

Formula: D = 1 - sum_i [n_i * (n_i - 1)] / [N * (N - 1)]

This calculator computes a non-ratio statistic (non-ratio statistic) over the raw
RGB / semantic pixels of the image, optionally restricted to a spatial
layer mask (foreground / middleground / background) via
`calculate_for_layer`.
"""

import numpy as np
from PIL import Image
from typing import Dict, Optional


INDICATOR = {
    "id": "IND_DIV_SIMP",
    "name": "Simpson Diversity Index",
    "unit": "%",
    "formula": "D = 1 - sum_i [n_i * (n_i - 1)] / [N * (N - 1)]",
    "target_direction": "NEUTRAL",
    "definition": "Simpson visual diversity D = 1 - Sum n_i(n_i-1)/(N(N-1)) computed over a fixed set of 5 segmentation categories (excluding sky) aggregated either per-image or across multiple images of a neighborhood.",
    "category": "CAT_CFG",
    "calc_type": "custom",
    "variables": {"n_i": "Total pixel count in category i (summed across the k images of a neighborhood, i in 1..5; sky excluded)", "N": "Sum over all categories: N = Sum_i n_i", "k": "Number of images aggregated for the neighborhood", "categories": "5 selected segmentation categories (excludes sky to avoid dominance)"},
    "confirmation_count": 2
}


print(f"Calculator loaded: {INDICATOR['id']}")


def _load_mask(mask_path: Optional[str], target_shape) -> Optional[np.ndarray]:
    """Load a layer mask as boolean numpy array, resized to target_shape."""
    if not mask_path:
        return None
    try:
        with Image.open(mask_path) as mask_img:
            mask_img = mask_img.convert("L")
            if mask_img.size != (target_shape[1], target_shape[0]):
                mask_img = mask_img.resize((target_shape[1], target_shape[0]), Image.NEAREST)
            return np.array(mask_img) > 127
    except Exception:
        return None



def calculate_for_layer(image_path: str, mask_path: Optional[str] = None) -> Dict:
    """Simpson Diversity: D = 1 - sum(n_i*(n_i-1)) / (N*(N-1))."""
    try:
        from collections import Counter
        img = Image.open(image_path).convert('RGB')
        arr = np.array(img)
        mask = _load_mask(mask_path, arr.shape[:2])
        if mask is not None:
            pixels = arr[mask].reshape(-1, 3)
        else:
            pixels = arr.reshape(-1, 3)
        if len(pixels) <= 1:
            return {'success': True, 'value': 0.0, 'target_pixels': int(len(pixels)), 'total_pixels': int(len(pixels))}
        counts = Counter(tuple(p) for p in pixels)
        n_vec = np.array(list(counts.values()), dtype=np.float64)
        N = float(n_vec.sum())
        D = 1.0 - np.sum(n_vec * (n_vec - 1)) / (N * (N - 1))
        return {'success': True, 'value': round(float(D), 4),
                'target_pixels': int(N), 'total_pixels': int(N)}
    except Exception as e:
        return {'success': False, 'value': None, 'error': str(e)}



def calculate_indicator(image_path: str) -> Dict:
    """Whole-image calculation (no mask)."""
    return calculate_for_layer(image_path, None)
