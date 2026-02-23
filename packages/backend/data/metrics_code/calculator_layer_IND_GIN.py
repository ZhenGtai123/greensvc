"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_GIN
Indicator Name: Gini Index
Type: TYPE B (Custom Mathematical Formula)

Description:
    The Gini Index (GIN) is a measure of statistical dispersion intended 
    to represent the inequality of a distribution. In the context of 
    semantic segmentation images, it measures how unequally pixels are 
    distributed across different semantic classes.
    
    A Gini Index of 0 represents perfect equality (all classes have equal
    pixel counts), while a Gini Index approaching 1 represents maximum
    inequality (one class dominates all pixels).
    
Formula: 
    G = (sum_i sum_j |p_i - p_j|) / (2 * n)
    
    Or equivalently using the sorted cumulative sum approach:
    G = (n + 1 - 2 * sum((n + 1 - i) * p_sorted_i)) / n
    
Variables:
    - G: Gini Index (coefficient)
    - p_i: Proportion of pixels in class i
    - n: Number of classes with non-zero pixels
    - p_sorted_i: Proportions sorted in ascending order

Unit: index (dimensionless)
Range: 0.0 (perfect equality) to 1.0 (maximum inequality)
"""

import numpy as np
from PIL import Image
from typing import Dict, List, Tuple


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_GIN",
    "name": "Gini Index",
    "unit": "index",
    "formula": "G = sum|p_i - p_j| / (2n) or G = 1 - 2*sum(cumulative_prop)/n",
    "formula_description": "Standard Gini coefficient on pixel proportions",
    "target_direction": "NEUTRAL",  # Context-dependent: equality vs concentration
    "definition": "A measure of statistical dispersion representing the inequality of pixel distribution across semantic classes",
    "category": "CAT_CMP",
    
    # TYPE B Configuration
    "calc_type": "custom",  # Custom mathematical formula
    
    # Variables
    "variables": {
        "G": "Gini Index (coefficient)",
        "p_i": "Proportion of pixels in class i",
        "n": "Number of classes with non-zero pixels",
        "cumulative_prop": "Cumulative proportion of sorted classes"
    },
    
    # Additional metadata
    "output_range": {
        "min": 0.0,
        "max": 1.0,
        "description": "0 = perfect equality; 1 = maximum inequality"
    },
    "algorithm": "Standard Gini coefficient calculation",
    "note": "Higher values indicate more unequal distribution (dominated by few classes)"
}

print(f"\n✅ Calculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f"   Formula: {INDICATOR['formula']}")
print(f"   Algorithm: {INDICATOR['algorithm']}")


# =============================================================================
# GINI COEFFICIENT CALCULATION
# =============================================================================
def calculate_gini_coefficient(proportions: np.ndarray) -> float:
    """
    Calculate the Gini coefficient for a distribution of proportions.
    
    Uses the formula based on sorted cumulative sums:
    G = (n + 1 - 2 * sum((n + 1 - i) * p_sorted_i)) / n
    
    This is equivalent to:
    G = 1 - 2 * (area under Lorenz curve)
    
    Args:
        proportions: Array of proportions (should sum to 1)
        
    Returns:
        Gini coefficient (0 to 1)
    """
    # Filter out zero values and normalize
    props = proportions[proportions > 0]
    
    if len(props) == 0:
        return 0.0
    
    if len(props) == 1:
        return 0.0  # Single class = no inequality concept
    
    # Normalize to ensure sum = 1
    props = props / np.sum(props)
    
    # Sort in ascending order
    props_sorted = np.sort(props)
    n = len(props_sorted)
    
    # Calculate Gini using the formula:
    # G = (n + 1 - 2 * sum((n + 1 - i) * p_i)) / n
    # where i goes from 1 to n
    indices = np.arange(1, n + 1)
    weights = n + 1 - indices
    gini = (n + 1 - 2 * np.sum(weights * props_sorted)) / n
    
    # Ensure result is in valid range
    return max(0.0, min(1.0, gini))


def calculate_gini_pairwise(proportions: np.ndarray) -> float:
    """
    Calculate Gini coefficient using pairwise differences.
    
    Formula: G = sum_i sum_j |p_i - p_j| / (2 * n * mean(p))
    
    For normalized proportions where sum(p) = 1:
    G = sum_i sum_j |p_i - p_j| / (2 * n)
    
    Args:
        proportions: Array of proportions
        
    Returns:
        Gini coefficient (0 to 1)
    """
    props = proportions[proportions > 0]
    
    if len(props) <= 1:
        return 0.0
    
    # Normalize
    props = props / np.sum(props)
    n = len(props)
    
    # Calculate sum of absolute differences
    total_diff = 0.0
    for i in range(n):
        for j in range(n):
            total_diff += abs(props[i] - props[j])
    
    # Gini = sum|p_i - p_j| / (2 * n)
    # But we need to account for mean, so:
    # G = sum|p_i - p_j| / (2 * n * mean) = sum|p_i - p_j| * n / (2 * n) = sum|p_i - p_j| / 2
    # For normalized props where mean = 1/n:
    gini = total_diff / (2 * n * (1/n))  # = total_diff * n / 2
    
    # Actually the correct formula for normalized data is:
    # G = sum|p_i - p_j| / (2 * n^2 * mean) where mean = 1/n
    # G = sum|p_i - p_j| * n / (2 * n^2) = sum|p_i - p_j| / (2 * n)
    gini = total_diff / (2 * n)
    
    return max(0.0, min(1.0, gini))


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str, 
                        semantic_colors: Dict[str, Tuple[int, int, int]] = None) -> Dict:
    """
    Calculate the Gini Index (GIN) indicator for pixel distribution inequality.
    
    TYPE B - Custom Mathematical Formula
    
    Formula:
        G = (n + 1 - 2 * sum((n + 1 - i) * p_sorted_i)) / n
        
    Measures how unequally pixels are distributed across semantic classes.
    
    Args:
        image_path: Path to the semantic segmentation mask image
        semantic_colors: Dictionary mapping class names to RGB tuples.
                        If not provided, auto-detects unique colors.
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): Gini Index (0 to 1)
            - 'n_classes' (int): Number of classes detected
            - 'dominant_class' (str): Class with most pixels
            - 'dominance_ratio' (float): Proportion of dominant class
            - 'class_distribution' (dict): Pixel counts by class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"Gini Index: {result['value']:.3f}")
    """
    try:
        # Step 1: Load and prepare the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Step 2: Count pixels by class
        class_counts = {}
        
        if semantic_colors:
            # Use provided semantic color configuration
            for class_name, rgb in semantic_colors.items():
                mask = np.all(pixels == rgb, axis=2)
                count = int(np.sum(mask))
                if count > 0:
                    class_counts[class_name] = count
        else:
            # Auto-detect unique colors
            pixels_reshaped = pixels.reshape(-1, 3)
            unique_colors, counts = np.unique(pixels_reshaped, axis=0, return_counts=True)
            for i, (color, count) in enumerate(zip(unique_colors, counts)):
                class_name = f"class_{i+1}_rgb({color[0]},{color[1]},{color[2]})"
                class_counts[class_name] = int(count)
        
        # Step 3: Calculate proportions
        if not class_counts:
            return {
                'success': False,
                'error': 'No classes detected in image',
                'value': None
            }
        
        counts_array = np.array(list(class_counts.values()))
        proportions = counts_array / np.sum(counts_array)
        
        n_classes = len(class_counts)
        
        # Step 4: Calculate Gini Index
        gini = calculate_gini_coefficient(proportions)
        
        # Step 5: Calculate additional metrics
        # Find dominant class
        sorted_classes = sorted(class_counts.items(), key=lambda x: x[1], reverse=True)
        dominant_class = sorted_classes[0][0]
        dominance_ratio = sorted_classes[0][1] / total_pixels
        
        # Calculate Lorenz curve points for reference
        props_sorted = np.sort(proportions)
        cumsum = np.cumsum(props_sorted)
        lorenz_area = np.sum(cumsum) / n_classes  # Approximate area under Lorenz curve
        
        # Theoretical maximum Gini for n classes
        # Max Gini approaches (n-1)/n when one class has everything
        max_gini = (n_classes - 1) / n_classes if n_classes > 1 else 0
        
        # Step 6: Return results
        return {
            'success': True,
            'value': round(gini, 3),
            'n_classes': n_classes,
            'dominant_class': dominant_class,
            'dominance_ratio': round(dominance_ratio, 3),
            'total_pixels': int(total_pixels),
            'max_gini': round(max_gini, 3),
            'normalized_gini': round(gini / max_gini, 3) if max_gini > 0 else 0,
            'lorenz_area': round(lorenz_area, 3),
            'class_distribution': dict(sorted_classes[:10]),  # Top 10 classes
            'top_classes': [(name, round(count/total_pixels, 3)) for name, count in sorted_classes[:5]]
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
def interpret_gini(gini: float) -> str:
    """
    Interpret the Gini Index value.
    
    Args:
        gini: Gini Index (0 to 1)
        
    Returns:
        str: Qualitative interpretation
    """
    if gini is None:
        return "Unable to interpret (no data)"
    elif gini < 0.2:
        return "Low inequality: relatively equal distribution across classes"
    elif gini < 0.4:
        return "Moderate inequality: some classes more prevalent"
    elif gini < 0.6:
        return "High inequality: distribution concentrated in few classes"
    elif gini < 0.8:
        return "Very high inequality: strongly dominated by few classes"
    else:
        return "Extreme inequality: almost all pixels in one or two classes"


def explain_gini_formula() -> str:
    """
    Provide educational explanation of the Gini Index formula.
    
    Returns:
        str: Explanation text
    """
    return """
    Gini Index Formula for Pixel Distribution:
    
    Method 1 - Sorted cumulative approach:
    G = (n + 1 - 2 * sum((n + 1 - i) * p_sorted_i)) / n
    
    Method 2 - Pairwise differences:
    G = sum_i sum_j |p_i - p_j| / (2 * n)
    
    Where:
    - p_i = Proportion of pixels in class i
    - n = Number of classes with non-zero pixels
    - p_sorted = Proportions sorted in ascending order
    
    Interpretation:
    - G = 0: Perfect equality (all classes have equal pixels)
    - G = 1: Maximum inequality (all pixels in one class)
    
    Lorenz Curve Connection:
    - Gini = 1 - 2 * (area under Lorenz curve)
    - The Lorenz curve plots cumulative proportion of pixels
      against cumulative proportion of classes
    
    For semantic segmentation:
    - Low Gini: Diverse scene with many element types
    - High Gini: Homogeneous scene dominated by few elements
    
    Reference values for n classes:
    - 2 classes 50/50: G = 0.00
    - 2 classes 90/10: G = 0.40
    - 3 classes equal: G = 0.00
    - 3 classes 80/15/5: G ≈ 0.50
    - 5 classes equal: G = 0.00
    - 5 classes with one at 90%: G ≈ 0.72
    """


# =============================================================================
# STANDALONE TEST (Optional)
# =============================================================================
if __name__ == "__main__":
    import os
    
    print("\n🧪 Testing Gini Index calculator...")
    
    # Test 1: Perfect equality (2 classes, 50/50)
    test_img_1 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_1[:50, :] = [255, 0, 0]   # Red - 50%
    test_img_1[50:, :] = [0, 255, 0]   # Green - 50%
    
    test_path_1 = '/tmp/test_gin_1.png'
    Image.fromarray(test_img_1).save(test_path_1)
    
    test_semantic_1 = {"red": (255, 0, 0), "green": (0, 255, 0)}
    result_1 = calculate_indicator(test_path_1, test_semantic_1)
    
    print(f"\n   Test 1: Two classes, 50/50 split (perfect equality)")
    print(f"      Expected Gini: 0.000")
    print(f"      Calculated Gini: {result_1.get('value', 'N/A')}")
    
    os.remove(test_path_1)
    
    # Test 2: High inequality (2 classes, 90/10)
    test_img_2 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_2[:90, :] = [255, 0, 0]   # Red - 90%
    test_img_2[90:, :] = [0, 255, 0]   # Green - 10%
    
    test_path_2 = '/tmp/test_gin_2.png'
    Image.fromarray(test_img_2).save(test_path_2)
    
    result_2 = calculate_indicator(test_path_2, test_semantic_1)
    
    print(f"\n   Test 2: Two classes, 90/10 split (high inequality)")
    print(f"      Expected Gini: ~0.400")
    print(f"      Calculated Gini: {result_2.get('value', 'N/A')}")
    
    os.remove(test_path_2)
    
    # Test 3: Four classes equal (25% each)
    test_img_3 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_3[:25, :] = [255, 0, 0]     # Red - 25%
    test_img_3[25:50, :] = [0, 255, 0]   # Green - 25%
    test_img_3[50:75, :] = [0, 0, 255]   # Blue - 25%
    test_img_3[75:, :] = [255, 255, 0]   # Yellow - 25%
    
    test_path_3 = '/tmp/test_gin_3.png'
    Image.fromarray(test_img_3).save(test_path_3)
    
    test_semantic_3 = {"red": (255, 0, 0), "green": (0, 255, 0), 
                       "blue": (0, 0, 255), "yellow": (255, 255, 0)}
    result_3 = calculate_indicator(test_path_3, test_semantic_3)
    
    print(f"\n   Test 3: Four classes, 25% each (perfect equality)")
    print(f"      Expected Gini: 0.000")
    print(f"      Calculated Gini: {result_3.get('value', 'N/A')}")
    
    os.remove(test_path_3)
    
    # Test 4: Single class (complete dominance)
    test_img_4 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_4[:, :] = [255, 0, 0]  # All red
    
    test_path_4 = '/tmp/test_gin_4.png'
    Image.fromarray(test_img_4).save(test_path_4)
    
    result_4 = calculate_indicator(test_path_4, test_semantic_1)
    
    print(f"\n   Test 4: Single class (100% one class)")
    print(f"      Expected Gini: 0.000 (only one class, no inequality concept)")
    print(f"      Calculated Gini: {result_4.get('value', 'N/A')}")
    print(f"      Interpretation: {interpret_gini(result_4.get('value'))}")
    
    os.remove(test_path_4)
    
    # Test 5: Unequal distribution (5 classes: 60/20/10/7/3)
    test_img_5 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_5[:60, :] = [255, 0, 0]      # Red - 60%
    test_img_5[60:80, :] = [0, 255, 0]    # Green - 20%
    test_img_5[80:90, :] = [0, 0, 255]    # Blue - 10%
    test_img_5[90:97, :] = [255, 255, 0]  # Yellow - 7%
    test_img_5[97:, :] = [255, 0, 255]    # Magenta - 3%
    
    test_path_5 = '/tmp/test_gin_5.png'
    Image.fromarray(test_img_5).save(test_path_5)
    
    test_semantic_5 = {"red": (255, 0, 0), "green": (0, 255, 0), "blue": (0, 0, 255),
                       "yellow": (255, 255, 0), "magenta": (255, 0, 255)}
    result_5 = calculate_indicator(test_path_5, test_semantic_5)
    
    print(f"\n   Test 5: Five classes (60/20/10/7/3)")
    print(f"      Expected Gini: ~0.4-0.5 (moderate-high inequality)")
    print(f"      Calculated Gini: {result_5.get('value', 'N/A')}")
    print(f"      Dominant class: {result_5.get('dominant_class', 'N/A')}")
    print(f"      Dominance ratio: {result_5.get('dominance_ratio', 'N/A')}")
    print(f"      Interpretation: {interpret_gini(result_5.get('value'))}")
    
    os.remove(test_path_5)
    
    print("\n   ✅ Test complete!")
