"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_TVF
Indicator Name: Tree View Factor
Type: TYPE A (ratio mode)

Description:
    The Tree View Factor (TVF) quantifies the proportion of tree canopy pixels 
    visible in street-level imagery. Unlike the broader Green View Index (GVI) 
    which includes all vegetation types, TVF specifically focuses on trees, 
    making it valuable for urban forestry assessment, canopy cover analysis, 
    and shade provision studies. Trees are particularly important for thermal 
    comfort, air quality improvement, and urban biodiversity.

Formula: TVF = (Sum(Tree_Pixels) / Sum(Total_Pixels)) × 100

Variables:
    - Tree_Pixels: Pixels classified as trees (including palm trees)
    - Total_Pixels: Total number of pixels in the image

References:
    - First confirmed by: Zhang, L., et al. (2024). Research on Regional 
      Differences of Residents' Green Space Exposure Based on Street View 
      Imagery. International Journal of Geoinformatics.
    - Merged from: IND_TVI, IND_TRA
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_TVF",
    "name": "Tree View Factor",
    "unit": "%",
    "formula": "(Sum(Tree_Pixels) / Sum(Total_Pixels)) × 100",
    "target_direction": "INCREASE",
    "definition": "Proportion of tree canopy pixels visible in street-level imagery",
    "category": "CAT_CMP",
    
    # TYPE A Configuration
    "calc_type": "ratio",
    
    # Target Semantic Classes
    # These class names must match EXACTLY with the 'Name' column in 
    # color_coding_semantic_segmentation_classes.xlsx
    "target_classes": [
        "tree",                           # Tree (Idx 4) - RGB(4, 200, 3)
        "palm;palm;tree",                 # Palm tree - RGB(0, 82, 255)
    ],
    
    # Additional metadata
    "variables": {
        "Tree_Pixels": "Pixels classified as trees (including palm trees)",
        "Total_Pixels": "Total number of pixels in the image"
    },
    "confirmation_count": 37,
    "merged_from": [
        "IND_TVI", "IND_TRA"
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
    Calculate the Tree View Factor (TVF) for a semantic segmentation mask image.
    
    TYPE A - ratio mode: (target_pixels / total_pixels) × 100
    
    The function reads a semantic segmentation mask image, counts pixels 
    classified as trees (including palm trees), and calculates their proportion 
    relative to the total image area.
    
    Args:
        image_path: Path to the semantic segmentation mask image (PNG/JPG)
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): TVF percentage (0-100), or None if failed
            - 'target_pixels' (int): Total count of tree pixels
            - 'total_pixels' (int): Total pixel count in the image
            - 'class_breakdown' (dict): Pixel count for each tree class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"TVF: {result['value']:.2f}%")
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
        
        # Step 2: Count pixels for each target class (trees)
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
        # TVF = (tree_pixels / total_pixels) × 100
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
    
    # Fill 25% with tree color (if available)
    if 'tree' in semantic_colors:
        tree_rgb = semantic_colors['tree']
        test_img[0:25, 0:100] = tree_rgb  # 25% tree
    
    # Fill 10% with palm tree color (if available)
    if 'palm;palm;tree' in semantic_colors:
        palm_rgb = semantic_colors['palm;palm;tree']
        test_img[25:35, 0:100] = palm_rgb  # 10% palm tree
    
    # Save test image
    test_path = '/tmp/test_tvf.png'
    Image.fromarray(test_img).save(test_path)
    
    # Run calculation
    result = calculate_indicator(test_path)
    print(f"   Result: {result}")
    
    # Validate expected result (should be ~35%)
    if result['success']:
        expected_tvf = 35.0  # 25% tree + 10% palm
        actual_tvf = result['value']
        print(f"   Expected TVF: ~{expected_tvf}%")
        print(f"   Actual TVF: {actual_tvf}%")
        if abs(actual_tvf - expected_tvf) < 1:
            print("   ✅ Test PASSED")
        else:
            print("   ⚠️ Test result differs from expected")
    
    # Cleanup
    import os
    os.remove(test_path)
    print("   🧹 Test cleanup complete")
