"""Calculator Layer.

Indicator ID:   IND_GVI_HOR_BLW
Indicator Name: Below-Horizon Green View Index
Type:           TYPE A (ratio mode)

Description:
    Percentage of green-vegetation pixels located below the camera's 2.5 m horizon line in a GSV image — these pixels correspond to vegetation lower than 2.5 m (lawns, shrubs, small trees), which Li et al. 2015 treat as the potentially view-obstructing component of street greenery.

Formula: GVI_below = N(green pixels with row >= horizon_row) / N(total pixels); horizon_row = (H_image / 2) + f_px · tan(pitch_rad)  [Li et al. 2015, Eq. 4: Horizon = 150 + 200·tan(pitch) for 400×300 GSV image
"""

import numpy as np
from PIL import Image
from typing import Dict


INDICATOR = {
    "id": "IND_GVI_HOR_BLW",
    "name": "Below-Horizon Green View Index",
    "unit": "%",
    "formula": "GVI_below = N(green pixels with row >= horizon_row) / N(total pixels); horizon_row = (H_image / 2) + f_px · tan(pitch_rad)  [Li et al. 2015, Eq. 4: Horizon = 150 + 200·tan(pitch) for 400×300 GSV image",
    "target_direction": "INCREASE",
    "definition": "Percentage of green-vegetation pixels located below the camera's 2.5 m horizon line in a GSV image — these pixels correspond to vegetation lower than 2.5 m (lawns, shrubs, small trees), which Li et al. 2015 treat as the potentially view-obstructing component of street greenery.",
    "category": "CAT_CMP",
    "calc_type": "ratio",
    "target_classes": ['tree', 'grass', 'plant;flora;plant;life', 'palm;palm;tree'],
    "variables": {"green_pixels": "pixels classified as vegetation by the segmentation method", "total_pixels": "total pixel count of the image (= W * H_image)", "H_image": "image height in pixels (300 in Place Pulse 1.0)", "W": "image width in pixels (400 in Place Pulse 1.0)", "f_px": "camera focal length in pixels (200 for the Place Pulse 1.0 dataset)", "pitch_rad": "camera pitch angle in radians (signed; positive = camera tilted up)", "horizon_row": "pixel row index of the 2.5 m physical horizon line in the image"},
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
