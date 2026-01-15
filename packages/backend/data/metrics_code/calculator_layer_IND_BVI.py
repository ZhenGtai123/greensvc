"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_BVI
Indicator Name: Building View Index
Type: TYPE A (ratio mode)

Description:
    The Building View Index (BVI) quantifies the proportion of building pixels 
    visible in street-level imagery. It measures the visual dominance of built 
    structures in the urban landscape, providing insights into urban density, 
    enclosure, and the balance between natural and constructed environments.
    BVI is valuable for urban morphology analysis, visual impact assessment, 
    and understanding the relationship between built form and perceived 
    environmental quality.

Formula: BVI = (Sum(Building_Pixels) / Sum(Total_Pixels)) × 100

Variables:
    - Building_Pixels: Pixels classified as buildings (including houses, 
                       skyscrapers, towers)
    - Total_Pixels: Total number of pixels in the image

References:
    - First confirmed by: Liu, Y., & Li, L. (2024). Multi-source Data-driven 
      Identification of Urban Functional Areas: A Case Study.
    - Merged from: IND_BLD, IND_BUI, IND_BLR
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_BVI",
    "name": "Building View Index",
    "unit": "%",
    "formula": "(Sum(Building_Pixels) / Sum(Total_Pixels)) × 100",
    "target_direction": "NEUTRAL",
    "definition": "Proportion of building pixels visible in street-level imagery",
    "category": "CAT_CMP",
    
    # TYPE A Configuration
    "calc_type": "ratio",
    
    # Target Semantic Classes
    # These class names must match EXACTLY with the 'Name' column in 
    # color_coding_semantic_segmentation_classes.xlsx
    "target_classes": [
        "building;edifice",               # Building (Idx 1) - RGB(180, 120, 120)
        "house",                          # House - RGB(255, 9, 224)
        "skyscraper",                     # Skyscraper - RGB(140, 140, 140)
        "tower",                          # Tower - RGB(255, 184, 184)
    ],
    
    # Additional metadata
    "variables": {
        "Building_Pixels": "Pixels classified as buildings (including houses, skyscrapers, towers)",
        "Total_Pixels": "Total number of pixels in the image"
    },
    "confirmation_count": 37,
    "merged_from": [
        "IND_BLD", "IND_BUI", "IND_BLR"
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
    Calculate the Building View Index (BVI) for a semantic segmentation mask image.
    
    TYPE A - ratio mode: (target_pixels / total_pixels) × 100
    
    The function reads a semantic segmentation mask image, counts pixels 
    classified as buildings (including houses, skyscrapers, and towers), 
    and calculates their proportion relative to the total image area.
    
    Args:
        image_path: Path to the semantic segmentation mask image (PNG/JPG)
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): BVI percentage (0-100), or None if failed
            - 'target_pixels' (int): Total count of building pixels
            - 'total_pixels' (int): Total pixel count in the image
            - 'class_breakdown' (dict): Pixel count for each building class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"BVI: {result['value']:.2f}%")
        ...     print(f"Building pixels: {result['target_pixels']}")
    """
    try:
        # Step 1: Load the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Flatten pixel array for efficient comparison
        flat_pixels = pixels.reshape(-1, 3)
        
        # Step 2: Count pixels for each target class (buildings)
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
        # BVI = (building_pixels / total_pixels) × 100
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
    
    # Fill 30% with building color (if available)
    if 'building;edifice' in semantic_colors:
        building_rgb = semantic_colors['building;edifice']
        test_img[0:20, 0:100] = building_rgb  # 20% building
    
    # Fill 10% with house color (if available)
    if 'house' in semantic_colors:
        house_rgb = semantic_colors['house']
        test_img[20:30, 0:100] = house_rgb  # 10% house
    
    # Fill 5% with skyscraper color (if available)
    if 'skyscraper' in semantic_colors:
        skyscraper_rgb = semantic_colors['skyscraper']
        test_img[30:35, 0:100] = skyscraper_rgb  # 5% skyscraper
    
    # Save test image
    test_path = '/tmp/test_bvi.png'
    Image.fromarray(test_img).save(test_path)
    
    # Run calculation
    result = calculate_indicator(test_path)
    print(f"   Result: {result}")
    
    # Validate expected result (should be ~35%)
    if result['success']:
        expected_bvi = 35.0  # 20% building + 10% house + 5% skyscraper
        actual_bvi = result['value']
        print(f"   Expected BVI: ~{expected_bvi}%")
        print(f"   Actual BVI: {actual_bvi}%")
        if abs(actual_bvi - expected_bvi) < 1:
            print("   ✅ Test PASSED")
        else:
            print("   ⚠️ Test result differs from expected")
    
    # Cleanup
    import os
    os.remove(test_path)
    print("   🧹 Test cleanup complete")
