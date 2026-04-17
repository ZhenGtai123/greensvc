"""Calculator Layer.

Indicator ID:   IND_WLK_IDX
Indicator Name: Walkability Index (Visual) / Walkability Index
Type:           TYPE A (ratio / two_class_share

Formula: IND_WLK_IDX = Area_sidewalk / (Area_sidewalk + Area_driveway) × 100
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
    "id": "IND_WLK_IDX",
    "name": "Walkability Index (Visual)",
    "unit": "%",
    "formula": "(Area_sidewalk / (Area_sidewalk + Area_driveway)) × 100",
    "target_direction": "INCREASE",  # INCREASE / DECREASE / NEUTRAL
    "definition": "The ratio of sidewalk pixels to the sum of sidewalk and driveway pixels in a street view image.",
    "category": "CAT_CMP",

    "calc_type": "two_class_ratio",

    # sidewalk
    "numerator_classes": [
        "sidewalk",
    ],

    # driveway road
    "denominator_classes": [
        "road",
    ]
}


# =============================================================================
# COLOR LOOKUP TABLE
# =============================================================================
NUM_RGB = {}
DEN_RGB = {}

print(f"\nBuilding color lookup for {INDICATOR['id']}:")

print(" ▶ Numerator classes:")
for class_name in INDICATOR.get('numerator_classes', []):
    if class_name in semantic_colors:
        rgb = semantic_colors[class_name]
        NUM_RGB[rgb] = class_name
        print(f" {class_name}: RGB{rgb}")
    else:
        print(f" ️ NOT FOUND: {class_name}")

print(" ▶ Denominator classes:")
for class_name in INDICATOR.get('denominator_classes', []):
    if class_name in semantic_colors:
        rgb = semantic_colors[class_name]
        DEN_RGB[rgb] = class_name
        print(f" {class_name}: RGB{rgb}")
    else:
        print(f" ️ NOT FOUND: {class_name}")

print(
    f"\nCalculator ready: {INDICATOR['id']} "
    f"(NUM={len(NUM_RGB)} classes matched, DEN={len(DEN_RGB)} classes matched)"
)


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str) -> Dict:
    try:
        # Step 1:
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape

        flat_pixels = pixels.reshape(-1, 3)

        # Step 2: sidewalk S
        sidewalk_count = 0
        sidewalk_counts = {}

        for rgb, class_name in NUM_RGB.items():
            mask = np.all(flat_pixels == rgb, axis=1)
            count = int(np.sum(mask))
            if count > 0:
                sidewalk_counts[class_name] = count
                sidewalk_count += count

        # Step 3: road/driveway D
        driveway_count = 0
        driveway_counts = {}

        for rgb, class_name in DEN_RGB.items():
            mask = np.all(flat_pixels == rgb, axis=1)
            count = int(np.sum(mask))
            if count > 0:
                driveway_counts[class_name] = count
                driveway_count += count

        # Step 4:
        total_sd = sidewalk_count + driveway_count
        value = (sidewalk_count / total_sd) * 100 if total_sd > 0 else 0.0

        return {
            'success': True,
            'value': round(float(value), 3),
            'sidewalk_pixels': int(sidewalk_count),
            'driveway_pixels': int(driveway_count),
            'total_sd_pixels': int(total_sd),
            'sidewalk_breakdown': sidewalk_counts,
            'driveway_breakdown': driveway_counts
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

    # 40% sidewalk, 20% road -> 40/(40+20)=66.666%
    if 'sidewalk' in semantic_colors:
        test_img[0:40, :] = semantic_colors['sidewalk']

    if 'road' in semantic_colors:
        test_img[40:60, :] = semantic_colors['road']

    test_path = '/tmp/test_wlk_idx.png'
    Image.fromarray(test_img).save(test_path)

    result = calculate_indicator(test_path)
    print(f" Result: {result}")

    import os
    os.remove(test_path)
