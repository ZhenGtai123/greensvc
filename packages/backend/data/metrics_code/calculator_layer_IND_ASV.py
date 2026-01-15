"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_ASV
Indicator Name: Artificial Surface Visibility
Type: TYPE A (ratio mode)

Description:
    The Artificial Surface Visibility (ASV) quantifies the proportion of 
    artificial (man-made) surface pixels visible in street-level imagery. 
    It measures the visual presence of constructed, paved, and impervious 
    surfaces in the urban landscape, including roads, sidewalks, paths, 
    floors, stairs, bridges, and other built infrastructure. This indicator 
    provides insight into the level of urbanization and hardscape dominance 
    in streetscapes. High ASV values indicate highly urbanized, 
    infrastructure-heavy environments, while lower values suggest more 
    natural or green-dominated landscapes. ASV is inversely related to 
    vegetation coverage and is important for understanding urban heat 
    island effects, stormwater runoff potential, and overall urban 
    environmental quality.

Formula: ASV = (Sum(Artificial_Surface_Pixels) / Sum(Total_Pixels)) × 100

Variables:
    - Artificial_Surface_Pixels: Pixels classified as man-made surfaces
                                  (roads, sidewalks, paths, floors, stairs, etc.)
    - Total_Pixels: Total number of pixels in the image

References:
    - Related to impervious surface and urbanization studies
    - Contributes to understanding of urban environmental quality
    - Supports assessment of stormwater management and heat island effects
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_ASV",
    "name": "Artificial Surface Visibility",
    "unit": "%",
    "formula": "(Sum(Artificial_Surface_Pixels) / Sum(Total_Pixels)) × 100",
    "target_direction": "DECREASE",
    "definition": "Proportion of artificial (man-made) surface pixels visible in street-level imagery",
    "category": "CAT_CMP",
    
    # TYPE A Configuration
    "calc_type": "ratio",
    
    # Target Semantic Classes
    # These class names must match EXACTLY with the 'Name' column in 
    # color_coding_semantic_segmentation_classes.xlsx
    "target_classes": [
        "road;route",                                       # Road - RGB(140, 140, 140)
        "sidewalk;pavement",                                # Sidewalk - RGB(235, 255, 7)
        "path",                                             # Path - RGB(255, 31, 0)
        "floor;flooring",                                   # Floor - RGB(80, 50, 50)
        "stairs;steps",                                     # Stairs - RGB(255, 224, 0)
        "stairway;staircase",                               # Stairway - RGB(31, 0, 255)
        "step;stair",                                       # Step - RGB(255, 0, 143)
        "bridge;span",                                      # Bridge - RGB(255, 82, 0)
        "escalator;moving;staircase;moving;stairway",       # Escalator - RGB(0, 255, 163)
        "runway",                                           # Runway - RGB(153, 255, 0)
        "pier;wharf;wharfage;dock",                         # Pier/Dock - RGB(71, 0, 255)
    ],
    
    # Additional metadata
    "variables": {
        "Artificial_Surface_Pixels": "Pixels classified as man-made surfaces (roads, sidewalks, paths, floors, stairs, bridges, etc.)",
        "Total_Pixels": "Total number of pixels in the image"
    },
    "note": "Includes all constructed/paved surfaces; higher values indicate more urbanized environments"
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
    Calculate the Artificial Surface Visibility (ASV) for a semantic segmentation mask image.
    
    TYPE A - ratio mode: (target_pixels / total_pixels) × 100
    
    The function reads a semantic segmentation mask image, counts pixels 
    classified as any artificial surface type (roads, sidewalks, paths, etc.), 
    and calculates their proportion relative to the total image area.
    
    Args:
        image_path: Path to the semantic segmentation mask image (PNG/JPG)
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): ASV percentage (0-100), or None if failed
            - 'target_pixels' (int): Total count of artificial surface pixels
            - 'total_pixels' (int): Total pixel count in the image
            - 'class_breakdown' (dict): Pixel count for each surface class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"ASV: {result['value']:.2f}%")
        ...     print(f"Artificial surface pixels: {result['target_pixels']}")
    """
    try:
        # Step 1: Load the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Flatten pixel array for efficient comparison
        flat_pixels = pixels.reshape(-1, 3)
        
        # Step 2: Count pixels for each target class (artificial surfaces)
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
        # ASV = (artificial_surface_pixels / total_pixels) × 100
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
    
    # Fill 15% with road color (if available)
    if 'road;route' in semantic_colors:
        road_rgb = semantic_colors['road;route']
        test_img[0:10, 0:100] = road_rgb  # 10% road
    
    # Fill 8% with sidewalk color (if available)
    if 'sidewalk;pavement' in semantic_colors:
        sidewalk_rgb = semantic_colors['sidewalk;pavement']
        test_img[10:18, 0:100] = sidewalk_rgb  # 8% sidewalk
    
    # Fill 5% with path color (if available)
    if 'path' in semantic_colors:
        path_rgb = semantic_colors['path']
        test_img[18:23, 0:100] = path_rgb  # 5% path
    
    # Fill 2% with stairs color (if available)
    if 'stairs;steps' in semantic_colors:
        stairs_rgb = semantic_colors['stairs;steps']
        test_img[23:25, 0:100] = stairs_rgb  # 2% stairs
    
    # Save test image
    test_path = '/tmp/test_asv.png'
    Image.fromarray(test_img).save(test_path)
    
    # Run calculation
    result = calculate_indicator(test_path)
    print(f"   Result: {result}")
    
    # Validate expected result (should be ~25%)
    if result['success']:
        expected_asv = 25.0  # 10% road + 8% sidewalk + 5% path + 2% stairs
        actual_asv = result['value']
        print(f"   Expected ASV: ~{expected_asv}%")
        print(f"   Actual ASV: {actual_asv}%")
        if abs(actual_asv - expected_asv) < 1:
            print("   ✅ Test PASSED")
        else:
            print("   ⚠️ Test result differs from expected")
    
    # Cleanup
    import os
    os.remove(test_path)
    print("   🧹 Test cleanup complete")
