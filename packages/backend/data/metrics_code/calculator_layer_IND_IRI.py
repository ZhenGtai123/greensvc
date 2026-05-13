"""Calculator Layer.

Indicator ID:   IND_IRI
Indicator Name: Interfacial Richness Index
Type:           TYPE B (custom layer-aware)

Description:
    Number of distinct semantic categories detected in a street-view image divided by the total number of categories supported by the segmentation model; measures categorical richness of the streetscape interface.

Formula: IRI = N_categories_detected / N_categories_total

This calculator computes a non-ratio statistic (non-ratio statistic) over the raw
RGB / semantic pixels of the image, optionally restricted to a spatial
layer mask (foreground / middleground / background) via
`calculate_for_layer`.
"""

import numpy as np
from PIL import Image
from typing import Dict, Optional


INDICATOR = {
    "id": "IND_IRI",
    "name": "Interfacial Richness Index",
    "unit": "%",
    "formula": "IRI = N_categories_detected / N_categories_total",
    "target_direction": "NEUTRAL",
    "definition": "Number of distinct semantic categories detected in a street-view image divided by the total number of categories supported by the segmentation model; measures categorical richness of the streetscape interface.",
    "category": "CAT_CMP",
    "calc_type": "custom",
    "variables": "N_categories_detected = number of segmentation classes with at least one pixel in the image; N_categories_total = total number of classes the segmentation model can output",
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
    """Interfacial Richness Index: count of distinct semantic classes / total namespace size."""
    try:
        img = Image.open(image_path).convert('RGB')
        arr = np.array(img)
        mask = _load_mask(mask_path, arr.shape[:2])
        if mask is not None:
            pixels = arr[mask].reshape(-1, 3)
        else:
            pixels = arr.reshape(-1, 3)
        unique_colors = set(tuple(p) for p in pixels)
        # Total possible classes from semantic_colors
        total_classes = len(semantic_colors) if 'semantic_colors' in globals() else 150
        n_classes = len(unique_colors)
        value = n_classes / total_classes * 100.0
        return {'success': True, 'value': round(value, 3),
                'target_pixels': n_classes, 'total_pixels': total_classes}
    except Exception as e:
        return {'success': False, 'value': None, 'error': str(e)}



def calculate_indicator(image_path: str) -> Dict:
    """Whole-image calculation (no mask)."""
    return calculate_for_layer(image_path, None)
