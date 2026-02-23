"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_VGD
Indicator Name: Visible Green Distribution
Type: TYPE B (Custom Mathematical Formula - Spatial Clustering)

Description:
    The Visible Green Distribution (VGD) is a measure of the spatial 
    clustering of vegetation pixels within an image. It quantifies how 
    clustered or dispersed the vegetation is spatially. Higher values 
    indicate more clustered vegetation (e.g., a solid tree canopy), 
    while lower values indicate more dispersed vegetation (scattered 
    individual pixels).
    
Formula: 
    VGD = 0.5 * Sum(xi * xj) / xperc
    
Variables:
    - xi, xj: Binary pixel status at adjacent locations i and j (1 if vegetation, 0 otherwise)
    - Sum(xi * xj): Count of adjacent vegetation pixel pairs
    - xperc: Percentage of vegetation pixels (vegetation_pixels / total_pixels)

Unit: index (dimensionless)
Range: 0.0 (no vegetation or completely dispersed) to high values (highly clustered)
"""

import numpy as np
from PIL import Image
from typing import Dict, List, Tuple
from scipy import ndimage


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_VGD",
    "name": "Visible Green Distribution",
    "unit": "index",
    "formula": "VGD = 0.5 * Sum(xi * xj) / xperc",
    "formula_description": "Spatial clustering measure of vegetation pixels",
    "target_direction": "CONTEXT",  # Depends on design intent
    "definition": "A measure of the spatial clustering of vegetation pixels within an image",
    "category": "CAT_CFG",
    
    # TYPE B Configuration
    "calc_type": "custom",  # Custom spatial clustering formula
    
    # Variables
    "variables": {
        "xi": "Binary pixel status at location i (1 if vegetation, 0 otherwise)",
        "xj": "Binary pixel status at adjacent location j",
        "Sum(xi*xj)": "Count of adjacent vegetation pixel pairs",
        "xperc": "Percentage of vegetation pixels (veg_pixels / total_pixels)"
    },
    
    # Additional metadata
    "output_range": {
        "min": 0.0,
        "max": "unbounded",
        "description": "0 = no vegetation; higher values = more clustered vegetation"
    },
    "algorithm": "Join count statistics for spatial autocorrelation",
    "note": "Higher values indicate clustered vegetation; lower values indicate dispersed vegetation"
}

print(f"\n✅ Calculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f"   Formula: {INDICATOR['formula']}")
print(f"   Type: TYPE B (Spatial Clustering)")


# =============================================================================
# VEGETATION CLASS IDENTIFICATION
# =============================================================================
# Keywords to identify vegetation classes
VEGETATION_KEYWORDS = [
    "tree", "trees",
    "vegetation", "plant", "plants",
    "grass", "lawn", "turf",
    "foliage", "leaf", "leaves",
    "bush", "shrub", "hedge",
    "greenery", "flora",
    "canopy"
]


def is_vegetation_class(class_name: str) -> bool:
    """
    Check if a class name represents vegetation.
    
    Args:
        class_name: Name of the semantic class
        
    Returns:
        bool: True if class is vegetation related
    """
    class_lower = class_name.lower().replace("-", " ").replace("_", " ")
    return any(kw in class_lower for kw in VEGETATION_KEYWORDS)


# =============================================================================
# SPATIAL CLUSTERING CALCULATION
# =============================================================================
def count_adjacent_pairs(binary_mask: np.ndarray) -> int:
    """
    Count the number of adjacent vegetation pixel pairs.
    
    Uses 4-connectivity (horizontal and vertical neighbors only).
    Each pair is counted once (not twice).
    
    Args:
        binary_mask: Binary mask where 1 = vegetation, 0 = non-vegetation
        
    Returns:
        int: Number of adjacent vegetation pixel pairs
    """
    # Ensure binary mask
    mask = (binary_mask > 0).astype(np.int32)
    
    # Count horizontal adjacent pairs (left-right)
    horizontal_pairs = np.sum(mask[:, :-1] * mask[:, 1:])
    
    # Count vertical adjacent pairs (up-down)
    vertical_pairs = np.sum(mask[:-1, :] * mask[1:, :])
    
    # Total adjacent pairs (each counted once)
    total_pairs = horizontal_pairs + vertical_pairs
    
    return int(total_pairs)


def count_adjacent_pairs_8connectivity(binary_mask: np.ndarray) -> int:
    """
    Count adjacent vegetation pixel pairs using 8-connectivity.
    
    Includes diagonal neighbors in addition to horizontal/vertical.
    
    Args:
        binary_mask: Binary mask where 1 = vegetation, 0 = non-vegetation
        
    Returns:
        int: Number of adjacent vegetation pixel pairs
    """
    mask = (binary_mask > 0).astype(np.int32)
    
    # Horizontal pairs
    horizontal = np.sum(mask[:, :-1] * mask[:, 1:])
    
    # Vertical pairs
    vertical = np.sum(mask[:-1, :] * mask[1:, :])
    
    # Diagonal pairs (top-left to bottom-right)
    diag1 = np.sum(mask[:-1, :-1] * mask[1:, 1:])
    
    # Diagonal pairs (top-right to bottom-left)
    diag2 = np.sum(mask[:-1, 1:] * mask[1:, :-1])
    
    total_pairs = horizontal + vertical + diag1 + diag2
    
    return int(total_pairs)


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str, 
                        semantic_colors: Dict[str, Tuple[int, int, int]] = None,
                        connectivity: int = 4) -> Dict:
    """
    Calculate the Visible Green Distribution (VGD) indicator.
    
    TYPE B - Custom Mathematical Formula (Spatial Clustering)
    
    Formula:
        VGD = 0.5 * Sum(xi * xj) / xperc
        
    Where:
        - xi, xj are binary values at adjacent locations
        - xperc is the percentage of vegetation pixels
    
    Args:
        image_path: Path to the semantic segmentation mask image
        semantic_colors: Dictionary mapping class names to RGB tuples.
        connectivity: 4 or 8 for neighbor connectivity (default: 4)
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): VGD index
            - 'vegetation_pixels' (int): Total vegetation pixels
            - 'veg_percentage' (float): Vegetation percentage (xperc)
            - 'adjacent_pairs' (int): Number of adjacent vegetation pairs
            - 'vegetation_classes_found' (dict): Pixel counts by class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"VGD: {result['value']:.3f}")
        ...     print(f"Vegetation: {result['veg_percentage']:.2f}%")
    """
    try:
        # Step 1: Load and prepare the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Step 2: Create vegetation mask
        vegetation_mask = np.zeros((h, w), dtype=np.uint8)
        vegetation_classes_found = {}
        
        if semantic_colors:
            # Use provided semantic color configuration
            for class_name, rgb in semantic_colors.items():
                if is_vegetation_class(class_name):
                    mask = np.all(pixels == rgb, axis=2)
                    count = int(np.sum(mask))
                    if count > 0:
                        vegetation_mask[mask] = 1
                        vegetation_classes_found[class_name] = count
        else:
            # Fallback: detect green-ish colors
            r, g, b = pixels[:,:,0], pixels[:,:,1], pixels[:,:,2]
            green_like = (g > r) & (g > b) & (g > 50)
            vegetation_mask[green_like] = 1
            if np.sum(green_like) > 0:
                vegetation_classes_found['detected_vegetation'] = int(np.sum(green_like))
        
        # Step 3: Calculate vegetation statistics
        vegetation_pixels = int(np.sum(vegetation_mask > 0))
        
        # Handle edge cases
        if vegetation_pixels == 0:
            return {
                'success': True,
                'value': 0.0,
                'vegetation_pixels': 0,
                'total_pixels': int(total_pixels),
                'veg_percentage': 0.0,
                'adjacent_pairs': 0,
                'n_vegetation_classes': 0,
                'vegetation_classes_found': {},
                'interpretation': 'No vegetation detected'
            }
        
        # Step 4: Calculate xperc (vegetation percentage as fraction)
        xperc = vegetation_pixels / total_pixels
        
        # Step 5: Count adjacent vegetation pixel pairs
        if connectivity == 8:
            adjacent_pairs = count_adjacent_pairs_8connectivity(vegetation_mask)
        else:
            adjacent_pairs = count_adjacent_pairs(vegetation_mask)
        
        # Step 6: Calculate VGD using formula: 0.5 * Sum(xi * xj) / xperc
        # Note: The factor 0.5 may be to normalize or avoid double-counting
        vgd = (0.5 * adjacent_pairs) / xperc if xperc > 0 else 0.0
        
        # Step 7: Calculate additional metrics
        # Expected pairs for random distribution (for reference)
        # In a random distribution, expected pairs ≈ 4 * n^2 / total for 4-connectivity
        expected_random = 2 * (h * (w - 1) + w * (h - 1)) * (xperc ** 2)
        clustering_ratio = adjacent_pairs / expected_random if expected_random > 0 else 0
        
        # Step 8: Return results
        return {
            'success': True,
            'value': round(vgd, 3),
            'vegetation_pixels': vegetation_pixels,
            'total_pixels': int(total_pixels),
            'veg_percentage': round(xperc * 100, 2),
            'veg_fraction': round(xperc, 4),
            'adjacent_pairs': adjacent_pairs,
            'connectivity': connectivity,
            'n_vegetation_classes': len(vegetation_classes_found),
            'vegetation_classes_found': dict(sorted(
                vegetation_classes_found.items(), 
                key=lambda x: x[1], 
                reverse=True
            )),
            'clustering_ratio': round(clustering_ratio, 3),
            'expected_random_pairs': round(expected_random, 0)
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
def interpret_vgd(vgd: float, veg_percentage: float = None) -> str:
    """
    Interpret the Visible Green Distribution value.
    
    Args:
        vgd: VGD index
        veg_percentage: Vegetation percentage (optional, for context)
        
    Returns:
        str: Qualitative interpretation
    """
    if vgd is None:
        return "Unable to interpret (no data)"
    elif vgd == 0:
        return "No vegetation detected"
    elif veg_percentage is not None and veg_percentage < 1:
        return "Very sparse vegetation"
    elif vgd < 100:
        return "Dispersed vegetation: scattered distribution"
    elif vgd < 500:
        return "Moderately clustered vegetation"
    elif vgd < 1000:
        return "Clustered vegetation: grouped distribution"
    elif vgd < 5000:
        return "Highly clustered vegetation: dense groups"
    else:
        return "Very highly clustered vegetation: solid masses"


def explain_formula() -> str:
    """
    Provide educational explanation of the VGD formula.
    
    Returns:
        str: Explanation text
    """
    return """
    Visible Green Distribution (VGD) Formula:
    
    VGD = 0.5 * Sum(xi * xj) / xperc
    
    Where:
    - xi = 1 if pixel i is vegetation, 0 otherwise
    - xj = 1 if adjacent pixel j is vegetation, 0 otherwise
    - Sum(xi * xj) = count of adjacent vegetation pixel pairs
    - xperc = vegetation_pixels / total_pixels (vegetation fraction)
    - 0.5 factor normalizes the count
    
    Interpretation:
    
    The formula measures spatial autocorrelation of vegetation:
    - Higher VGD: Vegetation is clustered together (solid masses)
    - Lower VGD: Vegetation is dispersed (scattered pixels)
    
    For the same vegetation percentage (xperc):
    - A solid rectangular block of vegetation → high VGD
    - Scattered individual pixels → low VGD
    
    Example:
    - 100 vegetation pixels as 10x10 block: many adjacent pairs → high VGD
    - 100 vegetation pixels scattered: few adjacent pairs → low VGD
    
    This indicator helps assess:
    - Urban canopy connectivity
    - Green space fragmentation
    - Vegetation pattern quality
    
    Clustering Ratio:
    - Ratio of actual pairs to expected random pairs
    - > 1.0 indicates clustering
    - < 1.0 indicates dispersion
    - = 1.0 indicates random distribution
    """


# =============================================================================
# STANDALONE TEST (Optional)
# =============================================================================
if __name__ == "__main__":
    import os
    
    print("\n🧪 Testing Visible Green Distribution calculator...")
    
    # Test 1: No vegetation (all sky)
    test_img_1 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_1[:, :] = [135, 206, 235]  # Sky blue
    
    test_path_1 = '/tmp/test_vgd_1.png'
    Image.fromarray(test_img_1).save(test_path_1)
    
    test_semantic_1 = {"sky": (135, 206, 235), "tree": (34, 139, 34)}
    result_1 = calculate_indicator(test_path_1, test_semantic_1)
    
    print(f"\n   Test 1: No vegetation (100% sky)")
    print(f"      Expected VGD: 0.000")
    print(f"      Calculated VGD: {result_1.get('value', 'N/A')}")
    print(f"      Adjacent pairs: {result_1.get('adjacent_pairs', 'N/A')}")
    
    os.remove(test_path_1)
    
    # Test 2: Clustered vegetation (solid 20x20 block)
    test_img_2 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_2[:, :] = [135, 206, 235]   # Sky blue (background)
    test_img_2[40:60, 40:60] = [34, 139, 34]  # Green 20x20 block (4% of image)
    
    test_path_2 = '/tmp/test_vgd_2.png'
    Image.fromarray(test_img_2).save(test_path_2)
    
    result_2 = calculate_indicator(test_path_2, test_semantic_1)
    
    print(f"\n   Test 2: Clustered vegetation (20x20 solid block)")
    print(f"      Veg percentage: {result_2.get('veg_percentage', 'N/A')}%")
    print(f"      Adjacent pairs: {result_2.get('adjacent_pairs', 'N/A')}")
    print(f"      VGD: {result_2.get('value', 'N/A')}")
    print(f"      Clustering ratio: {result_2.get('clustering_ratio', 'N/A')}")
    
    os.remove(test_path_2)
    
    # Test 3: Dispersed vegetation (scattered pixels - checkerboard pattern)
    test_img_3 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_3[:, :] = [135, 206, 235]  # Sky blue (background)
    # Create scattered pattern - every 5th pixel in a grid
    for i in range(0, 100, 5):
        for j in range(0, 100, 5):
            test_img_3[i, j] = [34, 139, 34]  # Scattered green pixels
    
    test_path_3 = '/tmp/test_vgd_3.png'
    Image.fromarray(test_img_3).save(test_path_3)
    
    result_3 = calculate_indicator(test_path_3, test_semantic_1)
    
    print(f"\n   Test 3: Dispersed vegetation (scattered pixels every 5th)")
    print(f"      Veg percentage: {result_3.get('veg_percentage', 'N/A')}%")
    print(f"      Adjacent pairs: {result_3.get('adjacent_pairs', 'N/A')}")
    print(f"      VGD: {result_3.get('value', 'N/A')}")
    print(f"      Clustering ratio: {result_3.get('clustering_ratio', 'N/A')}")
    
    os.remove(test_path_3)
    
    # Test 4: Large clustered vegetation (50% coverage as block)
    test_img_4 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_4[:, :] = [135, 206, 235]   # Sky blue
    test_img_4[:50, :] = [34, 139, 34]   # Top half green
    
    test_path_4 = '/tmp/test_vgd_4.png'
    Image.fromarray(test_img_4).save(test_path_4)
    
    result_4 = calculate_indicator(test_path_4, test_semantic_1)
    
    print(f"\n   Test 4: Large clustered vegetation (50% as solid block)")
    print(f"      Veg percentage: {result_4.get('veg_percentage', 'N/A')}%")
    print(f"      Adjacent pairs: {result_4.get('adjacent_pairs', 'N/A')}")
    print(f"      VGD: {result_4.get('value', 'N/A')}")
    print(f"      Clustering ratio: {result_4.get('clustering_ratio', 'N/A')}")
    print(f"      Interpretation: {interpret_vgd(result_4.get('value'), result_4.get('veg_percentage'))}")
    
    os.remove(test_path_4)
    
    # Comparison summary
    print("\n   📊 Comparison Summary:")
    print("      Same percentage, different patterns:")
    print(f"      - Clustered (block): VGD={result_2.get('value', 'N/A')}, Clustering={result_2.get('clustering_ratio', 'N/A')}")
    print(f"      - Dispersed (scattered): VGD={result_3.get('value', 'N/A')}, Clustering={result_3.get('clustering_ratio', 'N/A')}")
    print("\n      ✅ Higher VGD = more clustered vegetation")
    print("      ✅ Clustering ratio > 1 = clustered, < 1 = dispersed")
    
    print("\n   ✅ Test complete!")
