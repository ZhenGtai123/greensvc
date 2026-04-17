"""Calculator Layer.

Indicator ID:   IND_RID_RAT
Indicator Name: Rider Ratio
Type:           TYPE A (ratio

Formula: IND_RID_RAT = Pixels_Rider / Total_Pixels × 100
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
    "id": "IND_RID_RAT",
    "name": "Rider Ratio",
    "unit": "%",
    "formula": "(Sum(Rider_Pixels) / Sum(Total_Pixels)) × 100",
    "target_direction": "INCREASE",  # INCREASE / DECREASE / NEUTRAL
    "definition": "The proportion of pixels representing riders (persons on vehicles such as bicycles or motorcycles) in street view imagery.",
    "category": "CAT_CMP",

    # TYPE A
    "calc_type": "ratio",  # ratio / inverse_ratio / two_class_ratio

    # - Excel Name
    "target_classes": [
        "person (on bike)",
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
            count = np.sum(mask)

            if count > 0:
                class_counts[class_name] = int(count)
                target_count += count

        # Step 3: (ratio)
        value = (target_count / total_pixels) * 100 if total_pixels > 0 else 0

        # Step 4:
        return {
            'success': True,
            'value': round(value, 3),
            'target_pixels': int(target_count),
            'total_pixels': int(total_pixels),
            'class_breakdown': class_counts
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

    # (person (on bike) )
    if 'person (on bike)' in semantic_colors:
        rid_rgb = semantic_colors['person (on bike)']
        test_img[0:20, 0:100] = rid_rgb  # 20% rider

    test_path = '/tmp/test_rid_rat.png'
    Image.fromarray(test_img).save(test_path)

    result = calculate_indicator(test_path)
    print(f" Result: {result}")

    import os
    os.remove(test_path)
