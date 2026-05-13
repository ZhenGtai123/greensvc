"""Calculator Layer.

Indicator ID:   IND_VGV
Indicator Name: Visual Greenery Vector / Field (VGF)
Type:           TYPE B (custom layer-aware)

Description:
    A 2D vector at each sampling point whose components are signed sums of directional GVI values (north-south on Y; east-west on X), so that the magnitude expresses the strength and the orientation expresses the direction of maximum visible greenery (after Stancato 2024). The collection of such vectors

Formula: v_x = GVI_E - GVI_W ; v_y = GVI_N - GVI_S ; |v| = sqrt(v_x^2 + v_y^2) ; theta = atan2(v_y, v_x)  [theta is implicit in the paper but standard]

This calculator computes a non-ratio statistic (non-ratio statistic) over the raw
RGB / semantic pixels of the image, optionally restricted to a spatial
layer mask (foreground / middleground / background) via
`calculate_for_layer`.
"""

import numpy as np
from PIL import Image
from typing import Dict, Optional


INDICATOR = {
    "id": "IND_VGV",
    "name": "Visual Greenery Vector / Field (VGF)",
    "unit": "%",
    "formula": "v_x = GVI_E - GVI_W ; v_y = GVI_N - GVI_S ; |v| = sqrt(v_x^2 + v_y^2) ; theta = atan2(v_y, v_x)  [theta is implicit in the paper but standard]",
    "target_direction": "INCREASE",
    "definition": "A 2D vector at each sampling point whose components are signed sums of directional GVI values (north-south on Y; east-west on X), so that the magnitude expresses the strength and the orientation expresses the direction of maximum visible greenery (after Stancato 2024). The collection of such vectors",
    "category": "CAT_CFG",
    "calc_type": "custom",
    "variables": {"GVI_N, GVI_S, GVI_E, GVI_W": "GVI computed from each of four 90-deg-FOV cardinal-direction images at the same location; vegetation class is the ADE20K aggregate tree, plant, palm, grass, flower, field", "v_x, v_y": "X (east-west) and Y (north-south) components of the synthetic greenery vector", "|v|": "Magnitude (intensity) of the visual greenery vector", "theta": "Direction (angle from +X / east axis) of the visual greenery vector — derived as atan2(v_y, v_x); paper gives the vector but does not write theta explicitly"},
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
    """Visual Greenery Vector. Returns magnitude over the region using 4 quadrants as proxy directions."""
    try:
        img = Image.open(image_path).convert('RGB')
        arr = np.array(img)
        H, W, _ = arr.shape
        mask = _load_mask(mask_path, arr.shape[:2])
        veg = np.zeros(arr.shape[:2], dtype=bool)
        for cn in ['tree','grass','plant;flora;plant;life','palm;palm;tree','flower']:
            if cn in semantic_colors:
                rgb = semantic_colors[cn]
                m = (arr[:,:,0]==rgb[0]) & (arr[:,:,1]==rgb[1]) & (arr[:,:,2]==rgb[2])
                veg |= m
        if mask is not None: veg &= mask; base = mask
        else: base = np.ones(arr.shape[:2], dtype=bool)
        # 4 quadrants as proxy for E/W/N/S
        h2, w2 = H//2, W//2
        def gvi(r1,r2,c1,c2):
            sub = veg[r1:r2,c1:c2]; sub_base = base[r1:r2,c1:c2]
            return float(sub.sum()) / max(float(sub_base.sum()), 1) * 100
        N = gvi(0,h2,0,W); S = gvi(h2,H,0,W); W_g = gvi(0,H,0,w2); E_g = gvi(0,H,w2,W)
        vx = E_g - W_g; vy = N - S
        magnitude = float(np.sqrt(vx**2 + vy**2))
        return {'success': True, 'value': round(magnitude, 3),
                'target_pixels': int(np.sum(veg)), 'total_pixels': int(np.sum(base)),
                'class_breakdown': {'v_x': round(vx,3),'v_y': round(vy,3)}}
    except Exception as e:
        return {'success': False, 'value': None, 'error': str(e)}



def calculate_indicator(image_path: str) -> Dict:
    """Whole-image calculation (no mask)."""
    return calculate_for_layer(image_path, None)
