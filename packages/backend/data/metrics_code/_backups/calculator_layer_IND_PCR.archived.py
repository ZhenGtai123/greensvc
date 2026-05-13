"""Calculator Layer.

Indicator ID:   IND_PCR
Indicator Name: Plant Color Richness
Type:           TYPE B (custom layer-aware)

Description:
    An entropy-based color richness index applied specifically to plant pixels (after extracting plant regions from semantic segmentation). It multiplies a color-saturation factor M (sigma_rgyb + 0.3*mu_rgyb, the same construct used in CSI) by the Shannon-entropy term of pixel grayscale probabilities, y

Formula: C = Sum_{i=1..n} M * Pi * log(Pi),  with rg = R - G;  yb = 0.5*(R+G) - B;  sigma_rgyb = sqrt(sigma_rg^2 + sigma_yb^2);  mu_rgyb = sqrt(mu_rg^2 + mu_yb^2);  M = sigma_rgyb + 0.3 * mu_rgyb

This calculator computes a non-ratio statistic (non-ratio statistic) over the raw
RGB / semantic pixels of the image, optionally restricted to a spatial
layer mask (foreground / middleground / background) via
`calculate_for_layer`.
"""

import numpy as np
from PIL import Image
from typing import Dict, Optional


INDICATOR = {
    "id": "IND_PCR",
    "name": "Plant Color Richness",
    "unit": "%",
    "formula": "C = Sum_{i=1..n} M * Pi * log(Pi),  with rg = R - G;  yb = 0.5*(R+G) - B;  sigma_rgyb = sqrt(sigma_rg^2 + sigma_yb^2);  mu_rgyb = sqrt(mu_rg^2 + mu_yb^2);  M = sigma_rgyb + 0.3 * mu_rgyb",
    "target_direction": "NEUTRAL",
    "definition": "An entropy-based color richness index applied specifically to plant pixels (after extracting plant regions from semantic segmentation). It multiplies a color-saturation factor M (sigma_rgyb + 0.3*mu_rgyb, the same construct used in CSI) by the Shannon-entropy term of pixel grayscale probabilities, y",
    "category": "CAT_CMP",
    "calc_type": "custom",
    "variables": "R, G, B = pixel RGB values (plant pixels only); sigma_rg, sigma_yb = std dev of rg and yb; mu_rg, mu_yb = means; Pi = probability of grayscale level i; M = color factor (same as CSI base)",
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
    """Plant Color Richness: Hasler-Susstrunk colorfulness restricted to vegetation pixels."""
    try:
        img = Image.open(image_path).convert('RGB')
        arr = np.array(img).astype(np.float64)
        # Build vegetation mask using semantic_colors
        veg_classes = ['tree','grass','plant;flora;plant;life','palm;palm;tree','flower']
        veg_mask = np.zeros(arr.shape[:2], dtype=bool)
        for cn in veg_classes:
            if cn in semantic_colors:
                rgb = semantic_colors[cn]
                match = (arr[:,:,0].astype(int)==rgb[0]) & (arr[:,:,1].astype(int)==rgb[1]) & (arr[:,:,2].astype(int)==rgb[2])
                veg_mask |= match
        layer_mask = _load_mask(mask_path, arr.shape[:2])
        if layer_mask is not None: veg_mask &= layer_mask
        pixels = arr[veg_mask]
        if len(pixels) == 0:
            return {'success': True, 'value': 0.0, 'target_pixels': 0, 'total_pixels': 0}
        R, G, B = pixels[:,0], pixels[:,1], pixels[:,2]
        rg = R - G; yb = 0.5*(R+G) - B
        sigma = np.sqrt(np.var(rg) + np.var(yb))
        mu = np.sqrt(np.mean(rg)**2 + np.mean(yb)**2)
        colorfulness = float(sigma + 0.3 * mu)
        return {'success': True, 'value': round(colorfulness, 3),
                'target_pixels': int(len(pixels)), 'total_pixels': int(len(pixels))}
    except Exception as e:
        return {'success': False, 'value': None, 'error': str(e)}



def calculate_indicator(image_path: str) -> Dict:
    """Whole-image calculation (no mask)."""
    return calculate_for_layer(image_path, None)
