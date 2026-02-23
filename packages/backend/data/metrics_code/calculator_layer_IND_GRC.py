"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_GRC
Indicator Name: Ground Cover Ratio
Type: TYPE A (ratio mode)

Description:
    The Ground Cover Ratio (GRC) quantifies the proportion of ground surface 
    pixels visible in street-level imagery. It measures the visual presence 
    of natural ground cover elements such as grass, earth, fields, and soil 
    in the urban landscape. Ground cover plays an essential role in urban 
    ecosystems by providing stormwater infiltration, reducing urban heat 
    island effects, supporting biodiversity, and enhancing visual aesthetics. 
    Unlike impervious surfaces, natural ground cover contributes to 
    environmental sustainability and urban ecological health.

Formula: GRC = (Sum(Ground_Cover_Pixels) / Sum(Total_Pixels)) × 100

Variables:
    - Ground_Cover_Pixels: Pixels classified as grass, earth, fields, and 
                           natural ground surfaces
    - Total_Pixels: Total number of pixels in the image

References:
    - Related to urban ecology and green infrastructure studies
    - Contributes to understanding of permeable vs impermeable surface ratios
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_GRC",
    "name": "Ground Cover Ratio",
    "unit": "%",
    "formula": "(Sum(Ground_Cover_Pixels) / Sum(Total_Pixels)) × 100",
    "target_direction": "INCREASE",
    "definition": "Proportion of natural ground cover pixels visible in street-level imagery",
    "category": "CAT_CMP",
    
    # TYPE A Configuration
    "calc_type": "ratio",
    
    # Target Semantic Classes
    # These class names must match EXACTLY with the 'Name' column in 
    # color_coding_semantic_segmentation_classes.xlsx
    "target_classes": [
        "grass",                          # Grass (Idx 10) - RGB(4, 250, 7)
        "earth;ground",                   # Earth/Ground - RGB(120, 120, 70)
        "field",                          # Field - RGB(112, 9, 255)
    ],
    
    # Additional metadata
    "variables": {
        "Ground_Cover_Pixels": "Pixels classified as grass, earth, fields, and natural ground surfaces",
        "Total_Pixels": "Total number of pixels in the image"
    },
    "note": "Focuses on natural permeable ground surfaces; excludes paved surfaces"
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
    Calculate the Ground Cover Ratio (GRC) for a semantic segmentation mask image.
    
    TYPE A - ratio mode: (target_pixels / total_pixels) × 100
    
    The function reads a semantic segmentation mask image, counts pixels 
    classified as natural ground cover (grass, earth, fields), and calculates 
    their proportion relative to the total image area.
    
    Args:
        image_path: Path to the semantic segmentation mask image (PNG/JPG)
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): GRC percentage (0-100), or None if failed
            - 'target_pixels' (int): Total count of ground cover pixels
            - 'total_pixels' (int): Total pixel count in the image
            - 'class_breakdown' (dict): Pixel count for each ground cover class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"GRC: {result['value']:.2f}%")
        ...     print(f"Ground cover pixels: {result['target_pixels']}")
    """
    try:
        # Step 1: Load the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Flatten pixel array for efficient comparison
        flat_pixels = pixels.reshape(-1, 3)
        
        # Step 2: Count pixels for each target class (ground cover)
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
        # GRC = (ground_cover_pixels / total_pixels) × 100
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
    
    # Fill 25% with grass color (if available)
    if 'grass' in semantic_colors:
        grass_rgb = semantic_colors['grass']
        test_img[0:15, 0:100] = grass_rgb  # 15% grass
    
    # Fill 10% with earth color (if available)
    if 'earth;ground' in semantic_colors:
        earth_rgb = semantic_colors['earth;ground']
        test_img[15:25, 0:100] = earth_rgb  # 10% earth
    
    # Fill 5% with field color (if available)
    if 'field' in semantic_colors:
        field_rgb = semantic_colors['field']
        test_img[25:30, 0:100] = field_rgb  # 5% field
    
    # Save test image
    test_path = '/tmp/test_grc.png'
    Image.fromarray(test_img).save(test_path)
    
    # Run calculation
    result = calculate_indicator(test_path)
    print(f"   Result: {result}")
    
    # Validate expected result (should be ~30%)
    if result['success']:
        expected_grc = 30.0  # 15% grass + 10% earth + 5% field
        actual_grc = result['value']
        print(f"   Expected GRC: ~{expected_grc}%")
        print(f"   Actual GRC: {actual_grc}%")
        if abs(actual_grc - expected_grc) < 1:
            print("   ✅ Test PASSED")
        else:
            print("   ⚠️ Test result differs from expected")
    
    # Cleanup
    import os
    os.remove(test_path)
    print("   🧹 Test cleanup complete")
