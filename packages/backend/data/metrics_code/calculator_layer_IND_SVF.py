"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_SVF
Indicator Name: Sky View Factor
Type: TYPE A (ratio mode)

Description:
    The Sky View Factor (SVF) quantifies the proportion of sky visible from a 
    given point in street-level imagery. It is a fundamental indicator in urban 
    climate studies, thermal comfort assessment, and urban morphology analysis.
    SVF relates to solar radiation access, urban heat island effects, and the 
    perceived openness of urban spaces. Higher SVF values indicate more open 
    spaces with greater sky exposure.

Formula: SVF = (Sum(Sky_Pixels) / Sum(Total_Pixels)) × 100

Variables:
    - Sky_Pixels: Pixels classified as sky
    - Total_Pixels: Total number of pixels in the image

References:
    - First confirmed by: Zhao, X., & Lin, G. (2024). Research on the Perception 
      Evaluation of Urban Green Spaces Using Panoramic Images and Deep Learning.
    - Merged from: IND_SKY, IND_SOI, IND_SKY_RAT
    - Formula source: Chan, T.-C., et al. (2024). PLOS ONE, 19(5), e0301921.
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_SVF",
    "name": "Sky View Factor",
    "unit": "%",
    "formula": "(Sum(Sky_Pixels) / Sum(Total_Pixels)) × 100",
    "target_direction": "NEUTRAL",
    "definition": "Proportion of sky visible from a point in street-level imagery",
    "category": "CAT_CMP",
    
    # TYPE A Configuration
    "calc_type": "ratio",
    
    # Target Semantic Classes
    # These class names must match EXACTLY with the 'Name' column in 
    # color_coding_semantic_segmentation_classes.xlsx
    "target_classes": [
        "sky",                            # Sky (Idx 2) - RGB(6, 230, 230)
    ],
    
    # Additional metadata
    "variables": {
        "SVF": "Sky View Factor",
        "n": "Total number of pixels",
        "sky(i)": "Function determining whether pixel i is sky (1 or 0)"
    },
    "confirmation_count": 66,
    "merged_from": [
        "IND_SKY", "IND_SOI", "IND_SKY_RAT"
    ],
    "formula_source": "Chan, T.-C., et al. (2024). PLOS ONE, 19(5), e0301921."
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
    Calculate the Sky View Factor (SVF) for a semantic segmentation mask image.
    
    TYPE A - ratio mode: (target_pixels / total_pixels) × 100
    
    The function reads a semantic segmentation mask image, counts pixels 
    classified as sky, and calculates their proportion relative to the total 
    image area. This provides a measure of sky visibility from the viewpoint.
    
    Args:
        image_path: Path to the semantic segmentation mask image (PNG/JPG)
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): SVF percentage (0-100), or None if failed
            - 'target_pixels' (int): Total count of sky pixels
            - 'total_pixels' (int): Total pixel count in the image
            - 'class_breakdown' (dict): Pixel count for sky class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"SVF: {result['value']:.2f}%")
        ...     print(f"Sky pixels: {result['class_breakdown'].get('sky', 0)}")
    """
    try:
        # Step 1: Load the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Flatten pixel array for efficient comparison
        flat_pixels = pixels.reshape(-1, 3)
        
        # Step 2: Count pixels for each target class (sky)
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
        # SVF = (sky_pixels / total_pixels) × 100
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
    
    # Fill 40% with sky color (if available)
    if 'sky' in semantic_colors:
        sky_rgb = semantic_colors['sky']
        test_img[0:40, 0:100] = sky_rgb  # 40% sky
    
    # Save test image
    test_path = '/tmp/test_svf.png'
    Image.fromarray(test_img).save(test_path)
    
    # Run calculation
    result = calculate_indicator(test_path)
    print(f"   Result: {result}")
    
    # Validate expected result (should be ~40%)
    if result['success']:
        expected_svf = 40.0  # 40% sky
        actual_svf = result['value']
        print(f"   Expected SVF: ~{expected_svf}%")
        print(f"   Actual SVF: {actual_svf}%")
        if abs(actual_svf - expected_svf) < 1:
            print("   ✅ Test PASSED")
        else:
            print("   ⚠️ Test result differs from expected")
    
    # Cleanup
    import os
    os.remove(test_path)
    print("   🧹 Test cleanup complete")
