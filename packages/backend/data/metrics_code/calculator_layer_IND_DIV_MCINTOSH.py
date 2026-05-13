"""Calculator Layer.

Indicator ID:   IND_DIV_MCINTOSH
Indicator Name: McIntosh Visual Diversity Index
Type:           TYPE B (custom layer-aware)

Description:
    A multi-category diversity index applied to the pixel counts of five 'permanent' semantic-segmentation classes (greenery, building, sky/openness, road, sidewalk) aggregated over all k street-view images of a spatial unit; ranges from 0 (no diversity) to 1 (extreme diversity).

Formula: M = 1 - ( (N - sqrt( sum_{i=1..5} n_i^2 )) / (N - sqrt(N)) )

This calculator computes a non-ratio statistic (non-ratio statistic) over the raw
RGB / semantic pixels of the image, optionally restricted to a spatial
layer mask (foreground / middleground / background) via
`calculate_for_layer`.
"""

import numpy as np
from PIL import Image
from typing import Dict, Optional


INDICATOR = {
    "id": "IND_DIV_MCINTOSH",
    "name": "McIntosh Visual Diversity Index",
    "unit": "%",
    "formula": "M = 1 - ( (N - sqrt( sum_{i=1..5} n_i^2 )) / (N - sqrt(N)) )",
    "target_direction": "NEUTRAL",
    "definition": "A multi-category diversity index applied to the pixel counts of five 'permanent' semantic-segmentation classes (greenery, building, sky/openness, road, sidewalk) aggregated over all k street-view images of a spatial unit; ranges from 0 (no diversity) to 1 (extreme diversity).",
    "category": "CAT_CMP",
    "calc_type": "custom",
    "variables": {"n_i": "Pixel count of category i (i in [1,5]) summed over all k images, n_i = sum_{k} c_ki", "c_ki": "Pixel count of category i in image k", "N": "Grand total sum_{i=1..5} n_i (over the five permanent categories)", "k": "Index over street-view images in the spatial unit (block / neighbourhood / city)"},
    "confirmation_count": 1
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
    """McIntosh diversity: M = 1 - (N - sqrt(sum n_i^2)) / (N - sqrt(N)). Over semantic map within mask."""
    try:
        from collections import Counter
        img = Image.open(image_path).convert('RGB')
        arr = np.array(img)
        mask = _load_mask(mask_path, arr.shape[:2])
        if mask is not None:
            pixels = arr[mask].reshape(-1, 3)
        else:
            pixels = arr.reshape(-1, 3)
        if len(pixels) == 0:
            return {'success': True, 'value': 0.0, 'target_pixels': 0, 'total_pixels': 0}
        # Count unique colors (= unique semantic classes)
        pix_tuples = [tuple(p) for p in pixels]
        counts = Counter(pix_tuples)
        n_vec = np.array(list(counts.values()), dtype=np.float64)
        N = float(n_vec.sum())
        if N <= 1: return {'success': True, 'value': 0.0, 'target_pixels': int(N), 'total_pixels': int(N)}
        M = 1.0 - (N - np.sqrt(np.sum(n_vec**2))) / (N - np.sqrt(N))
        return {'success': True, 'value': round(float(M), 4),
                'target_pixels': int(N), 'total_pixels': int(N)}
    except Exception as e:
        return {'success': False, 'value': None, 'error': str(e)}



def calculate_indicator(image_path: str) -> Dict:
    """Whole-image calculation (no mask)."""
    return calculate_for_layer(image_path, None)
