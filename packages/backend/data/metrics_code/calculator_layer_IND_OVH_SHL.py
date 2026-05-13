"""Calculator Layer.

Indicator ID:   IND_OVH_SHL
Indicator Name: Overhead Shelter Ratio
Type:           TYPE A (ratio mode)

Description:
    Pixel-area proportion of overhead-sheltering elements (trees, ceiling, canopy) in the TOP VIEW of a panorama (i.e. the bird's-eye sub-image of a 360° GSV panorama, not the upright street-view image); operationalizes the PSD 'sheltered' dimension as a feeling of safety and shelter.

Formula: Overhead = (Pixels_tree + Pixels_ceiling + Pixels_canopy) / Pixels_total_topview
"""

import numpy as np
from PIL import Image
from typing import Dict


INDICATOR = {
    "id": "IND_OVH_SHL",
    "name": "Overhead Shelter Ratio",
    "unit": "%",
    "formula": "Overhead = (Pixels_tree + Pixels_ceiling + Pixels_canopy) / Pixels_total_topview",
    "target_direction": "NEUTRAL",
    "definition": "Pixel-area proportion of overhead-sheltering elements (trees, ceiling, canopy) in the TOP VIEW of a panorama (i.e. the bird's-eye sub-image of a 360° GSV panorama, not the upright street-view image); operationalizes the PSD 'sheltered' dimension as a feeling of safety and shelter.",
    "category": "CAT_CMP",
    "calc_type": "ratio",
    "target_classes": ['tree', 'ceiling', 'awning;sunshade;sunblind', 'palm;palm;tree'],
    "variables": {"Pixels_tree": "Pixels classified as 'tree' by PSPNet (ADE20K) within the top-view sub-image of the panorama", "Pixels_ceiling": "Pixels classified as 'ceiling' within the top-view sub-image", "Pixels_canopy": "Pixels classified as 'canopy' (e.g. rain shelter) within the top-view sub-image", "Pixels_total_topview": "Total pixel count of the top-view sub-image of the panorama"},
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
