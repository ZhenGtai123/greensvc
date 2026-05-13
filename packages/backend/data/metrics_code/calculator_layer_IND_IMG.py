"""Calculator Layer.

Indicator ID:   IND_IMG
Indicator Name: Imageability (Streetscape)
Type:           TYPE B (custom layer-aware)

Description:
    Average pixel proportion across n images of building, traffic-light, and traffic-sign elements at a sampling point. Operationalises Lynch's 'imageability' from street view images as the prevalence of distinctive landmark and signage elements.

Formula: I_k = (1/n) * sum_{j=1..n} B_jk + (1/n) * sum_{j=1..n} TL_jk + (1/n) * sum_{j=1..n} TS_jk

This calculator computes a non-ratio statistic (non-ratio statistic) over the raw
RGB / semantic pixels of the image, optionally restricted to a spatial
layer mask (foreground / middleground / background) via
`calculate_for_layer`.
"""

import numpy as np
from PIL import Image
from typing import Dict, Optional


INDICATOR = {
    "id": "IND_IMG",
    "name": "Imageability (Streetscape)",
    "unit": "%",
    "formula": "I_k = (1/n) * sum_{j=1..n} B_jk + (1/n) * sum_{j=1..n} TL_jk + (1/n) * sum_{j=1..n} TS_jk",
    "target_direction": "NEUTRAL",
    "definition": "Average pixel proportion across n images of building, traffic-light, and traffic-sign elements at a sampling point. Operationalises Lynch's 'imageability' from street view images as the prevalence of distinctive landmark and signage elements.",
    "category": "CAT_CCG",
    "calc_type": "custom",
    "variables": "n = number of images at sampling point k; B_jk = % building pixels in image j; TL_jk = % traffic-light pixels; TS_jk = % traffic-sign pixels",
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
    """Imageability composite: ratio of (buildings + trees + landmark-like classes)."""
    try:
        img = Image.open(image_path).convert('RGB')
        arr = np.array(img)
        mask = _load_mask(mask_path, arr.shape[:2])
        # Imageability classes (Tao 2022): buildings, towers, distinctive elements
        target_class_names = ['building;edifice','tower','tree','signboard;sign','sculpture']
        targets = []
        for cn in target_class_names:
            if cn in semantic_colors: targets.append(semantic_colors[cn])
        target_mask = np.zeros(arr.shape[:2], dtype=bool)
        for rgb in targets:
            match = (arr[:,:,0]==rgb[0]) & (arr[:,:,1]==rgb[1]) & (arr[:,:,2]==rgb[2])
            target_mask |= match
        if mask is not None:
            n_target = int(np.sum(target_mask & mask))
            n_total = int(np.sum(mask))
        else:
            n_target = int(np.sum(target_mask))
            n_total = int(target_mask.size)
        if n_total == 0:
            return {'success': True, 'value': 0.0, 'target_pixels': 0, 'total_pixels': 0}
        return {'success': True, 'value': round(n_target / n_total * 100.0, 3),
                'target_pixels': n_target, 'total_pixels': n_total}
    except Exception as e:
        return {'success': False, 'value': None, 'error': str(e)}



def calculate_indicator(image_path: str) -> Dict:
    """Whole-image calculation (no mask)."""
    return calculate_for_layer(image_path, None)
