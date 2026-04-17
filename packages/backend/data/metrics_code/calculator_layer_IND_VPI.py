"""Calculator Layer.

Indicator ID:   IND_VPI
Indicator Name: Visual Pavement Index
Type:           TYPE A (ratio / two_class_ratio

Formula: IND_VPI = Pn / (Pn + Rn) × 100
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
    "id": "IND_VPI",
    "name": "Visual Pavement Index",
    "unit": "%",
    "formula": "(Pn / (Pn + Rn)) × 100",
    "target_direction": "INCREASE",  # INCREASE / DECREASE / NEUTRAL
    "definition": "The ratio of visible pavement pixels to the sum of pavement and road pixels, indicating the dominance of pedestrian space relative to vehicle space.",
    "category": "CAT_CMP",

    # target/total
    "calc_type": "two_class_ratio",

    "numerator_classes": [
        "sidewalk",
    ],

    # Pn + Rn
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

        # Step 2: Pn
        pavement_count = 0
        pavement_counts = {}

        for rgb, class_name in NUM_RGB.items():
            mask = np.all(flat_pixels == rgb, axis=1)
            count = int(np.sum(mask))
            if count > 0:
                pavement_counts[class_name] = count
                pavement_count += count

        # Step 3: Rn
        road_count = 0
        road_counts = {}

        for rgb, class_name in DEN_RGB.items():
            mask = np.all(flat_pixels == rgb, axis=1)
            count = int(np.sum(mask))
            if count > 0:
                road_counts[class_name] = count
                road_count += count

        # Step 4:
        total_pnr = pavement_count + road_count
        value = (pavement_count / total_pnr) * 100 if total_pnr > 0 else 0.0

        return {
            'success': True,
            'value': round(float(value), 3),
            'pavement_pixels': int(pavement_count),
            'road_pixels': int(road_count),
            'total_pnr_pixels': int(total_pnr),
            'pavement_breakdown': pavement_counts,
            'road_breakdown': road_counts
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

    # 40% sidewalk, 20% road
    if 'sidewalk' in semantic_colors:
        test_img[0:40, :] = semantic_colors['sidewalk']

    if 'road' in semantic_colors:
        test_img[40:60, :] = semantic_colors['road']

    test_path = '/tmp/test_vpi.png'
    Image.fromarray(test_img).save(test_path)

    result = calculate_indicator(test_path)
    print(f" Result: {result}")

    import os
    os.remove(test_path)
