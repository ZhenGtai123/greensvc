"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_SIM
Indicator Name: Similarity (Gini-Simpson Index)
Type: TYPE B (Custom Mathematical Formula)

Description:
    The Similarity (SIM) indicator quantifies the uniformity and repetition
    of visual elements within a given environment. It is based on the
    Gini-Simpson Index, which measures the probability that two randomly
    selected pixels belong to different semantic categories.
    
    Lower values indicate higher similarity (pixels concentrated in few classes).
    Higher values indicate lower similarity (pixels evenly distributed).
    
Formula: 
    SIM = 1 - Σ[nᵢ × (nᵢ - 1)] / [N × (N - 1)]
    
    Simplified (for large N):
    SIM ≈ 1 - Σ(pᵢ²)
    
Variables:
    - nᵢ: Number of pixels in category i
    - N: Total number of pixels
    - pᵢ: Proportion of pixels in category i (= nᵢ/N)

Unit: dimensionless (index)
Range: 0 (all pixels in one class) to 1-1/s (s equally distributed classes)
"""

import numpy as np
from PIL import Image
from typing import Dict, List, Tuple


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_SIM",
    "name": "Similarity",
    "unit": "index",
    "formula": "SIM = 1 - Σ[nᵢ × (nᵢ - 1)] / [N × (N - 1)]",
    "formula_description": "Gini-Simpson Index (probability of different categories)",
    "target_direction": "NEUTRAL",  # Context-dependent interpretation
    "definition": "Quantifies the uniformity and repetition of visual elements within a given environment",
    "category": "CAT_CFG",
    
    # TYPE B Configuration
    "calc_type": "custom",  # Custom mathematical formula
    
    # Variables
    "variables": {
        "nᵢ": "Number of pixels in category i",
        "N": "Total number of pixels",
        "pᵢ": "Proportion of pixels in category i (= nᵢ/N)"
    },
    
    # Additional metadata
    "output_range": {
        "min": 0.0,
        "max": 1.0,
        "description": "0 = all pixels in one class; approaches 1 = evenly distributed"
    },
    "algorithm": "Gini-Simpson Index using all semantic classes",
    "note": "Lower values = higher similarity/uniformity; Higher values = lower similarity/more diversity"
}

print(f"\n✅ Calculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f"   Formula: {INDICATOR['formula']}")
print(f"   Algorithm: {INDICATOR['algorithm']}")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str, semantic_colors: Dict[str, Tuple[int, int, int]] = None) -> Dict:
    """
    Calculate the Similarity (SIM) indicator using Gini-Simpson Index.
    
    TYPE B - Custom Mathematical Formula
    
    Formula:
        SIM = 1 - Σ[nᵢ × (nᵢ - 1)] / [N × (N - 1)]
        
    Where:
        - nᵢ = Number of pixels in category i
        - N = Total number of pixels
    
    Args:
        image_path: Path to the semantic segmentation mask image
        semantic_colors: Optional dictionary mapping class names to RGB tuples.
                        If not provided, unique colors in image are used.
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): Similarity index (0 to ~1)
            - 'simpson_index' (float): Original Simpson's concentration index
            - 'n_classes' (int): Number of classes detected
            - 'dominance' (float): Proportion of largest class
            - 'class_distribution' (dict): Pixel count per class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"Similarity Index: {result['value']:.3f}")
        ...     print(f"Simpson Index: {result['simpson_index']:.3f}")
    """
    try:
        # Step 1: Load and prepare the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        N = total_pixels  # Total count
        
        # Step 2: Count pixels for each semantic class
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
            pixels_flat = pixels.reshape(-1, 3)
            unique_colors, counts = np.unique(pixels_flat, axis=0, return_counts=True)
            
            for i, (color, count) in enumerate(zip(unique_colors, counts)):
                class_name = f"class_{i:03d}_rgb({color[0]},{color[1]},{color[2]})"
                class_counts[class_name] = int(count)
        
        # Handle edge cases
        n_classes = len(class_counts)
        
        if n_classes == 0:
            return {
                'success': True,
                'value': 0.0,
                'simpson_index': 1.0,
                'gini_simpson': 0.0,
                'n_classes': 0,
                'dominance': 1.0,
                'total_pixels': int(total_pixels),
                'note': 'No valid pixels found'
            }
        
        if n_classes == 1:
            return {
                'success': True,
                'value': 0.0,  # Perfect similarity (all same class)
                'simpson_index': 1.0,
                'gini_simpson': 0.0,
                'n_classes': 1,
                'dominance': 1.0,
                'total_pixels': int(total_pixels),
                'class_distribution': class_counts,
                'note': 'Single class - perfect similarity'
            }
        
        # Step 3: Calculate Gini-Simpson Index
        # Formula: SIM = 1 - Σ[nᵢ × (nᵢ - 1)] / [N × (N - 1)]
        
        counts_array = np.array(list(class_counts.values()))
        
        # Calculate Simpson's concentration index: D = Σ[nᵢ × (nᵢ - 1)] / [N × (N - 1)]
        numerator = np.sum(counts_array * (counts_array - 1))
        denominator = N * (N - 1)
        
        if denominator == 0:
            simpson_index = 1.0
        else:
            simpson_index = numerator / denominator
        
        # Gini-Simpson Index (1 - Simpson)
        gini_simpson = 1.0 - simpson_index
        
        # Step 4: Calculate additional metrics
        # Proportions
        proportions = counts_array / N
        
        # Dominance (proportion of largest class)
        dominance = float(np.max(proportions))
        
        # Evenness (how evenly distributed)
        # Max possible Gini-Simpson = 1 - 1/n_classes
        max_gini_simpson = 1.0 - 1.0 / n_classes
        evenness = gini_simpson / max_gini_simpson if max_gini_simpson > 0 else 0
        
        # Sort classes by count for reporting
        sorted_classes = sorted(class_counts.items(), key=lambda x: x[1], reverse=True)
        top_classes = dict(sorted_classes[:5])  # Top 5 classes
        
        # Step 5: Return results
        return {
            'success': True,
            'value': round(gini_simpson, 3),
            'simpson_index': round(simpson_index, 3),
            'gini_simpson': round(gini_simpson, 3),
            'n_classes': n_classes,
            'dominance': round(dominance, 3),
            'evenness': round(evenness, 3),
            'max_gini_simpson': round(max_gini_simpson, 3),
            'total_pixels': int(total_pixels),
            'class_distribution': class_counts,
            'top_classes': top_classes
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
def interpret_similarity(sim: float, n_classes: int = None) -> str:
    """
    Interpret the similarity index value.
    
    Note: This is actually the Gini-Simpson index, so:
    - Low values = high similarity (concentrated in few classes)
    - High values = low similarity (evenly distributed)
    
    Args:
        sim: Similarity index value (0 to ~1)
        n_classes: Number of classes (optional, for context)
        
    Returns:
        str: Qualitative interpretation
    """
    if sim is None:
        return "Unable to interpret (no data)"
    elif sim < 0.2:
        return "Very high similarity: highly uniform, dominated by few classes"
    elif sim < 0.4:
        return "High similarity: concentrated distribution"
    elif sim < 0.6:
        return "Moderate similarity: mixed distribution"
    elif sim < 0.8:
        return "Low similarity: diverse distribution"
    else:
        return "Very low similarity: highly diverse, evenly distributed"


def calculate_theoretical_max(n_classes: int) -> float:
    """
    Calculate the theoretical maximum Gini-Simpson index for n classes.
    
    For n equally distributed classes:
    Max = 1 - n × (1/n)² = 1 - 1/n
    
    Args:
        n_classes: Number of classes
        
    Returns:
        float: Theoretical maximum Gini-Simpson index
    """
    if n_classes <= 1:
        return 0.0
    return 1.0 - 1.0 / n_classes


def explain_similarity_index() -> str:
    """
    Provide educational explanation of the Similarity (Gini-Simpson) Index.
    
    Returns:
        str: Explanation text
    """
    return """
    Similarity Index (Gini-Simpson):
    
    Formula: SIM = 1 - Σ[nᵢ × (nᵢ - 1)] / [N × (N - 1)]
    
    Interpretation:
    • Measures the probability that two randomly selected pixels 
      belong to DIFFERENT categories
    • Range: 0 to 1
    • 0 = All pixels in one class (maximum similarity/uniformity)
    • Approaches 1 = Evenly distributed (minimum similarity)
    
    Relationship to Simpson's Index:
    • Simpson's Index (D) = probability of same category
    • Gini-Simpson = 1 - D = probability of different category
    
    In urban scenes:
    • Low values: Uniform areas (e.g., large parking lots, walls)
    • High values: Diverse areas (e.g., mixed streetscapes)
    """


# =============================================================================
# STANDALONE TEST (Optional)
# =============================================================================
if __name__ == "__main__":
    import os
    
    print("\n🧪 Testing Similarity Index calculator...")
    
    # Test 1: Single class (expected: 0.0)
    test_img_1 = np.ones((100, 100, 3), dtype=np.uint8) * 128
    
    test_path_1 = '/tmp/test_sim_1.png'
    Image.fromarray(test_img_1).save(test_path_1)
    
    result_1 = calculate_indicator(test_path_1)
    
    print(f"\n   Test 1: Single uniform color")
    print(f"      Expected: 0.000 (perfect similarity)")
    print(f"      Calculated: {result_1.get('value', 'N/A')}")
    print(f"      Simpson Index: {result_1.get('simpson_index', 'N/A')}")
    print(f"      Classes: {result_1.get('n_classes', 'N/A')}")
    
    os.remove(test_path_1)
    
    # Test 2: Two equal classes (expected: ~0.5)
    test_img_2 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_2[:50, :] = [255, 0, 0]    # Red - top half
    test_img_2[50:, :] = [0, 255, 0]    # Green - bottom half
    
    test_path_2 = '/tmp/test_sim_2.png'
    Image.fromarray(test_img_2).save(test_path_2)
    
    result_2 = calculate_indicator(test_path_2)
    
    print(f"\n   Test 2: Two equal classes (50/50)")
    print(f"      Expected: ~0.500")
    print(f"      Calculated: {result_2.get('value', 'N/A')}")
    print(f"      Theoretical Max: {calculate_theoretical_max(2):.3f}")
    print(f"      Evenness: {result_2.get('evenness', 'N/A')}")
    
    os.remove(test_path_2)
    
    # Test 3: Four equal classes (expected: ~0.75)
    test_img_3 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_3[:50, :50] = [255, 0, 0]     # Red - top-left
    test_img_3[:50, 50:] = [0, 255, 0]     # Green - top-right
    test_img_3[50:, :50] = [0, 0, 255]     # Blue - bottom-left
    test_img_3[50:, 50:] = [255, 255, 0]   # Yellow - bottom-right
    
    test_path_3 = '/tmp/test_sim_3.png'
    Image.fromarray(test_img_3).save(test_path_3)
    
    result_3 = calculate_indicator(test_path_3)
    
    print(f"\n   Test 3: Four equal classes (25/25/25/25)")
    print(f"      Expected: ~0.750")
    print(f"      Calculated: {result_3.get('value', 'N/A')}")
    print(f"      Theoretical Max: {calculate_theoretical_max(4):.3f}")
    print(f"      Evenness: {result_3.get('evenness', 'N/A')}")
    
    os.remove(test_path_3)
    
    # Test 4: Unequal distribution (90%/10%)
    test_img_4 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_4[:90, :] = [255, 0, 0]    # Red - 90%
    test_img_4[90:, :] = [0, 255, 0]    # Green - 10%
    
    test_path_4 = '/tmp/test_sim_4.png'
    Image.fromarray(test_img_4).save(test_path_4)
    
    result_4 = calculate_indicator(test_path_4)
    
    print(f"\n   Test 4: Unequal classes (90/10)")
    print(f"      Expected: ~0.18 (high similarity)")
    print(f"      Calculated: {result_4.get('value', 'N/A')}")
    print(f"      Dominance: {result_4.get('dominance', 'N/A')}")
    print(f"      Interpretation: {interpret_similarity(result_4.get('value'))}")
    
    os.remove(test_path_4)
    
    print("\n   🧹 Test cleanup complete")
