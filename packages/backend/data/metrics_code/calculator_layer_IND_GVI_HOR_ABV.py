"""Calculator Layer.

Indicator ID:   IND_GVI_HOR_ABV
Indicator Name: Above-Horizon Green View Index
Type:           TYPE A (ratio mode)

Description:
    The percentage of green-vegetation pixels located above the camera 2.5 m horizon line (i.e. vegetation higher than the camera height of ~2.5 m) within a street-view image. It captures non-view-obstructing tree-canopy greenery and is computed by splitting the image at a horizon row that depends on ca

Formula: GVI_above = N(green_pixels with row < horizon_row) / N(total_pixels);    horizon_row = (H_img / 2) - f_px * tan(pitch_rad);    Place Pulse 1.0 specific: horizon_row = 150 - 200 * tan(pitch) for 400x30
"""

import numpy as np
from PIL import Image
from typing import Dict


INDICATOR = {
    "id": "IND_GVI_HOR_ABV",
    "name": "Above-Horizon Green View Index",
    "unit": "%",
    "formula": "GVI_above = N(green_pixels with row < horizon_row) / N(total_pixels);    horizon_row = (H_img / 2) - f_px * tan(pitch_rad);    Place Pulse 1.0 specific: horizon_row = 150 - 200 * tan(pitch) for 400x30",
    "target_direction": "INCREASE",
    "definition": "The percentage of green-vegetation pixels located above the camera 2.5 m horizon line (i.e. vegetation higher than the camera height of ~2.5 m) within a street-view image. It captures non-view-obstructing tree-canopy greenery and is computed by splitting the image at a horizon row that depends on ca",
    "category": "CAT_CMP",
    "calc_type": "ratio",
    "target_classes": ['tree', 'grass', 'plant;flora;plant;life', 'palm;palm;tree'],
    "variables": {"green_pixels": "pixels classified as vegetation by semantic segmentation", "total_pixels": "total pixel count of the image (= W * H)", "H_img": "image height in pixels (300 for Place Pulse 1.0 GSV; 'H' was used in Li 2015 as the per-pixel horizon offset, not image height)", "W_img": "image width in pixels (400 for Place Pulse 1.0 GSV)", "f_px": "camera focal length in pixels; for Place Pulse 1.0 GSV (400x300, HFOV 90 deg) f_px = 200; in general f_px = (W_img/2) / tan(HFOV_rad/2)", "pitch_rad": "camera pitch angle in radians; positive = camera tilts up (horizon line moves down in image); 0 = level camera", "horizon_row": "pixel row corresponding to the 2.5 m physical horizon line in the image; reduces to H_img/2 for level (pitch = 0) cameras"},
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
