"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_VEH
Indicator Name: Vehicle Ratio
Type: TYPE A (ratio mode)

Description:
    The Vehicle Ratio (VEH) quantifies the proportion of vehicle pixels 
    visible in street-level imagery. It measures the visual presence of 
    motorized and non-motorized vehicles in the urban landscape, including 
    cars, buses, trucks, vans, motorcycles, and bicycles. Vehicle presence 
    is a key indicator of traffic intensity, street usage patterns, and 
    urban mobility characteristics. High vehicle ratios may indicate busy 
    traffic corridors, parking areas, or car-dominated streetscapes, while 
    low ratios might suggest pedestrian-oriented zones or quieter 
    residential areas. This metric is essential for assessing street 
    livability, pedestrian comfort, and transportation mode balance.

Formula: VEH = (Sum(Vehicle_Pixels) / Sum(Total_Pixels)) × 100

Variables:
    - Vehicle_Pixels: Pixels classified as various vehicle types
    - Total_Pixels: Total number of pixels in the image

References:
    - Related to urban mobility and transportation studies
    - Contributes to understanding of street character and traffic impact
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_VEH",
    "name": "Vehicle Ratio",
    "unit": "%",
    "formula": "(Sum(Vehicle_Pixels) / Sum(Total_Pixels)) × 100",
    "target_direction": "DECREASE",
    "definition": "Proportion of vehicle pixels visible in street-level imagery",
    "category": "CAT_CMP",
    
    # TYPE A Configuration
    "calc_type": "ratio",
    
    # Target Semantic Classes
    # These class names must match EXACTLY with the 'Name' column in 
    # color_coding_semantic_segmentation_classes.xlsx
    "target_classes": [
        "car;auto;automobile;machine;motorcar",                                    # Car - RGB(0, 102, 200)
        "bus;autobus;coach;charabanc;double-decker;jitney;motorbus;motorcoach;omnibus;passenger;vehicle",  # Bus - RGB(255, 0, 245)
        "truck;motortruck",                                                        # Truck - RGB(255, 0, 20)
        "van",                                                                     # Van - RGB(163, 255, 0)
        "minibike;motorbike",                                                      # Motorcycle - RGB(163, 0, 255)
        "bicycle;bike;wheel;cycle",                                                # Bicycle - RGB(255, 245, 0)
    ],
    
    # Additional metadata
    "variables": {
        "Vehicle_Pixels": "Pixels classified as cars, buses, trucks, vans, motorcycles, and bicycles",
        "Total_Pixels": "Total number of pixels in the image"
    },
    "note": "Includes all motorized and non-motorized vehicles; higher values indicate more vehicle-dominated streetscapes"
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
    Calculate the Vehicle Ratio (VEH) for a semantic segmentation mask image.
    
    TYPE A - ratio mode: (target_pixels / total_pixels) × 100
    
    The function reads a semantic segmentation mask image, counts pixels 
    classified as vehicles (cars, buses, trucks, vans, motorcycles, bicycles), 
    and calculates their proportion relative to the total image area.
    
    Args:
        image_path: Path to the semantic segmentation mask image (PNG/JPG)
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): VEH percentage (0-100), or None if failed
            - 'target_pixels' (int): Total count of vehicle pixels
            - 'total_pixels' (int): Total pixel count in the image
            - 'class_breakdown' (dict): Pixel count for each vehicle class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"VEH: {result['value']:.2f}%")
        ...     print(f"Vehicle pixels: {result['target_pixels']}")
    """
    try:
        # Step 1: Load the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Flatten pixel array for efficient comparison
        flat_pixels = pixels.reshape(-1, 3)
        
        # Step 2: Count pixels for each target class (vehicles)
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
        # VEH = (vehicle_pixels / total_pixels) × 100
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
    
    # Fill 10% with car color (if available)
    if 'car;auto;automobile;machine;motorcar' in semantic_colors:
        car_rgb = semantic_colors['car;auto;automobile;machine;motorcar']
        test_img[0:7, 0:100] = car_rgb  # 7% car
    
    # Fill 3% with bus color (if available)
    if 'bus;autobus;coach;charabanc;double-decker;jitney;motorbus;motorcoach;omnibus;passenger;vehicle' in semantic_colors:
        bus_rgb = semantic_colors['bus;autobus;coach;charabanc;double-decker;jitney;motorbus;motorcoach;omnibus;passenger;vehicle']
        test_img[7:10, 0:100] = bus_rgb  # 3% bus
    
    # Fill 2% with bicycle color (if available)
    if 'bicycle;bike;wheel;cycle' in semantic_colors:
        bike_rgb = semantic_colors['bicycle;bike;wheel;cycle']
        test_img[10:12, 0:100] = bike_rgb  # 2% bicycle
    
    # Save test image
    test_path = '/tmp/test_veh.png'
    Image.fromarray(test_img).save(test_path)
    
    # Run calculation
    result = calculate_indicator(test_path)
    print(f"   Result: {result}")
    
    # Validate expected result (should be ~12%)
    if result['success']:
        expected_veh = 12.0  # 7% car + 3% bus + 2% bicycle
        actual_veh = result['value']
        print(f"   Expected VEH: ~{expected_veh}%")
        print(f"   Actual VEH: {actual_veh}%")
        if abs(actual_veh - expected_veh) < 1:
            print("   ✅ Test PASSED")
        else:
            print("   ⚠️ Test result differs from expected")
    
    # Cleanup
    import os
    os.remove(test_path)
    print("   🧹 Test cleanup complete")
