"""Calculator Layer.

Indicator ID:   IND_VII
Indicator Name: Vehicle Interference Index
Type:           TYPE A (ratio mode)

Description:
    Ratio of motorised-vehicle pixel area to motorway (carriageway) pixel area within the segmented street-view image, measuring the degree of vehicular intrusion specifically along the carriageway.

Formula: VII = Pixels_motorised / Pixels_motorway
"""

import numpy as np
from PIL import Image
from typing import Dict


INDICATOR = {
    "id": "IND_VII",
    "name": "Vehicle Interference Index",
    "unit": "%",
    "formula": "VII = Pixels_motorised / Pixels_motorway",
    "target_direction": "NEUTRAL",
    "definition": "Ratio of motorised-vehicle pixel area to motorway (carriageway) pixel area within the segmented street-view image, measuring the degree of vehicular intrusion specifically along the carriageway.",
    "category": "CAT_CMP",
    "calc_type": "ratio",
    "target_classes": ['car;auto;automobile;machine;motorcar', 'bus;autobus;coach;charabanc;double-decker;jitney;motorbus;motorcoach;omnibus;passenger;vehicle', 'truck;motortruck', 'van', 'minibike;motorbike'],
    "variables": "Pixels_motorised = pixels labelled as motorised vehicles (cars, trucks, buses, motorcycles); Pixels_motorway = pixels of the motorway/carriageway surface",
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
