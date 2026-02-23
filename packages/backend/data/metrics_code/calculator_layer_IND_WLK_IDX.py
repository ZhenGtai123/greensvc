"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_WLK_IDX
Indicator Name: Walkability Index (Visual)
Type: TYPE B (conditional ratio mode)

Description:
    The Walkability Index (Visual) measures the ratio of sidewalk pixels to the
    sum of sidewalk and road pixels in street-level imagery. It quantifies the
    visual presence of pedestrian infrastructure relative to vehicle infrastructure.
    Higher values indicate more pedestrian-friendly environments.

    When neither sidewalk nor road pixels are detected in an image, the calculator
    returns None (no data) rather than 0, since the absence of both classes means
    the indicator is not applicable to that view.

Formula: WI = Sum(Area_sidewalk) / (Sum(Area_sidewalk) + Sum(Area_driveway)) x 100%

Variables:
    - Area_sidewalk: Number of sidewalk pixels
    - Area_driveway: Number of driveway/road pixels

References:
    - Extracted from: IND_WLK_IDX_Calculator_ALL_LAYERS.ipynb
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_WLK_IDX",
    "name": "Walkability Index (Visual)",
    "unit": "%",
    "formula": "Sum(Area_sidewalk) / (Sum(Area_sidewalk) + Sum(Area_driveway)) x 100%",
    "target_direction": "INCREASE",
    "definition": "Ratio of sidewalk pixels to the sum of sidewalk and road pixels in street-level imagery",
    "category": "CAT_CMP",

    # TYPE B Configuration (conditional ratio)
    "calc_type": "ratio",

    # Target Semantic Classes - two groups
    # These class names must match EXACTLY with the 'Name' column in
    # color_coding_semantic_segmentation_classes.xlsx
    "target_classes": [
        "sidewalk;pavement",              # Sidewalk (Idx 11) - RGB(235, 255, 7)
        "road;route",                     # Road (Idx 6) - RGB(140, 140, 140)
    ],

    # Separate class groups for the formula
    "sidewalk_classes": [
        "sidewalk;pavement",              # Sidewalk (Idx 11) - RGB(235, 255, 7)
    ],
    "driveway_classes": [
        "road;route",                     # Road (Idx 6) - RGB(140, 140, 140)
    ],

    # Additional metadata
    "variables": {
        "Area_sidewalk": "Number of sidewalk pixels",
        "Area_driveway": "Number of driveway/road pixels"
    }
}


# =============================================================================
# BUILD COLOR LOOKUP TABLE
# =============================================================================
# This section creates a mapping from RGB values to class names
# The semantic_colors dictionary comes from input_layer.py

SIDEWALK_RGB = {}
DRIVEWAY_RGB = {}
TARGET_RGB = {}

print(f"\n🎯 Building color lookup for {INDICATOR['id']}:")

print("   Sidewalk classes:")
for class_name in INDICATOR.get('sidewalk_classes', []):
    if class_name in semantic_colors:
        rgb = semantic_colors[class_name]
        SIDEWALK_RGB[rgb] = class_name
        TARGET_RGB[rgb] = class_name
        print(f"   ✅ {class_name}: RGB{rgb}")
    else:
        print(f"   ⚠️ NOT FOUND: {class_name}")
        for name in semantic_colors.keys():
            if class_name.split(';')[0] in name or name.split(';')[0] in class_name:
                print(f"      💡 Did you mean: '{name}'?")
                break

print("   Driveway/road classes:")
for class_name in INDICATOR.get('driveway_classes', []):
    if class_name in semantic_colors:
        rgb = semantic_colors[class_name]
        DRIVEWAY_RGB[rgb] = class_name
        TARGET_RGB[rgb] = class_name
        print(f"   ✅ {class_name}: RGB{rgb}")
    else:
        print(f"   ⚠️ NOT FOUND: {class_name}")
        for name in semantic_colors.keys():
            if class_name.split(';')[0] in name or name.split(';')[0] in class_name:
                print(f"      💡 Did you mean: '{name}'?")
                break

print(f"\n✅ Calculator ready: {INDICATOR['id']} ({len(TARGET_RGB)} classes matched)")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str) -> Dict:
    """
    Calculate the Walkability Index (Visual) for a semantic segmentation mask image.

    TYPE B - conditional ratio: sidewalk / (sidewalk + road) x 100
    Returns None when no sidewalk or road pixels are detected.

    Args:
        image_path: Path to the semantic segmentation mask image (PNG/JPG)

    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float|None): WLK_IDX percentage (0-100), or None if no data
            - 'target_pixels' (int): Total count of sidewalk + road pixels
            - 'total_pixels' (int): Total pixel count in the image
            - 'class_breakdown' (dict): Pixel count for each class
            - 'error' (str): Error message if success is False
    """
    try:
        # Step 1: Load the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w

        # Flatten pixel array for efficient comparison
        flat_pixels = pixels.reshape(-1, 3)

        # Step 2: Count sidewalk pixels
        sidewalk_count = 0
        class_counts = {}

        for rgb, class_name in SIDEWALK_RGB.items():
            mask = np.all(flat_pixels == rgb, axis=1)
            count = np.sum(mask)
            if count > 0:
                class_counts[class_name] = int(count)
                sidewalk_count += count

        # Step 3: Count driveway/road pixels
        driveway_count = 0

        for rgb, class_name in DRIVEWAY_RGB.items():
            mask = np.all(flat_pixels == rgb, axis=1)
            count = np.sum(mask)
            if count > 0:
                class_counts[class_name] = int(count)
                driveway_count += count

        # Step 4: Calculate the indicator value (conditional ratio)
        # WI = sidewalk / (sidewalk + road) x 100
        denominator = sidewalk_count + driveway_count
        target_count = denominator

        if denominator > 0:
            value = (sidewalk_count / denominator) * 100
        else:
            # No sidewalk or road detected - return None
            value = None

        # Step 5: Return results
        return {
            'success': True,
            'value': round(value, 3) if value is not None else None,
            'target_pixels': int(target_count),
            'total_pixels': int(total_pixels),
            'class_breakdown': class_counts
        }

    except FileNotFoundError:
        return {
            'success': False,
            'error': f'Image file not found: {image_path}',
            'value': None
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'value': None
        }


# =============================================================================
# STANDALONE TEST (Optional)
# =============================================================================
if __name__ == "__main__":
    """
    Test code for standalone execution.
    Creates a synthetic test image and validates the calculator.
    """
    print("\n🧪 Testing calculator...")

    # Create a synthetic test image (100x100 pixels)
    test_img = np.zeros((100, 100, 3), dtype=np.uint8)

    # Fill 40% with sidewalk color (if available)
    if 'sidewalk;pavement' in semantic_colors:
        sidewalk_rgb = semantic_colors['sidewalk;pavement']
        test_img[0:40, 0:100] = sidewalk_rgb  # 40% sidewalk

    # Fill 20% with road color (if available)
    if 'road;route' in semantic_colors:
        road_rgb = semantic_colors['road;route']
        test_img[40:60, 0:100] = road_rgb  # 20% road

    # Save test image
    test_path = '/tmp/test_wlk_idx.png'
    Image.fromarray(test_img).save(test_path)

    # Run calculation
    result = calculate_indicator(test_path)
    print(f"   Result: {result}")

    # Validate expected result (should be ~66.67%)
    if result['success'] and result['value'] is not None:
        expected_wlk = 66.667  # 40 / (40 + 20) x 100
        actual_wlk = result['value']
        print(f"   Expected WLK_IDX: ~{expected_wlk:.2f}%")
        print(f"   Actual WLK_IDX: {actual_wlk}%")
        if abs(actual_wlk - expected_wlk) < 1:
            print("   ✅ Test PASSED")
        else:
            print("   ⚠️ Test result differs from expected")

    # Cleanup
    import os
    os.remove(test_path)
    print("   🧹 Test cleanup complete")
