"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_WAL
Indicator Name: Wall Ratio
Type: TYPE A (ratio mode)

Description:
    The Wall Ratio (WAL) quantifies the proportion of wall surface pixels 
    visible in street-level imagery. It measures the visual presence of 
    vertical wall surfaces (excluding building facades) in the urban 
    landscape. Walls serve multiple functions including property boundaries, 
    noise barriers, privacy screens, and spatial dividers. The visibility 
    of walls affects street enclosure perception, pedestrian comfort, and 
    the overall visual character of urban environments. High wall ratios 
    may indicate enclosed, protected spaces or potentially create visual 
    barriers that reduce street permeability.

Formula: WAL = (Sum(Wall_Pixels) / Sum(Total_Pixels)) × 100

Variables:
    - Wall_Pixels: Pixels classified as wall surfaces
    - Total_Pixels: Total number of pixels in the image

References:
    - Related to urban morphology and enclosure studies
    - Contributes to understanding of spatial boundaries and visual permeability
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_WAL",
    "name": "Wall Ratio",
    "unit": "%",
    "formula": "(Sum(Wall_Pixels) / Sum(Total_Pixels)) × 100",
    "target_direction": "NEUTRAL",
    "definition": "Proportion of wall surface pixels visible in street-level imagery",
    "category": "CAT_CMP",
    
    # TYPE A Configuration
    "calc_type": "ratio",
    
    # Target Semantic Classes
    # These class names must match EXACTLY with the 'Name' column in 
    # color_coding_semantic_segmentation_classes.xlsx
    "target_classes": [
        "wall",                           # Wall - RGB(120, 120, 120)
    ],
    
    # Additional metadata
    "variables": {
        "Wall_Pixels": "Pixels classified as wall surfaces",
        "Total_Pixels": "Total number of pixels in the image"
    },
    "note": "Measures vertical wall surfaces; distinct from building facades (IND_BVI)"
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
    Calculate the Wall Ratio (WAL) for a semantic segmentation mask image.
    
    TYPE A - ratio mode: (target_pixels / total_pixels) × 100
    
    The function reads a semantic segmentation mask image, counts pixels 
    classified as wall surfaces, and calculates their proportion relative 
    to the total image area.
    
    Args:
        image_path: Path to the semantic segmentation mask image (PNG/JPG)
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): WAL percentage (0-100), or None if failed
            - 'target_pixels' (int): Total count of wall pixels
            - 'total_pixels' (int): Total pixel count in the image
            - 'class_breakdown' (dict): Pixel count for each wall class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"WAL: {result['value']:.2f}%")
        ...     print(f"Wall pixels: {result['target_pixels']}")
    """
    try:
        # Step 1: Load the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Flatten pixel array for efficient comparison
        flat_pixels = pixels.reshape(-1, 3)
        
        # Step 2: Count pixels for each target class (walls)
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
        # WAL = (wall_pixels / total_pixels) × 100
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
    
    # Fill 15% with wall color (if available)
    if 'wall' in semantic_colors:
        wall_rgb = semantic_colors['wall']
        test_img[0:15, 0:100] = wall_rgb  # 15% wall
    
    # Save test image
    test_path = '/tmp/test_wal.png'
    Image.fromarray(test_img).save(test_path)
    
    # Run calculation
    result = calculate_indicator(test_path)
    print(f"   Result: {result}")
    
    # Validate expected result (should be ~15%)
    if result['success']:
        expected_wal = 15.0  # 15% wall
        actual_wal = result['value']
        print(f"   Expected WAL: ~{expected_wal}%")
        print(f"   Actual WAL: {actual_wal}%")
        if abs(actual_wal - expected_wal) < 1:
            print("   ✅ Test PASSED")
        else:
            print("   ⚠️ Test result differs from expected")
    
    # Cleanup
    import os
    os.remove(test_path)
    print("   🧹 Test cleanup complete")
