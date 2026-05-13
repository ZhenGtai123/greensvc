"""Calculator Layer.

Indicator ID:   IND_NAT_ART
Indicator Name: Natural-to-Artificial Element Ratio
Type:           TYPE A (ratio mode)

Description:
    Ratio of the average proportion of natural-element pixels (trees, grass, water, mountains, plants) to the average proportion of artificial-element pixels (buildings, walls, roads, pavement, fences) across all SVIs at a sample location. Captures how nature-dominated the visible streetscape is relativ

Formula: Ni = [ (1/n) Sum(Tn) + (1/n) Sum(Gn) + (1/n) Sum(W1n) + (1/n) Sum(M1n) + (1/n) Sum(P1n) ] / [ (1/n) Sum(Bn) + (1/n) Sum(W2n) + (1/n) Sum(Rn) + (1/n) Sum(P2n) + (1/n) Sum(Fn) ]
"""

import numpy as np
from PIL import Image
from typing import Dict


INDICATOR = {
    "id": "IND_NAT_ART",
    "name": "Natural-to-Artificial Element Ratio",
    "unit": "%",
    "formula": "Ni = [ (1/n) Sum(Tn) + (1/n) Sum(Gn) + (1/n) Sum(W1n) + (1/n) Sum(M1n) + (1/n) Sum(P1n) ] / [ (1/n) Sum(Bn) + (1/n) Sum(W2n) + (1/n) Sum(Rn) + (1/n) Sum(P2n) + (1/n) Sum(Fn) ]",
    "target_direction": "NEUTRAL",
    "definition": "Ratio of the average proportion of natural-element pixels (trees, grass, water, mountains, plants) to the average proportion of artificial-element pixels (buildings, walls, roads, pavement, fences) across all SVIs at a sample location. Captures how nature-dominated the visible streetscape is relativ",
    "category": "CAT_CMP",
    "calc_type": "ratio",
    "target_classes": ['tree', 'grass', 'plant;flora;plant;life', 'palm;palm;tree', 'flower', 'water', 'sea', 'river', 'mountain;mount', 'rock;stone', 'land;ground;soil', 'sand'],
    "variables": "Tn = % tree pixels; Gn = % grass pixels; W1n = % water pixels; M1n = % mountain pixels; P1n = % plant pixels; Bn = % building pixels; W2n = % wall pixels; Rn = % road pixels; P2n = % pavement pixels; Fn = % fence pixels; n = number of images at the site",
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
