"""Calculator Layer.

Indicator ID:   IND_MTD
Indicator Name: Motorization Degree
Type:           TYPE A (ratio mode)

Description:
    Sum of pixel proportions of all motor-traffic-related elements (road surface plus all vehicle classes plus railway) in a street view image. Captures how dominant motor traffic infrastructure and vehicles are in the visual scene, distinct from a single vehicle ratio.

Formula: MD = (P_road + P_car + P_bus + P_truck + P_freight_vehicle + P_small_motor_vehicle + P_railway) / P_all
"""

import numpy as np
from PIL import Image
from typing import Dict


INDICATOR = {
    "id": "IND_MTD",
    "name": "Motorization Degree",
    "unit": "%",
    "formula": "MD = (P_road + P_car + P_bus + P_truck + P_freight_vehicle + P_small_motor_vehicle + P_railway) / P_all",
    "target_direction": "NEUTRAL",
    "definition": "Sum of pixel proportions of all motor-traffic-related elements (road surface plus all vehicle classes plus railway) in a street view image. Captures how dominant motor traffic infrastructure and vehicles are in the visual scene, distinct from a single vehicle ratio.",
    "category": "CAT_CMP",
    "calc_type": "ratio",
    "target_classes": ['road;route', 'car;auto;automobile;machine;motorcar', 'bus;autobus;coach;charabanc;double-decker;jitney;motorbus;motorcoach;omnibus;passenger;vehicle', 'truck;motortruck', 'van', 'minibike;motorbike', 'bicycle;bike;wheel;cycle'],
    "variables": "P_road, P_car, P_bus, P_truck, P_freight_vehicle, P_small_motor_vehicle, P_railway = pixel counts of each class; P_all = total pixels",
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
