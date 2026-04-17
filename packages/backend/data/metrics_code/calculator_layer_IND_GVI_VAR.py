"""Calculator Layer.

Indicator ID:   IND_GVI_VAR
Indicator Name: GVI Variation (GVI
Type:           TYPE B

Formula: )
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    "id": "IND_GVI_VAR",
    "name": "GVI Variation",
    "unit": "%",
    "formula": "StdDev(GVI_front, GVI_back, GVI_left, GVI_right)",
    "target_direction": "NEUTRAL",
    "definition": "Standard deviation of Green View Index across four horizontal views",
    "category": "CAT_CMP",

    "calc_type": "custom",

    "variables": {
        "GVI_front": "Green View Index (%) from front view",
        "GVI_back": "Green View Index (%) from back view",
        "GVI_left": "Green View Index (%) from left view",
        "GVI_right": "Green View Index (%) from right view",
        "GVI_VAR": "Standard deviation of the four GVI values"
    }
}

print(f"\nCalculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f" Formula: {INDICATOR['formula']}")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(front_path: str, back_path: str, left_path: str, right_path: str) -> Dict:
    try:
        def _calc_gvi(image_path: str) -> Dict:
            img = Image.open(image_path).convert('RGB')
            pixels = np.array(img)
            h, w, _ = pixels.shape
            total_pixels = h * w
            flat_pixels = pixels.reshape(-1, 3)

            green_classes = ['tree', 'grass', 'plant', 'shrub']
            green_count = 0

            for cls in green_classes:
                if cls not in semantic_colors:
                    continue
                rgb = semantic_colors[cls]
                mask = np.all(flat_pixels == rgb, axis=1)
                green_count += int(np.sum(mask))

            gvi = (green_count / total_pixels) * 100 if total_pixels > 0 else 0
            return round(float(gvi), 3)

        # Step 1: GVI
        gvi_front = _calc_gvi(front_path)
        gvi_back = _calc_gvi(back_path)
        gvi_left = _calc_gvi(left_path)
        gvi_right = _calc_gvi(right_path)

        # Step 2:
        gvi_list = np.array([gvi_front, gvi_back, gvi_left, gvi_right], dtype=float)
        gvi_var = float(np.std(gvi_list, ddof=0))

        return {
            'success': True,
            'value': round(gvi_var, 3),
            'GVI_front': gvi_front,
            'GVI_back': gvi_back,
            'GVI_left': gvi_left,
            'GVI_right': gvi_right
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
def interpret_gvi_var(value: float) -> str:
    if value < 5:
        return "Very low heterogeneity: greenery is consistent across directions"
    elif value < 15:
        return "Low heterogeneity: slight directional differences"
    elif value < 30:
        return "Medium heterogeneity: noticeable directional differences"
    else:
        return "High heterogeneity: strong directional imbalance in greenery"


# =============================================================================
# TEST CODE
# =============================================================================
if __name__ == "__main__":
    print("\nTesting GVI Variation calculator...")

    required = any(k in semantic_colors for k in ['tree', 'grass', 'plant', 'shrub'])
    if required:
        def _make_mask(green_ratio: float, path: str):
            img = np.zeros((100, 100, 3), dtype=np.uint8)
            green_pixels = int(100 * 100 * green_ratio)

            green_cls = None
            for k in ['tree', 'grass', 'plant', 'shrub']:
                if k in semantic_colors:
                    green_cls = k
                    break

            if green_cls is None:
                return

            flat = img.reshape(-1, 3)
            flat[:green_pixels] = semantic_colors[green_cls]
            img = flat.reshape(100, 100, 3)
            Image.fromarray(img).save(path)

        front = '/tmp/test_front.png'
        back = '/tmp/test_back.png'
        left = '/tmp/test_left.png'
        right = '/tmp/test_right.png'

        _make_mask(0.10, front)   # 10% green
        _make_mask(0.30, back)    # 30% green
        _make_mask(0.50, left)    # 50% green
        _make_mask(0.70, right)   # 70% green

        result = calculate_indicator(front, back, left, right)

        print(" Test: GVI_front=10, back=30, left=50, right=70")
        print(f" Result (StdDev): {result['value']} %")
        print(f" Details: {result['GVI_front']}, {result['GVI_back']}, {result['GVI_left']}, {result['GVI_right']}")
        print(f" Interpretation: {interpret_gvi_var(result['value'])}")

        import os
        for p in [front, back, left, right]:
            if os.path.exists(p):
                os.remove(p)
    else:
        print(" ️ Required classes not found in semantic_colors")
