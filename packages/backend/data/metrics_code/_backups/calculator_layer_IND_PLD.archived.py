"""Calculator Layer.

Indicator ID:   IND_PLD
Indicator Name: Plant Level Diversity
Type:           TYPE B (custom layer-aware)

Description:
    Diversity of plant landscape strata (grass, flowers, shrubs/plants, trees) seen in a street view. Operationalized as the count, Shannon-entropy, or Simpson form computed over the four vertical-vegetation classes obtained from semantic segmentation. Captures vertical layering richness rather than ove

Formula: Level Diversity (richness) = N;  Level Diversity (entropy) = -Sum_{i=1..N} Pi * log2(Pi);  Level Diversity (simpson) = 1 - Sum_{i=1..N} (Pi/P)^2,  where i in {tree, shrub/plant, grass, flower}

This calculator computes a non-ratio statistic (non-ratio statistic) over the raw
RGB / semantic pixels of the image, optionally restricted to a spatial
layer mask (foreground / middleground / background) via
`calculate_for_layer`.
"""

import numpy as np
from PIL import Image
from typing import Dict, Optional


INDICATOR = {
    "id": "IND_PLD",
    "name": "Plant Level Diversity",
    "unit": "%",
    "formula": "Level Diversity (richness) = N;  Level Diversity (entropy) = -Sum_{i=1..N} Pi * log2(Pi);  Level Diversity (simpson) = 1 - Sum_{i=1..N} (Pi/P)^2,  where i in {tree, shrub/plant, grass, flower}",
    "target_direction": "NEUTRAL",
    "definition": "Diversity of plant landscape strata (grass, flowers, shrubs/plants, trees) seen in a street view. Operationalized as the count, Shannon-entropy, or Simpson form computed over the four vertical-vegetation classes obtained from semantic segmentation. Captures vertical layering richness rather than ove",
    "category": "CAT_CMP",
    "calc_type": "custom",
    "variables": "N = number of plant strata present (range {0..4}); Pi = pixel proportion of stratum i; P = total proportion across plant strata",
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
    """Plant Level Diversity: Shannon entropy over plant layers (canopy/shrub/grass)."""
    try:
        img = Image.open(image_path).convert('RGB')
        arr = np.array(img)
        mask = _load_mask(mask_path, arr.shape[:2])
        # Plant layer classes
        layer_classes = {
            'canopy': ['tree','palm;palm;tree'],
            'shrub_flower': ['plant;flora;plant;life','flower'],
            'grass': ['grass'],
        }
        counts = {}
        for layer_name, cls_list in layer_classes.items():
            n = 0
            for cn in cls_list:
                if cn in semantic_colors:
                    rgb = semantic_colors[cn]
                    match = (arr[:,:,0]==rgb[0]) & (arr[:,:,1]==rgb[1]) & (arr[:,:,2]==rgb[2])
                    if mask is not None: match &= mask
                    n += int(np.sum(match))
            if n > 0: counts[layer_name] = n
        if not counts:
            return {'success': True, 'value': 0.0, 'target_pixels': 0, 'total_pixels': 0}
        N = sum(counts.values())
        p = np.array([c/N for c in counts.values()])
        H = -np.sum(p * np.log2(p + 1e-10))
        return {'success': True, 'value': round(float(H), 4),
                'target_pixels': N, 'total_pixels': N}
    except Exception as e:
        return {'success': False, 'value': None, 'error': str(e)}



def calculate_indicator(image_path: str) -> Dict:
    """Whole-image calculation (no mask)."""
    return calculate_for_layer(image_path, None)
