"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_CEI
Indicator Name: Ceiling View Index
Type: TYPE A (Simple Pixel Ratio)

Description:
    The Ceiling View Index (CEI) measures the proportion of the visual 
    field occupied by ceilings, specifically the underside of viaducts, 
    overpasses, bridges, and similar overhead structures. This indicator 
    reflects the degree to which overhead infrastructure affects the 
    visual experience in urban environments.
    
Formula: 
    CEI = Pixel_Ceiling / Total_Pixels
    
Variables:
    - Pixel_Ceiling: Number of pixels classified as ceiling/bridge underside
    - Total_Pixels: Total number of pixels in the image

Unit: ratio (0 to 1)
Range: 0.0 (no ceiling visible) to 1.0 (entirely ceiling)
"""

import numpy as np
from PIL import Image
from typing import Dict, List, Tuple


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_CEI",
    "name": "Ceiling View Index",
    "unit": "ratio",
    "formula": "CEI = Pixel_Ceiling / Total_Pixels",
    "formula_description": "Ceiling/overhead structure pixels divided by total pixels",
    "target_direction": "CONTEXT",  # Depends on design intent
    "definition": "The proportion of the visual field occupied by ceilings (underside of viaducts, overpasses, or bridges)",
    "category": "CAT_CMP",
    
    # TYPE A Configuration
    "calc_type": "ratio",  # Simple pixel ratio
    
    # Variables
    "variables": {
        "Pixel_Ceiling": "Number of pixels classified as ceiling/bridge underside",
        "Total_Pixels": "Total number of pixels in the image"
    },
    
    # Additional metadata
    "output_range": {
        "min": 0.0,
        "max": 1.0,
        "description": "0 = no ceiling; 1 = entirely ceiling"
    },
    "algorithm": "Ceiling pixels / Total pixels",
    "note": "Measures visibility of overhead structures like viaducts, bridges, overpasses"
}

print(f"\n✅ Calculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f"   Formula: {INDICATOR['formula']}")
print(f"   Type: TYPE A (Simple Pixel Ratio)")


# =============================================================================
# CEILING CLASS IDENTIFICATION
# =============================================================================
# Keywords to identify ceiling/overhead structure classes
CEILING_KEYWORDS = [
    # Direct ceiling terms
    "ceiling", "ceil",
    
    # Bridge and viaduct
    "bridge", "viaduct", "overpass", "flyover",
    "underpass", "underside",
    
    # Overhead structures
    "overhead", "over head", "over_head",
    "canopy", "awning", "overhang",
    
    # Tunnel-like structures
    "tunnel", "covered", "arcade",
    
    # Elevated structures
    "elevated", "elevated structure",
    "highway underside", "road underside"
]


def is_ceiling_class(class_name: str) -> bool:
    """
    Check if a class name represents a ceiling/overhead structure.
    
    Args:
        class_name: Name of the semantic class
        
    Returns:
        bool: True if class is ceiling/overhead related
    """
    class_lower = class_name.lower().replace("-", " ").replace("_", " ")
    return any(kw in class_lower for kw in CEILING_KEYWORDS)


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str, 
                        semantic_colors: Dict[str, Tuple[int, int, int]] = None) -> Dict:
    """
    Calculate the Ceiling View Index (CEI) indicator.
    
    TYPE A - Simple Pixel Ratio
    
    Formula:
        CEI = Pixel_Ceiling / Total_Pixels
        
    Ceiling classes include: ceilings, bridge undersides, viaducts, 
    overpasses, tunnels, and other overhead structures.
    
    Args:
        image_path: Path to the semantic segmentation mask image
        semantic_colors: Dictionary mapping class names to RGB tuples.
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): CEI ratio (0 to 1)
            - 'ceiling_pixels' (int): Total ceiling pixels
            - 'total_pixels' (int): Total image pixels
            - 'ceiling_coverage_pct' (float): Ceiling coverage percentage
            - 'ceiling_classes_found' (dict): Pixel counts by class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"CEI: {result['value']:.4f}")
        ...     print(f"Ceiling coverage: {result['ceiling_coverage_pct']:.2f}%")
    """
    try:
        # Step 1: Load and prepare the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Step 2: Create ceiling mask and count by class
        ceiling_mask = np.zeros((h, w), dtype=np.uint8)
        ceiling_classes_found = {}
        
        if semantic_colors:
            # Use provided semantic color configuration
            for class_name, rgb in semantic_colors.items():
                if is_ceiling_class(class_name):
                    mask = np.all(pixels == rgb, axis=2)
                    count = int(np.sum(mask))
                    if count > 0:
                        ceiling_mask[mask] = 1
                        ceiling_classes_found[class_name] = count
        
        # Step 3: Calculate CEI
        ceiling_pixels = int(np.sum(ceiling_mask > 0))
        cei = ceiling_pixels / total_pixels if total_pixels > 0 else 0.0
        
        # Step 4: Calculate additional metrics
        n_ceiling_classes = len(ceiling_classes_found)
        ceiling_coverage_pct = cei * 100
        
        # Sort ceiling classes by pixel count
        sorted_ceiling = dict(sorted(
            ceiling_classes_found.items(), 
            key=lambda x: x[1], 
            reverse=True
        ))
        
        # Find dominant ceiling class
        dominant_class = max(ceiling_classes_found, key=ceiling_classes_found.get) if ceiling_classes_found else None
        
        # Step 5: Return results
        return {
            'success': True,
            'value': round(cei, 4),
            'ceiling_pixels': ceiling_pixels,
            'total_pixels': int(total_pixels),
            'non_ceiling_pixels': int(total_pixels - ceiling_pixels),
            'ceiling_coverage_pct': round(ceiling_coverage_pct, 2),
            'n_ceiling_classes': n_ceiling_classes,
            'ceiling_classes_found': sorted_ceiling,
            'dominant_class': dominant_class
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
# HELPER FUNCTIONS
# =============================================================================
def interpret_cei(cei: float) -> str:
    """
    Interpret the Ceiling View Index value.
    
    Args:
        cei: CEI ratio (0 to 1)
        
    Returns:
        str: Qualitative interpretation
    """
    if cei is None:
        return "Unable to interpret (no data)"
    elif cei < 0.01:
        return "No ceiling/overhead structure detected"
    elif cei < 0.05:
        return "Minimal overhead coverage"
    elif cei < 0.15:
        return "Some overhead structure visible"
    elif cei < 0.30:
        return "Moderate overhead coverage"
    elif cei < 0.50:
        return "Significant overhead coverage"
    elif cei < 0.70:
        return "High overhead coverage"
    else:
        return "Very high overhead coverage (enclosed space)"


def explain_formula() -> str:
    """
    Provide educational explanation of the CEI formula.
    
    Returns:
        str: Explanation text
    """
    return """
    Ceiling View Index (CEI) Formula:
    
    CEI = Pixel_Ceiling / Total_Pixels
    
    Where:
    - Pixel_Ceiling = Count of ceiling/overhead structure pixels
    - Total_Pixels = Total pixels in the image
    
    Ceiling/Overhead Classes Include:
    
    1. Bridge Structures:
       - Bridge undersides
       - Viaducts
       - Overpasses
       - Flyovers
    
    2. Architectural Elements:
       - Ceilings
       - Canopies
       - Awnings
       - Overhangs
    
    3. Covered Spaces:
       - Tunnels
       - Arcades
       - Covered walkways
    
    Interpretation:
    - CEI ≈ 0: Open sky, no overhead structures
    - CEI ≈ 0.10: Light overhead coverage (10% of view)
    - CEI ≈ 0.30: Moderate coverage (under a partial canopy)
    - CEI ≈ 0.50: Significant coverage (under viaduct)
    - CEI > 0.70: Very high coverage (tunnel-like environment)
    
    Urban Planning Relevance:
    - High CEI may indicate areas under elevated highways
    - Very high CEI suggests enclosed or tunnel-like spaces
    - Low CEI indicates open sky conditions
    - Affects natural lighting and visual perception
    """


# =============================================================================
# STANDALONE TEST (Optional)
# =============================================================================
if __name__ == "__main__":
    import os
    
    print("\n🧪 Testing Ceiling View Index calculator...")
    
    # Test 1: No ceiling (all sky)
    test_img_1 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_1[:, :] = [135, 206, 235]  # Sky blue
    
    test_path_1 = '/tmp/test_cei_1.png'
    Image.fromarray(test_img_1).save(test_path_1)
    
    test_semantic_1 = {"sky": (135, 206, 235), "bridge": (100, 100, 100)}
    result_1 = calculate_indicator(test_path_1, test_semantic_1)
    
    print(f"\n   Test 1: No ceiling (100% sky)")
    print(f"      Expected CEI: 0.0000")
    print(f"      Calculated CEI: {result_1.get('value', 'N/A')}")
    print(f"      Interpretation: {interpret_cei(result_1.get('value'))}")
    
    os.remove(test_path_1)
    
    # Test 2: Partial bridge coverage (30%)
    test_img_2 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_2[:, :] = [135, 206, 235]    # Sky blue (background)
    test_img_2[:30, :] = [100, 100, 100]  # Gray (bridge) - 30%
    
    test_path_2 = '/tmp/test_cei_2.png'
    Image.fromarray(test_img_2).save(test_path_2)
    
    result_2 = calculate_indicator(test_path_2, test_semantic_1)
    
    print(f"\n   Test 2: 30% bridge coverage")
    print(f"      Expected CEI: 0.3000")
    print(f"      Calculated CEI: {result_2.get('value', 'N/A')}")
    print(f"      Ceiling classes: {result_2.get('ceiling_classes_found', {})}")
    print(f"      Interpretation: {interpret_cei(result_2.get('value'))}")
    
    os.remove(test_path_2)
    
    # Test 3: Multiple ceiling types
    test_img_3 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_3[:, :] = [135, 206, 235]       # Sky blue (background)
    test_img_3[:20, :] = [100, 100, 100]     # Gray (bridge) - 20%
    test_img_3[20:25, :] = [80, 80, 80]      # Dark gray (viaduct) - 5%
    
    test_path_3 = '/tmp/test_cei_3.png'
    Image.fromarray(test_img_3).save(test_path_3)
    
    test_semantic_3 = {
        "sky": (135, 206, 235), 
        "bridge": (100, 100, 100),
        "viaduct": (80, 80, 80)
    }
    result_3 = calculate_indicator(test_path_3, test_semantic_3)
    
    print(f"\n   Test 3: Multiple ceiling types (20% bridge + 5% viaduct)")
    print(f"      Expected CEI: 0.2500")
    print(f"      Calculated CEI: {result_3.get('value', 'N/A')}")
    print(f"      Ceiling classes: {result_3.get('n_ceiling_classes', 0)}")
    print(f"      Classes found: {result_3.get('ceiling_classes_found', {})}")
    print(f"      Interpretation: {interpret_cei(result_3.get('value'))}")
    
    os.remove(test_path_3)
    
    # Test 4: High ceiling coverage (70%)
    test_img_4 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_4[:, :] = [135, 206, 235]    # Sky blue
    test_img_4[:70, :] = [100, 100, 100]  # Gray (bridge) - 70%
    
    test_path_4 = '/tmp/test_cei_4.png'
    Image.fromarray(test_img_4).save(test_path_4)
    
    result_4 = calculate_indicator(test_path_4, test_semantic_1)
    
    print(f"\n   Test 4: High ceiling coverage (70% bridge)")
    print(f"      Expected CEI: 0.7000")
    print(f"      Calculated CEI: {result_4.get('value', 'N/A')}")
    print(f"      Interpretation: {interpret_cei(result_4.get('value'))}")
    
    os.remove(test_path_4)
    
    print("\n   ✅ Test complete!")
    print(f"\n   📝 Ceiling keywords: {CEILING_KEYWORDS[:5]}... and more")
