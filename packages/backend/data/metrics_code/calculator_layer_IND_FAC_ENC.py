"""Calculator Layer.

Indicator ID:   IND_FAC_ENC
Indicator Name: Facade Enclosure Type
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    "id": "IND_FAC_ENC",
    "name": "Facade Enclosure Type",
    "unit": "category",
    "formula": "Category: Sealed vs Open/Railing",
    "target_direction": "NEUTRAL",
    "definition": "Categorical indicator distinguishing sealed/impervious walls vs open/railing facades",
    "category": "CAT_CFG",

    "calc_type": "composite",

    "component_classes": {
        "sealed": [
            "wall"
        ],
        "open_railing": [
            "railing;rail",
            "fence;fencing"
        ]
    },

    "aggregation": "categorical_compare",

    "min_ratio_threshold": 0.5  # %
}

print(f"\nCalculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f" Aggregation: {INDICATOR.get('aggregation', 'categorical_compare')}")


# =============================================================================
# COLOR LOOKUP TABLE
# =============================================================================
COMPONENT_RGB = {}

print(f"\nFacade enclosure color lookup:")
for component_name, class_list in INDICATOR.get('component_classes', {}).items():
    COMPONENT_RGB[component_name] = {}
    print(f"\n {component_name}:")

    for class_name in class_list:
        if class_name in semantic_colors:
            rgb = semantic_colors[class_name]
            COMPONENT_RGB[component_name][rgb] = class_name
            print(f" {class_name}: RGB{rgb}")
        else:
            print(f" ️ NOT FOUND: {class_name}")

print(f"\nComponents configured: {list(COMPONENT_RGB.keys())}")


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

        component_counts = {}
        component_ratios = {}
        all_class_counts = {}

        for component_name, rgb_map in COMPONENT_RGB.items():
            component_total = 0

            for rgb, class_name in rgb_map.items():
                mask = np.all(flat_pixels == rgb, axis=1)
                count = np.sum(mask)
                if count > 0:
                    all_class_counts[class_name] = int(count)
                    component_total += count

            component_counts[component_name] = int(component_total)
            component_ratios[component_name] = round(
                (component_total / total_pixels) * 100, 3
            ) if total_pixels > 0 else 0

        sealed_ratio = float(component_ratios.get("sealed", 0))
        open_ratio = float(component_ratios.get("open_railing", 0))

        category, code = classify_facade_enclosure(sealed_ratio, open_ratio)

        return {
            'success': True,
            'value': category,
            'category_code': int(code),
            'sealed_ratio': round(sealed_ratio, 3),
            'open_ratio': round(open_ratio, 3),
            'total_pixels': int(total_pixels),
            'component_pixels': component_counts,
            'component_ratios': component_ratios,
            'class_breakdown': all_class_counts
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'value': None
        }


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================
def classify_facade_enclosure(sealed_ratio: float, open_ratio: float) -> tuple:
    thr = float(INDICATOR.get("min_ratio_threshold", 0.0))

    sealed_sig = sealed_ratio >= thr
    open_sig = open_ratio >= thr

    if (not sealed_sig) and (not open_sig):
        return ("Mixed/Unknown", 0)

    if sealed_ratio > open_ratio:
        return ("Sealed", 1)
    elif open_ratio > sealed_ratio:
        return ("Open/Railing", 2)
    else:
        return ("Mixed/Unknown", 0)


# =============================================================================
# TEST CODE
# =============================================================================
if __name__ == "__main__":
    print("\nTesting Facade Enclosure Type calculator...")

    test_img = np.zeros((100, 100, 3), dtype=np.uint8)

    # Case 1: Sealed
    if 'wall' in semantic_colors:
        test_img[0:60, :] = semantic_colors['wall']  # 60% wall

    test_path = '/tmp/test_fac_enc.png'
    Image.fromarray(test_img).save(test_path)

    result = calculate_indicator(test_path)

    print(f"\nTest: wall-dominant facade")
    print(f" Category: {result['value']}")
    print(f" Sealed ratio: {result['sealed_ratio']}%")
    print(f" Open ratio: {result['open_ratio']}%")

    import os
    os.remove(test_path)
