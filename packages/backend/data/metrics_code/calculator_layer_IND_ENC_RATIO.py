"""Calculator Layer.

Indicator ID:   IND_ENC_RATIO
Indicator Name: Visual Enclosure Ratio (Vertical-to-Horizontal)
Type:           TYPE A (ratio mode)

Description:
    Ratio of mean enclosing-element pixel proportions (buildings + trees + walls) to mean opening/ground-element pixel proportions (pavement + fences + roads) across n SVIs sampled at a site. Higher values indicate stronger vertical-interface enclosure of the street/space. (Meng et al. 2024, Land, Table

Formula: DIE_i = [ (1/n)Sum_{k=1..n} B_k + (1/n)Sum_{k=1..n} T_k + (1/n)Sum_{k=1..n} W2_k ] / [ (1/n)Sum_{k=1..n} P1_k + (1/n)Sum_{k=1..n} F_k + (1/n)Sum_{k=1..n} R_k ]
"""

import numpy as np
from PIL import Image
from typing import Dict


INDICATOR = {
    "id": "IND_ENC_RATIO",
    "name": "Visual Enclosure Ratio (Vertical-to-Horizontal)",
    "unit": "%",
    "formula": "DIE_i = [ (1/n)Sum_{k=1..n} B_k + (1/n)Sum_{k=1..n} T_k + (1/n)Sum_{k=1..n} W2_k ] / [ (1/n)Sum_{k=1..n} P1_k + (1/n)Sum_{k=1..n} F_k + (1/n)Sum_{k=1..n} R_k ]",
    "target_direction": "NEUTRAL",
    "definition": "Ratio of mean enclosing-element pixel proportions (buildings + trees + walls) to mean opening/ground-element pixel proportions (pavement + fences + roads) across n SVIs sampled at a site. Higher values indicate stronger vertical-interface enclosure of the street/space. (Meng et al. 2024, Land, Table",
    "category": "CAT_CFG",
    "calc_type": "ratio",
    "target_classes": ['wall', 'building;edifice', 'fence;fencing', 'tree', 'column;pillar'],
    "variables": {"B_n": "percentage of building pixels in image n (DeepLabV3+ on ADE20K)", "T_n": "percentage of tree pixels in image n", "W2_n": "percentage of wall pixels in image n", "P1_n": "percentage of pavement pixels in image n", "F_n": "percentage of fence pixels in image n", "R_n": "percentage of road pixels in image n", "n": "number of panoramic SVIs sampled at a single site (Meng 2024 used n images per sample point)"},
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
