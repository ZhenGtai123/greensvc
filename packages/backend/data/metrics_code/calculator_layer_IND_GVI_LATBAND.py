"""Calculator Layer.

Indicator ID:   IND_GVI_LATBAND
Indicator Name: Green Visibility by Latitude Band (Zenith-Angle Banded GVI)
Type:           TYPE B (custom layer-aware)

Description:
    Green visibility computed inside each of FOUR latitude (zenith-angle) bands (0-22.5 deg, 22.5-45.0 deg, 45.0-67.5 deg, 67.5-90.0 deg) on a sky-map (orthographic-projection fisheye) image obtained by transforming an equi-cylindrical GSV panorama; expresses how vegetation visibility varies with viewin

Formula: GV_band(k) = N(vegetation pixels in latitude band k) / N(total sky-map pixels in latitude band k), for k in {(0,22.5], (22.5,45], (45,67.5], (67.5,90]}, k = 1..4

This calculator computes a non-ratio statistic (non-ratio statistic) over the raw
RGB / semantic pixels of the image, optionally restricted to a spatial
layer mask (foreground / middleground / background) via
`calculate_for_layer`.
"""

import numpy as np
from PIL import Image
from typing import Dict, Optional


INDICATOR = {
    "id": "IND_GVI_LATBAND",
    "name": "Green Visibility by Latitude Band (Zenith-Angle Banded GVI)",
    "unit": "%",
    "formula": "GV_band(k) = N(vegetation pixels in latitude band k) / N(total sky-map pixels in latitude band k), for k in {(0,22.5], (22.5,45], (45,67.5], (67.5,90]}, k = 1..4",
    "target_direction": "INCREASE",
    "definition": "Green visibility computed inside each of FOUR latitude (zenith-angle) bands (0-22.5 deg, 22.5-45.0 deg, 45.0-67.5 deg, 67.5-90.0 deg) on a sky-map (orthographic-projection fisheye) image obtained by transforming an equi-cylindrical GSV panorama; expresses how vegetation visibility varies with viewin",
    "category": "CAT_CFG",
    "calc_type": "custom",
    "variables": {"GV_band(k)": "Green visibility within latitude band k of the sky-map", "k": "Latitude band index, k = 1..4 (Sakamoto et al. 2023 use exactly four bands)", "vegetation_pixels": "Pixels labeled as the 'vegetation' class (Sakamoto used a single vegetation aggregate class on a SegNet-style model trained on Cityscapes-like labels)", "total_pixels": "Total sky-map pixels falling inside band k (excluding non-sky-map area outside the orthographic disc)"},
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
    """GVI by 5 zenith-angle latitude bands. Returns mean GVI across bands (or per-band breakdown)."""
    try:
        img = Image.open(image_path).convert('RGB')
        arr = np.array(img)
        H, W, _ = arr.shape
        mask = _load_mask(mask_path, arr.shape[:2])
        # Vegetation mask
        veg = np.zeros(arr.shape[:2], dtype=bool)
        for cn in ['tree','grass','plant;flora;plant;life','palm;palm;tree','flower']:
            if cn in semantic_colors:
                rgb = semantic_colors[cn]
                m = (arr[:,:,0]==rgb[0]) & (arr[:,:,1]==rgb[1]) & (arr[:,:,2]==rgb[2])
                veg |= m
        if mask is not None:
            veg &= mask
            base_mask = mask
        else:
            base_mask = np.ones(arr.shape[:2], dtype=bool)
        # 5 latitude bands by image row position (0-22.5, 22.5-45, 45-67.5, 67.5-90, 90+)
        N_BANDS = 5
        band_h = H // N_BANDS
        band_gvis = []
        for k in range(N_BANDS):
            r1 = k*band_h
            r2 = (k+1)*band_h if k < N_BANDS-1 else H
            band_total = int(np.sum(base_mask[r1:r2,:]))
            band_veg = int(np.sum(veg[r1:r2,:]))
            if band_total > 0:
                band_gvis.append(band_veg / band_total * 100.0)
        if not band_gvis:
            return {'success': True, 'value': 0.0, 'target_pixels': 0, 'total_pixels': 0}
        mean_gvi = float(np.mean(band_gvis))
        return {'success': True, 'value': round(mean_gvi, 3),
                'target_pixels': int(np.sum(veg)), 'total_pixels': int(np.sum(base_mask)),
                'class_breakdown': {f'band_{i+1}': round(g,3) for i,g in enumerate(band_gvis)}}
    except Exception as e:
        return {'success': False, 'value': None, 'error': str(e)}



def calculate_indicator(image_path: str) -> Dict:
    """Whole-image calculation (no mask)."""
    return calculate_for_layer(image_path, None)
