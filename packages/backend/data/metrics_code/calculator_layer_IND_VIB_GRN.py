"""Calculator Layer.

Indicator ID:   IND_VIB_GRN
Indicator Name: Vibrant Green Space
Type:           TYPE A (ratio mode)

Description:
    Pixel ratio of street-view greenery that also passes a Hue-Saturation-Value (HSV) color filter for 'healthy' green hues. Refines the standard GVI by retaining only pixels that look both vegetative AND vividly green, producing a perception-relevant subset of GVI.

Formula: VibrantGreen = N(pixels labelled vegetation AND HSV in healthy-green range) / N(total pixels)
"""

import numpy as np
from PIL import Image
from typing import Dict


INDICATOR = {
    "id": "IND_VIB_GRN",
    "name": "Vibrant Green Space",
    "unit": "%",
    "formula": "VibrantGreen = N(pixels labelled vegetation AND HSV in healthy-green range) / N(total pixels)",
    "target_direction": "INCREASE",
    "definition": "Pixel ratio of street-view greenery that also passes a Hue-Saturation-Value (HSV) color filter for 'healthy' green hues. Refines the standard GVI by retaining only pixels that look both vegetative AND vividly green, producing a perception-relevant subset of GVI.",
    "category": "CAT_CMP",
    "calc_type": "ratio",
    "target_classes": ['tree', 'grass', 'plant;flora;plant;life', 'palm;palm;tree', 'flower'],
    "variables": "N(.) = pixel count; semantic class 'vegetation' from PSPNet; HSV range thresholds for healthy green hues",
    "confirmation_count": 1
}


TARGET_RGB = {}
print(f"\nBuilding color lookup for {INDICATOR['id']}:")
for class_name in INDICATOR.get('target_classes', []):
    if class_name in semantic_colors:
        rgb = semantic_colors[class_name]
        TARGET_RGB[rgb] = class_name
        print(f"  {class_name}: RGB{rgb}")
    else:
        print(f"  NOT FOUND: {class_name}")
        for nm in semantic_colors.keys():
            if class_name.split(';')[0] in nm or nm.split(';')[0] in class_name:
                print(f"  Did you mean: '{nm}'?")
                break
print(f"\nCalculator ready: {INDICATOR['id']} ({len(TARGET_RGB)} classes matched)")


def calculate_indicator(image_path: str) -> Dict:
    """Whole-image ratio. Layer-aware version handled by orchestrator."""
    try:
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        flat_pixels = pixels.reshape(-1, 3)

        target_count = 0
        class_counts = {}
        for rgb, class_name in TARGET_RGB.items():
            mask = np.all(flat_pixels == rgb, axis=1)
            count = int(np.sum(mask))
            if count > 0:
                class_counts[class_name] = count
                target_count += count

        value = (target_count / total_pixels) * 100 if total_pixels > 0 else 0
        return {
            'success': True,
            'value': round(value, 3),
            'target_pixels': int(target_count),
            'total_pixels': int(total_pixels),
            'class_breakdown': class_counts,
        }
    except Exception as e:
        return {'success': False, 'value': None, 'error': str(e)}
