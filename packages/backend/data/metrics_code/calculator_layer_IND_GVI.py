"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_GVI
Indicator Name: Green View Index
Type: TYPE A (ratio mode)

Description:
    The Green View Index (GVI) quantifies the proportion of green vegetation 
    pixels visible in street-level imagery. It is one of the most widely used 
    indicators in urban greenery assessment, with 151 confirmations in the 
    literature. GVI is calculated by summing all pixels classified as vegetation 
    types and dividing by the total number of pixels.

Formula: GVI = (Sum(Green_Pixels) / Sum(Total_Pixels)) × 100

Variables:
    - Green_Pixels: Pixels classified as vegetation (tree, grass, plant, etc.)
    - Total_Pixels: Total number of pixels in the image

References:
    - First confirmed by: Zhao, X., & Lin, G. (2024). Research on the Perception 
      Evaluation of Urban Green Spaces Using Panoramic Images and Deep Learning.
    - Merged from: IND_PGV, IND_GCI, IND_GSI, IND_SGV, IND_GVE, IND_GLR, IND_GVR, 
      IND_SVG, IND_CGVI, IND_GVI_BAI, IND_GVI_PAT, IND_PGC, IND_GVI_DIR
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_GVI",
    "name": "Green View Index",
    "unit": "%",
    "formula": "(Sum(Green_Pixels) / Sum(Total_Pixels)) × 100",
    "target_direction": "INCREASE",
    "definition": "Proportion of green vegetation pixels in street-level imagery",
    "category": "CAT_CMP",
    
    # TYPE A Configuration
    "calc_type": "ratio",
    
    # Target Semantic Classes
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
        "Green_Pixels": "Pixels classified as vegetation",
        "Total_Pixels": "Total image pixels"
    },
    "confirmation_count": 151,
    "merged_from": [
        "IND_PGV", "IND_GCI", "IND_GSI", "IND_SGV", "IND_GVE", 
        "IND_GLR", "IND_GVR", "IND_SVG", "IND_CGVI", "IND_GVI_BAI", 
        "IND_GVI_PAT", "IND_PGC", "IND_GVI_DIR"
    ]
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
    Calculate the Green View Index (GVI) for a semantic segmentation mask image.
    
    TYPE A - ratio mode: (target_pixels / total_pixels) × 100
    
    The function reads a semantic segmentation mask image, counts pixels 
    belonging to vegetation classes (tree, grass, plant, etc.), and calculates 
    their proportion relative to the total image area.
    
    Args:
        image_path: Path to the semantic segmentation mask image (PNG/JPG)
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): GVI percentage (0-100), or None if failed
            - 'target_pixels' (int): Total count of vegetation pixels
            - 'total_pixels' (int): Total pixel count in the image
            - 'class_breakdown' (dict): Pixel count for each vegetation class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"GVI: {result['value']:.2f}%")
        ...     print(f"Tree pixels: {result['class_breakdown'].get('tree', 0)}")
    """
    try:
        # Step 1: Load the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Flatten pixel array for efficient comparison
        flat_pixels = pixels.reshape(-1, 3)
        
        # Step 2: Count pixels for each target class
        target_count = 0
        class_counts = {}
        
        for rgb, class_name in TARGET_RGB.items():
            # Find pixels that exactly match this RGB value
            mask = np.all(flat_pixels == rgb, axis=1)
            count = np.sum(mask)
            
            if count > 0:
                class_counts[class_name] = int(count)
                target_count += count
        
        # Step 3: Calculate the indicator value (ratio mode)
        # GVI = (green_pixels / total_pixels) × 100
        value = (target_count / total_pixels) * 100 if total_pixels > 0 else 0
        
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
    test_path = '/tmp/test_gvi.png'
    Image.fromarray(test_img).save(test_path)
    
    # Run calculation
    result = calculate_indicator(test_path)
    print(f"   Result: {result}")
    
    # Validate expected result (should be ~50%)
    if result['success']:
        expected_gvi = 50.0  # 30% grass + 20% tree
        actual_gvi = result['value']
        print(f"   Expected GVI: ~{expected_gvi}%")
        print(f"   Actual GVI: {actual_gvi}%")
        if abs(actual_gvi - expected_gvi) < 1:
            print("   ✅ Test PASSED")
        else:
            print("   ⚠️ Test result differs from expected")
    
    # Cleanup
    import os
    os.remove(test_path)
    print("   🧹 Test cleanup complete")
