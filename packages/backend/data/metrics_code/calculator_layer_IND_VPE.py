"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_VPE
Indicator Name: Vegetation Permeability Index
Type: TYPE A (ratio mode - inverse)

Description:
    The Vegetation Permeability Index (VPE) quantifies the proportion of
    non-vegetation pixels in street-level imagery. It measures visual
    permeability — the ability to see through or past vegetation. Higher
    VPE means more visual openness and better sightlines, which is important
    for safety and wayfinding. VPE is the inverse of GVI: VPE = 100 - GVI.

    Note: This is a 2D approximation of the original 3D formula which uses
    volumes instead of pixel areas.

Formula: VPE = (Total_Pixels - Vegetation_Pixels) / Total_Pixels x 100

Variables:
    - Vegetation_Pixels: Pixels classified as vegetation (tree, grass, plant, etc.)
    - Total_Pixels: Total number of pixels in the image

References:
    - Inverse of GVI (Green View Index)
    - Extracted from: IND_VPE_Calculator_ALL_LAYERS.ipynb
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_VPE",
    "name": "Vegetation Permeability Index",
    "unit": "%",
    "formula": "(Total_Pixels - Vegetation_Pixels) / Total_Pixels x 100",
    "target_direction": "INCREASE",
    "definition": "Proportion of non-vegetation pixels in street-level imagery (inverse of GVI)",
    "category": "CAT_CFG",

    # TYPE A Configuration (inverse ratio)
    "calc_type": "ratio",

    # Target Semantic Classes (same vegetation classes as GVI)
    # These class names must match EXACTLY with the 'Name' column in
    # color_coding_semantic_segmentation_classes.xlsx
    "target_classes": [
        "tree",                           # Tree (Idx 4) - RGB(4, 200, 3)
        "grass",                          # Grass (Idx 9) - RGB(4, 250, 7)
        "plant;flora;plant;life",         # Plant (Idx 17) - RGB(204, 255, 4)
        "palm;palm;tree",                 # Palm tree - RGB(0, 82, 255)
        "flower",                         # Flower - RGB(255, 0, 0)
    ],

    # Additional metadata
    "variables": {
        "Vegetation_Pixels": "Pixels classified as vegetation (tree, grass, plant, etc.)",
        "Total_Pixels": "Total number of pixels in the image"
    },
    "note": "Higher VPE means more visual permeability (less vegetation blocking views). VPE = 100 - GVI."
}


# =============================================================================
# BUILD COLOR LOOKUP TABLE
# =============================================================================
# This section creates a mapping from RGB values to class names
# The semantic_colors dictionary comes from input_layer.py

TARGET_RGB = {}

print(f"\n🎯 Building color lookup for {INDICATOR['id']}:")
for class_name in INDICATOR.get('target_classes', []):
    if class_name in semantic_colors:
        rgb = semantic_colors[class_name]
        TARGET_RGB[rgb] = class_name
        print(f"   ✅ {class_name}: RGB{rgb}")
    else:
        print(f"   ⚠️ NOT FOUND: {class_name}")
        # Try partial matching to suggest corrections
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
    Calculate the Vegetation Permeability Index (VPE) for a semantic segmentation mask image.

    TYPE A - ratio mode (inverse): ((total - target) / total) x 100

    VPE = (Total_Pixels - Vegetation_Pixels) / Total_Pixels x 100
    This is the inverse of GVI: VPE = 100 - GVI

    Args:
        image_path: Path to the semantic segmentation mask image (PNG/JPG)

    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): VPE percentage (0-100), or None if failed
            - 'target_pixels' (int): Total count of vegetation pixels
            - 'total_pixels' (int): Total pixel count in the image
            - 'class_breakdown' (dict): Pixel count for each vegetation class
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

        # Step 2: Count pixels for each target class (vegetation)
        target_count = 0
        class_counts = {}

        for rgb, class_name in TARGET_RGB.items():
            # Find pixels that exactly match this RGB value
            mask = np.all(flat_pixels == rgb, axis=1)
            count = np.sum(mask)

            if count > 0:
                class_counts[class_name] = int(count)
                target_count += count

        # Step 3: Calculate the indicator value (inverse ratio mode)
        # VPE = (total - vegetation) / total x 100
        value = ((total_pixels - target_count) / total_pixels) * 100 if total_pixels > 0 else 0

        # Step 4: Return results
        return {
            'success': True,
            'value': round(value, 3),
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

    # Fill 30% with grass color (if available)
    if 'grass' in semantic_colors:
        grass_rgb = semantic_colors['grass']
        test_img[0:30, 0:100] = grass_rgb  # 30% grass

    # Fill 20% with tree color (if available)
    if 'tree' in semantic_colors:
        tree_rgb = semantic_colors['tree']
        test_img[30:50, 0:100] = tree_rgb  # 20% tree

    # Save test image
    test_path = '/tmp/test_vpe.png'
    Image.fromarray(test_img).save(test_path)

    # Run calculation
    result = calculate_indicator(test_path)
    print(f"   Result: {result}")

    # Validate expected result (should be ~50% VPE = 100 - 50% GVI)
    if result['success']:
        expected_vpe = 50.0  # 100 - (30% grass + 20% tree)
        actual_vpe = result['value']
        print(f"   Expected VPE: ~{expected_vpe}%")
        print(f"   Actual VPE: {actual_vpe}%")
        if abs(actual_vpe - expected_vpe) < 1:
            print("   ✅ Test PASSED")
        else:
            print("   ⚠️ Test result differs from expected")

    # Cleanup
    import os
    os.remove(test_path)
    print("   🧹 Test cleanup complete")
