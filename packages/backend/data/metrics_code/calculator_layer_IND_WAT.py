"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_WAT
Indicator Name: Water View Index
Type: TYPE A (ratio mode)

Description:
    The Water View Index (WAT) quantifies the proportion of water body pixels 
    visible in street-level imagery. It measures the visual presence of water 
    features such as rivers, lakes, seas, fountains, swimming pools, and 
    waterfalls in the urban landscape. Water features contribute to thermal 
    comfort, aesthetic quality, biodiversity, and psychological well-being 
    in urban environments. The presence of visible water bodies is associated 
    with increased property values, improved mental health, and enhanced 
    urban livability.

Formula: WAT = (Sum(Water_Pixels) / Sum(Total_Pixels)) × 100

Variables:
    - Water_Pixels: Pixels classified as water bodies (rivers, lakes, seas, 
                    fountains, pools, waterfalls)
    - Total_Pixels: Total number of pixels in the image

References:
    - First confirmed by: Zhang, L., et al. (2024). Research on Regional 
      Differences of Residents' Green Space Exposure Based on Street View 
      Imagery. International Journal of Geoinformatics.
    - Merged from: IND_BLU, IND_WTR
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_WAT",
    "name": "Water View Index",
    "unit": "%",
    "formula": "(Sum(Water_Pixels) / Sum(Total_Pixels)) × 100",
    "target_direction": "INCREASE",
    "definition": "Proportion of water body pixels visible in street-level imagery",
    "category": "CAT_CMP",
    
    # TYPE A Configuration
    "calc_type": "ratio",
    
    # Target Semantic Classes
    # These class names must match EXACTLY with the 'Name' column in 
    # color_coding_semantic_segmentation_classes.xlsx
    "target_classes": [
        "water",                                    # Water - RGB(61, 230, 250)
        "sea",                                      # Sea - RGB(9, 7, 230)
        "river",                                    # River - RGB(11, 200, 200)
        "lake",                                     # Lake - RGB(10, 190, 212)
        "fountain",                                 # Fountain - RGB(8, 184, 170)
        "swimming;pool;swimming;bath;natatorium",  # Swimming pool - RGB(0, 184, 255)
        "waterfall;falls",                          # Waterfall - RGB(0, 224, 255)
    ],
    
    # Additional metadata
    "variables": {
        "Water_Pixels": "Pixels classified as water bodies (rivers, lakes, seas, fountains, pools, waterfalls)",
        "Total_Pixels": "Total number of pixels in the image"
    },
    "confirmation_count": 21,
    "merged_from": [
        "IND_BLU", "IND_WTR"
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
    Calculate the Water View Index (WAT) for a semantic segmentation mask image.
    
    TYPE A - ratio mode: (target_pixels / total_pixels) × 100
    
    The function reads a semantic segmentation mask image, counts pixels 
    classified as water bodies (rivers, lakes, seas, fountains, pools, 
    waterfalls), and calculates their proportion relative to the total 
    image area.
    
    Args:
        image_path: Path to the semantic segmentation mask image (PNG/JPG)
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): WAT percentage (0-100), or None if failed
            - 'target_pixels' (int): Total count of water pixels
            - 'total_pixels' (int): Total pixel count in the image
            - 'class_breakdown' (dict): Pixel count for each water class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"WAT: {result['value']:.2f}%")
        ...     print(f"Water pixels: {result['target_pixels']}")
    """
    try:
        # Step 1: Load the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Flatten pixel array for efficient comparison
        flat_pixels = pixels.reshape(-1, 3)
        
        # Step 2: Count pixels for each target class (water bodies)
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
        # WAT = (water_pixels / total_pixels) × 100
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
    
    # Fill 15% with water color (if available)
    if 'water' in semantic_colors:
        water_rgb = semantic_colors['water']
        test_img[0:10, 0:100] = water_rgb  # 10% water
    
    # Fill 5% with river color (if available)
    if 'river' in semantic_colors:
        river_rgb = semantic_colors['river']
        test_img[10:15, 0:100] = river_rgb  # 5% river
    
    # Save test image
    test_path = '/tmp/test_wat.png'
    Image.fromarray(test_img).save(test_path)
    
    # Run calculation
    result = calculate_indicator(test_path)
    print(f"   Result: {result}")
    
    # Validate expected result (should be ~15%)
    if result['success']:
        expected_wat = 15.0  # 10% water + 5% river
        actual_wat = result['value']
        print(f"   Expected WAT: ~{expected_wat}%")
        print(f"   Actual WAT: {actual_wat}%")
        if abs(actual_wat - expected_wat) < 1:
            print("   ✅ Test PASSED")
        else:
            print("   ⚠️ Test result differs from expected")
    
    # Cleanup
    import os
    os.remove(test_path)
    print("   🧹 Test cleanup complete")
