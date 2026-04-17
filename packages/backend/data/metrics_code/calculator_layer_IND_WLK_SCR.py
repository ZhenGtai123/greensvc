"""Calculator Layer.

Indicator ID:   IND_WLK_SCR
Indicator Name: Walkability Score (Tao et al.) / Walkability Ratio
Type:           TYPE B (two_class_ratio

Formula: IND_WLK_SCR = (Sidewalk + Fence) / Road
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
    "id": "IND_WLK_SCR",
    "name": "Walkability Score (Tao et al.)",
    "unit": "ratio",  # ratio / %
    "formula": "(Sidewalk + Fence) / Road",
    "target_direction": "INCREASE",  # INCREASE / DECREASE / NEUTRAL
    "definition": "A visual perception score for walkability, defined as the ratio of pedestrian elements (sidewalk, fence) to vehicle road elements (road).",
    "category": "CAT_CFG",

    # TYPE B /
    "calc_type": "two_class_ratio",  # ratio / inverse_ratio / two_class_ratio

    "numerator_classes": [
        "sidewalk",
        "fence",
    ],

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
        total_pixels = h * w

        flat_pixels = pixels.reshape(-1, 3)

        # Step 2:
        numerator_count = 0
        numerator_counts = {}

        for rgb, class_name in NUM_RGB.items():
            mask = np.all(flat_pixels == rgb, axis=1)
            count = int(np.sum(mask))
            if count > 0:
                numerator_counts[class_name] = count
                numerator_count += count

        # Step 3: Road
        denominator_count = 0
        denominator_counts = {}

        for rgb, class_name in DEN_RGB.items():
            mask = np.all(flat_pixels == rgb, axis=1)
            count = int(np.sum(mask))
            if count > 0:
                denominator_counts[class_name] = count
                denominator_count += count

        # Step 4:
        if denominator_count == 0:
            value = None  # 0
        else:
            value = numerator_count / denominator_count

        # Step 5:
        return {
            'success': True,
            'value': None if value is None else round(float(value), 6),
            'numerator_pixels': int(numerator_count),
            'denominator_pixels': int(denominator_count),
            'total_pixels': int(total_pixels),
            'numerator_breakdown': numerator_counts,
            'denominator_breakdown': denominator_counts
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

    # 30% sidewalk + 10% fence, 20% road
    if 'sidewalk' in semantic_colors:
        test_img[0:30, :] = semantic_colors['sidewalk']

    if 'fence' in semantic_colors:
        test_img[30:40, :] = semantic_colors['fence']

    if 'road' in semantic_colors:
        test_img[40:60, :] = semantic_colors['road']

    test_path = '/tmp/test_wlk_scr.png'
    Image.fromarray(test_img).save(test_path)

    result = calculate_indicator(test_path)
    print(f" Result: {result}")

    import os
    os.remove(test_path)
