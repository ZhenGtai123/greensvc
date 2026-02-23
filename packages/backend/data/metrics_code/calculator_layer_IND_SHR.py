"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_SHR
Indicator Name: Shrub Ratio
Type: TYPE A (ratio mode)

Description:
    The Shrub Ratio (SHR) quantifies the proportion of shrub and low-growing 
    plant pixels visible in street-level imagery. It measures the visual 
    presence of understory vegetation, hedges, bushes, and ornamental plants 
    in the urban landscape. Shrubs provide important ecological services 
    including habitat for small wildlife, air quality improvement, noise 
    reduction, and aesthetic enhancement. Unlike tree canopy coverage, shrub 
    coverage represents ground-level greenery that directly interacts with 
    pedestrians and contributes to street-level visual quality.

Formula: SHR = (Sum(Shrub_Pixels) / Sum(Total_Pixels)) × 100

Variables:
    - Shrub_Pixels: Pixels classified as shrubs, bushes, and low plants
    - Total_Pixels: Total number of pixels in the image

References:
    - First confirmed by: Urban vegetation studies using semantic segmentation
    - Related to: IND_GVI (Green View Index), but focuses specifically on 
      understory vegetation rather than all vegetation types
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_SHR",
    "name": "Shrub Ratio",
    "unit": "%",
    "formula": "(Sum(Shrub_Pixels) / Sum(Total_Pixels)) × 100",
    "target_direction": "INCREASE",
    "definition": "Proportion of shrub and low-growing plant pixels visible in street-level imagery",
    "category": "CAT_CMP",
    
    # TYPE A Configuration
    "calc_type": "ratio",
    
    # Target Semantic Classes
    # These class names must match EXACTLY with the 'Name' column in 
    # color_coding_semantic_segmentation_classes.xlsx
    "target_classes": [
        "plant;flora;plant;life",         # Plants/shrubs (Idx 18) - RGB(204, 255, 4)
    ],
    
    # Additional metadata
    "variables": {
        "Shrub_Pixels": "Pixels classified as shrubs, bushes, and low plants",
        "Total_Pixels": "Total number of pixels in the image"
    },
    "note": "Focuses on understory vegetation; excludes trees and grass"
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
    Calculate the Shrub Ratio (SHR) for a semantic segmentation mask image.
    
    TYPE A - ratio mode: (target_pixels / total_pixels) × 100
    
    The function reads a semantic segmentation mask image, counts pixels 
    classified as shrubs and low-growing plants, and calculates their 
    proportion relative to the total image area.
    
    Args:
        image_path: Path to the semantic segmentation mask image (PNG/JPG)
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): SHR percentage (0-100), or None if failed
            - 'target_pixels' (int): Total count of shrub pixels
            - 'total_pixels' (int): Total pixel count in the image
            - 'class_breakdown' (dict): Pixel count for each shrub class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"SHR: {result['value']:.2f}%")
        ...     print(f"Shrub pixels: {result['target_pixels']}")
    """
    try:
        # Step 1: Load the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Flatten pixel array for efficient comparison
        flat_pixels = pixels.reshape(-1, 3)
        
        # Step 2: Count pixels for each target class (shrubs)
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
        # SHR = (shrub_pixels / total_pixels) × 100
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
    
    # Fill 20% with plant color (if available)
    if 'plant;flora;plant;life' in semantic_colors:
        plant_rgb = semantic_colors['plant;flora;plant;life']
        test_img[0:20, 0:100] = plant_rgb  # 20% plants/shrubs
    
    # Save test image
    test_path = '/tmp/test_shr.png'
    Image.fromarray(test_img).save(test_path)
    
    # Run calculation
    result = calculate_indicator(test_path)
    print(f"   Result: {result}")
    
    # Validate expected result (should be ~20%)
    if result['success']:
        expected_shr = 20.0  # 20% plants/shrubs
        actual_shr = result['value']
        print(f"   Expected SHR: ~{expected_shr}%")
        print(f"   Actual SHR: {actual_shr}%")
        if abs(actual_shr - expected_shr) < 1:
            print("   ✅ Test PASSED")
        else:
            print("   ⚠️ Test result differs from expected")
    
    # Cleanup
    import os
    os.remove(test_path)
    print("   🧹 Test cleanup complete")
