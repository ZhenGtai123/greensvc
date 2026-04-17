"""Calculator Layer.

Indicator ID:   IND_TRF_VIS
Indicator Name: Visual Traffic Flow Index
Type:           TYPE A (ratio +

Formula: IND_TRF_VIS = 0.25 × (Car_pixels + Pedestrian_pixels) / Total_pixels × 100
"""

import numpy as np
from PIL import Image
from typing import Dict

# semantic_colors input_layer.py
from input_layer import semantic_colors


# =============================================================================
# INDICATOR DEFINITION -
# =============================================================================
INDICATOR = {
    "id": "IND_TRF_VIS",
    "name": "Visual Traffic Flow Index",
    "unit": "%",  # GVI
    "formula": "0.25 × (Sum(Car_pixels + Pedestrian_pixels) / Sum(Total_Pixels)) × 100",
    "target_direction": "INCREASE",  # INCREASE / DECREASE / NEUTRAL
    "definition": "The proportion of the visual field occupied by dynamic traffic elements (cars and pedestrians), scaled by 0.25.",
    "category": "CAT_CMP",

    # TYPE A
    "calc_type": "ratio",

    "scale": 0.25,

    # - Excel Name
    "target_classes": [
        "car",
        "person",  # pedestrian/person
    ]
}


# =============================================================================
# COLOR LOOKUP TABLE ( input_layer.py semantic_colors )
# =============================================================================
TARGET_RGB = {}

print(f"\nBuilding color lookup for {INDICATOR['id']}:")
for class_name in INDICATOR.get('target_classes', []):
    if class_name in semantic_colors:
        rgb = semantic_colors[class_name]
        TARGET_RGB[rgb] = class_name
        print(f" {class_name}: RGB{rgb}")
    else:
        print(f" ️ NOT FOUND: {class_name}")
        for name in semantic_colors.keys():
            if class_name.split(';')[0] in name or name.split(';')[0] in class_name:
                print(f" Did you mean: '{name}'?")
                break

print(f"\nCalculator ready: {INDICATOR['id']} ({len(TARGET_RGB)} classes matched)")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str) -> Dict:
    try:
        # Step 1:
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w

        flat_pixels = pixels.reshape(-1, 3)

        # Step 2:
        target_count = 0
        class_counts = {}

        for rgb, class_name in TARGET_RGB.items():
            mask = np.all(flat_pixels == rgb, axis=1)
            count = int(np.sum(mask))

            if count > 0:
                class_counts[class_name] = count
                target_count += count

        # Step 3:
        scale = float(INDICATOR.get("scale", 1.0))
        base_ratio = (target_count / total_pixels) if total_pixels > 0 else 0.0
        value = scale * base_ratio * 100

        return {
            'success': True,
            'value': round(float(value), 3),
            'target_pixels': int(target_count),
            'total_pixels': int(total_pixels),
            'class_breakdown': class_counts,
            'scale': scale
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'value': None
        }


# =============================================================================
# TEST CODE
# =============================================================================
if __name__ == "__main__":
    print("\nTesting calculator...")

    test_img = np.zeros((100, 100, 3), dtype=np.uint8)

    # 20% car + 20% person → base = 40% → scaled = 0.25*40 = 10%
    if 'car' in semantic_colors:
        test_img[0:20, :] = semantic_colors['car']

    if 'person' in semantic_colors:
        test_img[20:40, :] = semantic_colors['person']

    test_path = '/tmp/test_trf_vis.png'
    Image.fromarray(test_img).save(test_path)

    result = calculate_indicator(test_path)
    print(f" Result: {result}")

    import os
    os.remove(test_path)
