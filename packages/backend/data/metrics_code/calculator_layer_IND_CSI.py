"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_CSI
Indicator Name: Color Saturation Index
Type: TYPE B (Image Statistics)

Description:
    The Color Saturation Index (CSI) measures the degree of color 
    vividness/saturation in an image, calculated from RGB channels 
    using the RGYB opponent color space. Higher values indicate 
    more vibrant and saturated colors.
    
Formula: 
    CSI = sigma_rgyb + 0.3 × mu_rgyb
    
    Where:
    sigma_rgyb = sqrt(sigma_rg² + sigma_yb²)  [Standard deviation component]
    mu_rgyb = sqrt(mu_rg² + mu_yb²)            [Mean component]
    
Variables:
    - sigma_rgyb: Combined standard deviation of opponent color channels
    - mu_rgyb: Combined mean of opponent color channels
    - rg: Red-Green opponent channel (R - G)
    - yb: Yellow-Blue opponent channel (0.5×(R+G) - B)

Unit: index (unbounded, typically 0 to 150+)
Range: 0 (grayscale) to higher values (more saturated/colorful)
"""

import numpy as np
from PIL import Image
from typing import Dict, Tuple


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_CSI",
    "name": "Color Saturation Index",
    "unit": "index",
    "formula": "CSI = sigma_rgyb + 0.3 × mu_rgyb",
    "formula_description": "Combined standard deviation and mean of RGYB opponent color channels",
    "target_direction": "CONTEXT",  # Depends on design intent
    "definition": "A measure of the degree of leaf color vividness/saturation calculated from RGB channels",
    "category": "CAT_CMP",
    
    # TYPE B Configuration
    "calc_type": "image_statistics",  # Calculated from image pixel statistics
    
    # Variables
    "variables": {
        "sigma_rgyb": "Combined standard deviation of opponent color channels",
        "mu_rgyb": "Combined mean of opponent color channels",
        "sigma_rg": "Standard deviation of Red-Green channel",
        "sigma_yb": "Standard deviation of Yellow-Blue channel",
        "mu_rg": "Mean of Red-Green channel",
        "mu_yb": "Mean of Yellow-Blue channel"
    },
    
    # Additional metadata
    "output_range": {
        "min": 0,
        "max": "unbounded (typically 0-150+)",
        "description": "0 = grayscale; higher = more saturated/colorful"
    },
    "algorithm": "RGYB opponent color space statistics",
    "note": "Based on Hasler-Süsstrunk colorfulness metric"
}

print(f"\n✅ Calculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f"   Formula: {INDICATOR['formula']}")
print(f"   Type: TYPE B (Image Statistics)")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str, 
                        semantic_colors: Dict[str, Tuple[int, int, int]] = None) -> Dict:
    """
    Calculate the Color Saturation Index (CSI) indicator.
    
    TYPE B - Image Statistics
    
    Formula:
        CSI = sigma_rgyb + 0.3 × mu_rgyb
        
        Where:
        sigma_rgyb = sqrt(sigma_rg² + sigma_yb²)
        mu_rgyb = sqrt(mu_rg² + mu_yb²)
        rg = R - G (Red-Green opponent channel)
        yb = 0.5×(R+G) - B (Yellow-Blue opponent channel)
    
    Args:
        image_path: Path to the image (can be original or mask)
        semantic_colors: Optional, not used for this indicator
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): CSI value
            - 'sigma_rgyb' (float): Combined standard deviation
            - 'mu_rgyb' (float): Combined mean
            - 'sigma_rg' (float): Red-Green standard deviation
            - 'sigma_yb' (float): Yellow-Blue standard deviation
            - 'mu_rg' (float): Red-Green mean
            - 'mu_yb' (float): Yellow-Blue mean
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/image.png')
        >>> if result['success']:
        ...     print(f"CSI: {result['value']:.4f}")
    """
    try:
        # Step 1: Load and prepare the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img, dtype=np.float64)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Step 2: Extract RGB channels
        R = pixels[:, :, 0]
        G = pixels[:, :, 1]
        B = pixels[:, :, 2]
        
        # Step 3: Calculate opponent color channels (RGYB space)
        # rg: Red-Green opponent channel
        # yb: Yellow-Blue opponent channel
        rg = R - G
        yb = 0.5 * (R + G) - B
        
        # Step 4: Calculate statistics for each opponent channel
        sigma_rg = float(np.std(rg))
        sigma_yb = float(np.std(yb))
        mu_rg = float(np.mean(rg))
        mu_yb = float(np.mean(yb))
        
        # Step 5: Calculate combined metrics
        # sigma_rgyb = sqrt(sigma_rg² + sigma_yb²)
        # mu_rgyb = sqrt(mu_rg² + mu_yb²)
        sigma_rgyb = np.sqrt(sigma_rg**2 + sigma_yb**2)
        mu_rgyb = np.sqrt(mu_rg**2 + mu_yb**2)
        
        # Step 6: Apply the CSI formula
        # CSI = sigma_rgyb + 0.3 × mu_rgyb
        csi = sigma_rgyb + 0.3 * mu_rgyb
        
        # Step 7: Calculate additional metrics
        # Mean RGB values
        mean_r = float(np.mean(R))
        mean_g = float(np.mean(G))
        mean_b = float(np.mean(B))
        
        # Mean saturation (HSV)
        mean_saturation = calculate_mean_saturation(pixels)
        
        # Normalized CSI (0-1 scale, assuming max ~150)
        csi_normalized = min(1.0, csi / 150.0)
        
        # Step 8: Return results
        return {
            'success': True,
            'value': round(csi, 4),
            # Core formula components
            'sigma_rgyb': round(sigma_rgyb, 4),
            'mu_rgyb': round(mu_rgyb, 4),
            # Individual channel statistics
            'sigma_rg': round(sigma_rg, 4),
            'sigma_yb': round(sigma_yb, 4),
            'mu_rg': round(mu_rg, 4),
            'mu_yb': round(mu_yb, 4),
            # Additional metrics
            'csi_normalized': round(csi_normalized, 4),
            'mean_saturation_hsv': round(mean_saturation, 4),
            'mean_r': round(mean_r, 2),
            'mean_g': round(mean_g, 2),
            'mean_b': round(mean_b, 2),
            'total_pixels': int(total_pixels),
            'image_width': w,
            'image_height': h
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


def calculate_mean_saturation(pixels: np.ndarray) -> float:
    """
    Calculate mean saturation from RGB image using HSV color space.
    
    Args:
        pixels: numpy array of shape (H, W, 3) with RGB values (0-255)
        
    Returns:
        float: Mean saturation (0 to 1)
    """
    import colorsys
    
    # Flatten to list of pixels
    flat_pixels = pixels.reshape(-1, 3)
    
    # Sample for efficiency (max 10000 pixels)
    if len(flat_pixels) > 10000:
        indices = np.random.choice(len(flat_pixels), 10000, replace=False)
        flat_pixels = flat_pixels[indices]
    
    # Convert RGB to HSV and extract saturation
    saturations = []
    for r, g, b in flat_pixels:
        h, s, v = colorsys.rgb_to_hsv(r/255.0, g/255.0, b/255.0)
        saturations.append(s)
    
    return np.mean(saturations)


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================
def interpret_csi(csi: float) -> str:
    """
    Interpret the Color Saturation Index value.
    
    Args:
        csi: CSI value
        
    Returns:
        str: Qualitative interpretation
    """
    if csi is None:
        return "Unable to interpret (no data)"
    elif csi < 10:
        return "Very low saturation: nearly grayscale"
    elif csi < 30:
        return "Low saturation: muted colors"
    elif csi < 50:
        return "Moderate saturation: balanced colors"
    elif csi < 80:
        return "Good saturation: vibrant colors"
    elif csi < 110:
        return "High saturation: very colorful"
    else:
        return "Very high saturation: extremely vivid colors"


def explain_formula() -> str:
    """
    Provide educational explanation of the CSI formula.
    
    Returns:
        str: Explanation text
    """
    return """
    Color Saturation Index (CSI) Formula:
    
    CSI = sigma_rgyb + 0.3 × mu_rgyb
    
    Where:
        sigma_rgyb = sqrt(sigma_rg² + sigma_yb²)
        mu_rgyb = sqrt(mu_rg² + mu_yb²)
    
    Opponent Color Channels:
        rg = R - G  (Red-Green channel)
        yb = 0.5×(R+G) - B  (Yellow-Blue channel)
    
    This formula is based on human color perception:
    
    1. RGYB Color Space:
       - Human vision processes colors in opponent channels
       - Red vs Green (rg channel)
       - Yellow vs Blue (yb channel)
       - This matches how our visual cortex encodes color
    
    2. Standard Deviation Component (sigma_rgyb):
       - Measures color variation across the image
       - High sigma = diverse colors present
       - Captures the "spread" of colors
    
    3. Mean Component (mu_rgyb):
       - Measures overall color offset from neutral
       - High mu = strong dominant color
       - Weighted by 0.3 (less important than variation)
    
    Interpretation:
    - CSI ≈ 0: Grayscale image (R=G=B everywhere)
    - CSI < 30: Muted, desaturated colors
    - CSI 30-80: Normal, balanced saturation
    - CSI > 80: Highly saturated, vibrant colors
    - CSI > 110: Extremely colorful
    
    Research Background:
    This metric is based on the Hasler-Süsstrunk colorfulness
    measure, which correlates well with human perception of
    color vividness in images.
    """


# =============================================================================
# STANDALONE TEST (Optional)
# =============================================================================
if __name__ == "__main__":
    import os
    
    print("\n🧪 Testing Color Saturation Index calculator...")
    
    # Test 1: Grayscale image (CSI should be ~0)
    test_img_1 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_1[:, :] = [128, 128, 128]  # Uniform gray
    
    test_path_1 = '/tmp/test_csi_1.png'
    Image.fromarray(test_img_1).save(test_path_1)
    
    result_1 = calculate_indicator(test_path_1)
    
    print(f"\n   Test 1: Uniform gray image")
    print(f"      Expected CSI: ~0 (grayscale)")
    print(f"      Calculated CSI: {result_1.get('value', 'N/A')}")
    print(f"      sigma_rgyb: {result_1.get('sigma_rgyb', 'N/A')}, mu_rgyb: {result_1.get('mu_rgyb', 'N/A')}")
    print(f"      Interpretation: {interpret_csi(result_1.get('value'))}")
    
    os.remove(test_path_1)
    
    # Test 2: Pure red image (moderate saturation)
    test_img_2 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_2[:, :] = [255, 0, 0]  # Pure red
    
    test_path_2 = '/tmp/test_csi_2.png'
    Image.fromarray(test_img_2).save(test_path_2)
    
    result_2 = calculate_indicator(test_path_2)
    
    print(f"\n   Test 2: Pure red image")
    print(f"      Calculated CSI: {result_2.get('value', 'N/A')}")
    print(f"      sigma_rgyb: {result_2.get('sigma_rgyb', 'N/A')}, mu_rgyb: {result_2.get('mu_rgyb', 'N/A')}")
    print(f"      mu_rg: {result_2.get('mu_rg', 'N/A')}, mu_yb: {result_2.get('mu_yb', 'N/A')}")
    print(f"      Interpretation: {interpret_csi(result_2.get('value'))}")
    
    os.remove(test_path_2)
    
    # Test 3: Mixed colorful image (high saturation)
    test_img_3 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_3[:25, :] = [255, 0, 0]    # Red
    test_img_3[25:50, :] = [0, 255, 0]  # Green
    test_img_3[50:75, :] = [0, 0, 255]  # Blue
    test_img_3[75:, :] = [255, 255, 0]  # Yellow
    
    test_path_3 = '/tmp/test_csi_3.png'
    Image.fromarray(test_img_3).save(test_path_3)
    
    result_3 = calculate_indicator(test_path_3)
    
    print(f"\n   Test 3: Mixed colorful image (R, G, B, Y stripes)")
    print(f"      Calculated CSI: {result_3.get('value', 'N/A')}")
    print(f"      sigma_rgyb: {result_3.get('sigma_rgyb', 'N/A')}, mu_rgyb: {result_3.get('mu_rgyb', 'N/A')}")
    print(f"      sigma_rg: {result_3.get('sigma_rg', 'N/A')}, sigma_yb: {result_3.get('sigma_yb', 'N/A')}")
    print(f"      Interpretation: {interpret_csi(result_3.get('value'))}")
    
    os.remove(test_path_3)
    
    # Test 4: Muted/pastel colors
    test_img_4 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_4[:50, :] = [200, 180, 180]  # Muted pink
    test_img_4[50:, :] = [180, 200, 180]  # Muted green
    
    test_path_4 = '/tmp/test_csi_4.png'
    Image.fromarray(test_img_4).save(test_path_4)
    
    result_4 = calculate_indicator(test_path_4)
    
    print(f"\n   Test 4: Muted/pastel colors")
    print(f"      Calculated CSI: {result_4.get('value', 'N/A')}")
    print(f"      sigma_rgyb: {result_4.get('sigma_rgyb', 'N/A')}, mu_rgyb: {result_4.get('mu_rgyb', 'N/A')}")
    print(f"      Mean HSV Saturation: {result_4.get('mean_saturation_hsv', 'N/A')}")
    print(f"      Interpretation: {interpret_csi(result_4.get('value'))}")
    
    os.remove(test_path_4)
    
    # Test 5: Natural green vegetation colors
    test_img_5 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_5[:50, :] = [34, 139, 34]   # Forest green
    test_img_5[50:, :] = [107, 142, 35]  # Olive drab
    
    test_path_5 = '/tmp/test_csi_5.png'
    Image.fromarray(test_img_5).save(test_path_5)
    
    result_5 = calculate_indicator(test_path_5)
    
    print(f"\n   Test 5: Natural green vegetation colors")
    print(f"      Calculated CSI: {result_5.get('value', 'N/A')}")
    print(f"      sigma_rgyb: {result_5.get('sigma_rgyb', 'N/A')}, mu_rgyb: {result_5.get('mu_rgyb', 'N/A')}")
    print(f"      Mean HSV Saturation: {result_5.get('mean_saturation_hsv', 'N/A')}")
    print(f"      Interpretation: {interpret_csi(result_5.get('value'))}")
    
    os.remove(test_path_5)
    
    print("\n   ✅ Test complete!")
    print("\n   📊 Formula Components:")
    print("      CSI = sigma_rgyb + 0.3 × mu_rgyb")
    print("      sigma_rgyb = sqrt(sigma_rg² + sigma_yb²)")
    print("      mu_rgyb = sqrt(mu_rg² + mu_yb²)")
    print("      rg = R - G, yb = 0.5×(R+G) - B")
