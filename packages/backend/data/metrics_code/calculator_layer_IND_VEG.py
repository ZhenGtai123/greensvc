"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_VEG
Indicator Name: Vegetation Ratio
Type: TYPE A (ratio mode)

Description:
    The Vegetation Ratio (VEG) quantifies the proportion of all vegetation 
    pixels visible in street-level imagery. It provides a comprehensive 
    measure of the visual presence of all plant life in the urban landscape, 
    including trees, grass, shrubs, flowers, and palms. Vegetation is 
    fundamental to urban ecosystem health, providing critical ecosystem 
    services such as air quality improvement, carbon sequestration, 
    stormwater management, urban heat island mitigation, and biodiversity 
    support. The VEG indicator captures the total green coverage visible 
    from the pedestrian perspective, reflecting the overall "greenness" 
    of streetscapes and contributing to human well-being, psychological 
    restoration, and aesthetic quality of urban environments.

Formula: VEG = (Sum(Vegetation_Pixels) / Sum(Total_Pixels)) × 100

Variables:
    - Vegetation_Pixels: Pixels classified as any type of vegetation
                         (trees, grass, plants, flowers, palms)
    - Total_Pixels: Total number of pixels in the image

References:
    - Related to Green View Index (GVI) studies
    - Contributes to understanding of urban green infrastructure
    - Supports assessment of ecosystem services provision
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_VEG",
    "name": "Vegetation Ratio",
    "unit": "%",
    "formula": "(Sum(Vegetation_Pixels) / Sum(Total_Pixels)) × 100",
    "target_direction": "INCREASE",
    "definition": "Proportion of all vegetation pixels visible in street-level imagery",
    "category": "CAT_CMP",
    
    # TYPE A Configuration
    "calc_type": "ratio",
    
    # Target Semantic Classes
    # These class names must match EXACTLY with the 'Name' column in 
    # color_coding_semantic_segmentation_classes.xlsx
    "target_classes": [
        "tree",                           # Tree - RGB(4, 200, 3)
        "grass",                          # Grass - RGB(4, 250, 7)
        "plant;flora;plant;life",         # Plants/Shrubs - RGB(204, 255, 4)
        "flower",                         # Flower - RGB(255, 0, 0)
        "palm;palm;tree",                 # Palm trees - RGB(0, 82, 255)
    ],
    
    # Additional metadata
    "variables": {
        "Vegetation_Pixels": "Pixels classified as trees, grass, plants, flowers, and palms",
        "Total_Pixels": "Total number of pixels in the image"
    },
    "note": "Comprehensive vegetation measure including all plant types; higher values indicate greener streetscapes"
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
    Calculate the Vegetation Ratio (VEG) for a semantic segmentation mask image.
    
    TYPE A - ratio mode: (target_pixels / total_pixels) × 100
    
    The function reads a semantic segmentation mask image, counts pixels 
    classified as any vegetation type (trees, grass, plants, flowers, palms), 
    and calculates their proportion relative to the total image area.
    
    Args:
        image_path: Path to the semantic segmentation mask image (PNG/JPG)
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): VEG percentage (0-100), or None if failed
            - 'target_pixels' (int): Total count of vegetation pixels
            - 'total_pixels' (int): Total pixel count in the image
            - 'class_breakdown' (dict): Pixel count for each vegetation class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"VEG: {result['value']:.2f}%")
        ...     print(f"Vegetation pixels: {result['target_pixels']}")
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
        
        # Step 3: Calculate the indicator value (ratio mode)
        # VEG = (vegetation_pixels / total_pixels) × 100
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
    
    # Fill 15% with tree color (if available)
    if 'tree' in semantic_colors:
        tree_rgb = semantic_colors['tree']
        test_img[0:10, 0:100] = tree_rgb  # 10% tree
    
    # Fill 8% with grass color (if available)
    if 'grass' in semantic_colors:
        grass_rgb = semantic_colors['grass']
        test_img[10:18, 0:100] = grass_rgb  # 8% grass
    
    # Fill 5% with plant color (if available)
    if 'plant;flora;plant;life' in semantic_colors:
        plant_rgb = semantic_colors['plant;flora;plant;life']
        test_img[18:23, 0:100] = plant_rgb  # 5% plant
    
    # Fill 2% with flower color (if available)
    if 'flower' in semantic_colors:
        flower_rgb = semantic_colors['flower']
        test_img[23:25, 0:100] = flower_rgb  # 2% flower
    
    # Save test image
    test_path = '/tmp/test_veg.png'
    Image.fromarray(test_img).save(test_path)
    
    # Run calculation
    result = calculate_indicator(test_path)
    print(f"   Result: {result}")
    
    # Validate expected result (should be ~25%)
    if result['success']:
        expected_veg = 25.0  # 10% tree + 8% grass + 5% plant + 2% flower
        actual_veg = result['value']
        print(f"   Expected VEG: ~{expected_veg}%")
        print(f"   Actual VEG: {actual_veg}%")
        if abs(actual_veg - expected_veg) < 1:
            print("   ✅ Test PASSED")
        else:
            print("   ⚠️ Test result differs from expected")
    
    # Cleanup
    import os
    os.remove(test_path)
    print("   🧹 Test cleanup complete")
