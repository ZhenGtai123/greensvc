"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_DIV
Indicator Name: Diversity Index
Type: TYPE B (Custom Mathematical Formula)

Description:
    The Diversity Index (DIV) quantifies the Shannon diversity of visual 
    elements in street-level imagery using the Hill number with q=1. It 
    represents the "effective number of species" or equivalent number of 
    equally-abundant classes that would produce the same entropy.
    
    The Hill number (^1D) is calculated as the exponential of Shannon entropy:
    - ^1D = exp(H) where H = -Σ(pᵢ × ln(pᵢ))
    
    This measure is more intuitive than raw entropy because:
    - It has units of "number of classes"
    - A scene with 5 equally-distributed classes has ^1D ≈ 5
    - It directly represents the "effective" diversity
    
Formula: 
    ^1D = exp(-Σ(pᵢ × ln(pᵢ)))
    
    Equivalent to: ^1D = exp(H) where H is Shannon entropy (natural log)
    
Variables:
    - ^1D: Diversity (Hill number with q=1)
    - pᵢ: Proportion of pixels belonging to semantic category i
    - s: Total number of classes detected
    - i: Index of the specific class/element

Unit: effective number of classes
Range: 1 (single class) to n (n classes uniformly distributed)
"""

import numpy as np
from PIL import Image
from typing import Dict, List, Tuple


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_DIV",
    "name": "Diversity Index",
    "unit": "effective classes",
    "formula": "^1D = exp(-Σ(pᵢ × ln(pᵢ)))",
    "formula_alt": "^1D = exp(H) where H is Shannon entropy",
    "target_direction": "NEUTRAL",  # Diversity has no absolute good/bad
    "definition": "Shannon diversity of visual elements (Hill number q=1)",
    "category": "CAT_CFG",
    
    # TYPE B Configuration
    "calc_type": "custom",  # Custom mathematical formula
    
    # Variables
    "variables": {
        "^1D": "Diversity (exponential of Shannon entropy, Hill number with q=1)",
        "pᵢ": "Proportion of pixels belonging to semantic category i",
        "s": "Total number of classes detected",
        "i": "Index of the specific class/element",
        "H": "Shannon entropy (using natural logarithm)"
    },
    
    # Additional metadata
    "output_range": {
        "min": 1,
        "max": "n (number of detected classes)",
        "description": "1 = single class dominance; n = all n classes equally distributed"
    },
    "note": "Hill number represents 'effective number of classes'; more intuitive than raw entropy"
}

print(f"\n✅ Calculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f"   Formula: {INDICATOR['formula']}")
print(f"   Unit: {INDICATOR['unit']}")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str) -> Dict:
    """
    Calculate the Diversity Index (DIV) using Hill number (q=1).
    
    TYPE B - Custom Mathematical Formula
    
    Algorithm:
    1. Load the semantic segmentation mask image
    2. Count pixels for each semantic class
    3. Calculate probability distribution: pᵢ = count_i / total
    4. Calculate Shannon entropy: H = -Σ(pᵢ × ln(pᵢ))
    5. Calculate Hill number: ^1D = exp(H)
    
    Args:
        image_path: Path to the semantic segmentation mask image
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): Hill number (effective number of classes)
            - 'shannon_entropy' (float): Shannon entropy (natural log)
            - 'n_classes' (int): Number of detected semantic classes
            - 'max_possible_diversity' (float): Theoretical maximum (= n_classes)
            - 'normalized_diversity' (float): Normalized diversity (0-1)
            - 'class_distribution' (dict): Pixel counts by class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"Diversity: {result['value']:.2f} effective classes")
        ...     print(f"Classes detected: {result['n_classes']}")
    """
    try:
        # Step 1: Load and prepare the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        flat_pixels = pixels.reshape(-1, 3)
        
        # Step 2: Count pixels for each semantic class
        class_counts = {}
        
        for class_name, rgb in semantic_colors.items():
            # Create boolean mask for this class
            mask = np.all(flat_pixels == rgb, axis=1)
            count = np.sum(mask)
            if count > 0:
                class_counts[class_name] = int(count)
        
        # Step 3: Calculate probability distribution
        total_counted = sum(class_counts.values())
        
        # Handle edge case: no semantic classes detected
        if total_counted == 0:
            return {
                'success': True,
                'value': 1.0,  # Single "unknown" class
                'shannon_entropy': 0.0,
                'n_classes': 0,
                'max_possible_diversity': 1.0,
                'normalized_diversity': 1.0,
                'total_pixels': int(total_pixels),
                'matched_pixels': 0,
                'unmatched_pixels': int(total_pixels),
                'class_distribution': {},
                'top_classes': {},
                'note': 'No semantic classes detected in image'
            }
        
        # Calculate probability for each class
        probabilities = {}
        for class_name, count in class_counts.items():
            probabilities[class_name] = count / total_counted
        
        # Step 4: Calculate Shannon Entropy (natural log)
        # H = -Σ(pᵢ × ln(pᵢ))
        shannon_entropy = 0.0
        for p in probabilities.values():
            if p > 0:  # Avoid log(0)
                shannon_entropy -= p * np.log(p)  # Natural log
        
        # Step 5: Calculate Hill number (^1D = exp(H))
        hill_number = np.exp(shannon_entropy)
        
        # Step 6: Calculate additional metrics
        n_classes = len(class_counts)
        
        # Maximum possible diversity (uniform distribution = n_classes)
        max_diversity = float(n_classes)
        
        # Normalized diversity (0-1 range)
        normalized_diversity = (hill_number - 1) / (max_diversity - 1) if max_diversity > 1 else 1.0
        
        # Unmatched pixels (e.g., black background)
        unmatched_pixels = total_pixels - total_counted
        
        # Top 5 classes by pixel count
        top_classes = dict(sorted(class_counts.items(), 
                                  key=lambda x: x[1], 
                                  reverse=True)[:5])
        
        # Calculate evenness (how evenly distributed are the classes)
        # Evenness = H / ln(n) = (ln(^1D)) / ln(n)
        evenness = shannon_entropy / np.log(n_classes) if n_classes > 1 else 1.0
        
        # Step 7: Return results
        return {
            'success': True,
            'value': round(hill_number, 3),
            'shannon_entropy': round(shannon_entropy, 3),
            'shannon_entropy_bits': round(shannon_entropy / np.log(2), 3),  # Convert to bits
            'n_classes': n_classes,
            'max_possible_diversity': round(max_diversity, 3),
            'normalized_diversity': round(normalized_diversity, 3),
            'evenness': round(evenness, 3),
            'total_pixels': int(total_pixels),
            'matched_pixels': int(total_counted),
            'unmatched_pixels': int(unmatched_pixels),
            'match_ratio': round(total_counted / total_pixels * 100, 2),
            'class_distribution': class_counts,
            'class_probabilities': {k: round(v, 4) for k, v in probabilities.items()},
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
def interpret_diversity(diversity: float, n_classes: int) -> str:
    """
    Interpret the diversity value and provide a qualitative description.
    
    Args:
        diversity: Calculated Hill number (^1D)
        n_classes: Number of detected semantic classes
        
    Returns:
        str: Qualitative interpretation of the diversity level
    """
    if diversity is None or n_classes is None:
        return "Unable to interpret (no data)"
    
    if n_classes <= 1:
        return "Single class: no diversity"
    
    # Calculate ratio of actual to max diversity
    ratio = diversity / n_classes if n_classes > 0 else 0
    
    if ratio < 0.3:
        return "Low diversity: strongly dominated by few classes"
    elif ratio < 0.5:
        return "Moderate-low diversity: uneven distribution"
    elif ratio < 0.7:
        return "Moderate diversity: reasonably varied"
    elif ratio < 0.85:
        return "High diversity: well-distributed classes"
    else:
        return "Very high diversity: nearly uniform distribution"


def calculate_theoretical_diversity(n_classes: int, distribution: str = 'uniform') -> float:
    """
    Calculate theoretical diversity for given number of classes.
    
    Args:
        n_classes: Number of semantic classes
        distribution: 'uniform' for maximum diversity
        
    Returns:
        float: Theoretical Hill number
    """
    if n_classes <= 1:
        return 1.0
    if distribution == 'uniform':
        return float(n_classes)  # Maximum diversity
    return 1.0


# =============================================================================
# STANDALONE TEST (Optional)
# =============================================================================
if __name__ == "__main__":
    import os
    
    print("\n🧪 Testing Diversity Index (Hill number) calculator...")
    
    # Test 1: Two classes, equal distribution (expected: ^1D = 2.0)
    test_img_1 = np.zeros((100, 100, 3), dtype=np.uint8)
    if 'grass' in semantic_colors and 'sky' in semantic_colors:
        test_img_1[0:50, :] = semantic_colors['grass']
        test_img_1[50:100, :] = semantic_colors['sky']
        
        test_path_1 = '/tmp/test_div_1.png'
        Image.fromarray(test_img_1).save(test_path_1)
        
        result_1 = calculate_indicator(test_path_1)
        
        print(f"\n   Test 1: 50% grass + 50% sky")
        print(f"      Expected diversity: 2.0 (2 equally distributed classes)")
        print(f"      Calculated: {result_1['value']:.3f} effective classes")
        print(f"      Shannon entropy: {result_1['shannon_entropy']:.3f} nats")
        print(f"      Evenness: {result_1['evenness']:.3f}")
        print(f"      Interpretation: {interpret_diversity(result_1['value'], result_1['n_classes'])}")
        
        os.remove(test_path_1)
    
    # Test 2: Four classes, equal distribution (expected: ^1D = 4.0)
    test_img_2 = np.zeros((100, 100, 3), dtype=np.uint8)
    classes_test = ['grass', 'sky', 'building;edifice', 'road;route']
    available_classes = [c for c in classes_test if c in semantic_colors]
    
    if len(available_classes) >= 4:
        test_img_2[0:25, :] = semantic_colors['grass']
        test_img_2[25:50, :] = semantic_colors['sky']
        test_img_2[50:75, :] = semantic_colors['building;edifice']
        test_img_2[75:100, :] = semantic_colors['road;route']
        
        test_path_2 = '/tmp/test_div_2.png'
        Image.fromarray(test_img_2).save(test_path_2)
        
        result_2 = calculate_indicator(test_path_2)
        
        print(f"\n   Test 2: 25% each of 4 classes")
        print(f"      Expected diversity: 4.0 (4 equally distributed classes)")
        print(f"      Calculated: {result_2['value']:.3f} effective classes")
        print(f"      Evenness: {result_2['evenness']:.3f}")
        print(f"      Interpretation: {interpret_diversity(result_2['value'], result_2['n_classes'])}")
        
        os.remove(test_path_2)
    
    # Test 3: Unequal distribution (expected: ^1D < n_classes)
    test_img_3 = np.zeros((100, 100, 3), dtype=np.uint8)
    if 'sky' in semantic_colors and 'tree' in semantic_colors:
        test_img_3[0:90, :] = semantic_colors['sky']    # 90%
        test_img_3[90:100, :] = semantic_colors['tree']  # 10%
        
        test_path_3 = '/tmp/test_div_3.png'
        Image.fromarray(test_img_3).save(test_path_3)
        
        result_3 = calculate_indicator(test_path_3)
        
        print(f"\n   Test 3: 90% sky + 10% tree (unequal)")
        print(f"      Expected diversity: ~1.38 (2 classes, unequal)")
        print(f"      Calculated: {result_3['value']:.3f} effective classes")
        print(f"      Evenness: {result_3['evenness']:.3f}")
        print(f"      Interpretation: {interpret_diversity(result_3['value'], result_3['n_classes'])}")
        
        os.remove(test_path_3)
    
    print("\n   🧹 Test cleanup complete")
