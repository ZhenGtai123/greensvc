"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_TSV
Indicator Name: Tree-Sky View Factor
Type: TYPE C (Component Ratio)

Description:
    The Tree-Sky View Factor (TSV) measures the ratio of plants/trees to 
    the sky in vertical space as seen from a street view image. This 
    indicator reflects the balance between vegetation coverage and open 
    sky visibility, providing insights into urban canopy density and 
    vertical green space distribution.
    
Formula: 
    TSV = Area_tree / Area_sky
    
Variables:
    - Area_tree: Total pixels occupied by tree/vegetation elements
    - Area_sky: Total pixels occupied by sky elements

Unit: ratio (unbounded, typically 0 to >10)
Range: 
    - 0.0: No trees (only sky or no sky)
    - 1.0: Equal tree and sky coverage
    - >1.0: More trees than sky
    - Undefined: When sky = 0 (returns special value)
"""

import numpy as np
from PIL import Image
from typing import Dict, List, Tuple


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_TSV",
    "name": "Tree-Sky View Factor",
    "unit": "ratio",
    "formula": "TSV = Area_tree / Area_sky",
    "formula_description": "Ratio of tree/vegetation pixels to sky pixels",
    "target_direction": "CONTEXT",  # Optimal value depends on context
    "definition": "The ratio of plants to the sky in vertical space as seen from a street view image",
    "category": "CAT_CMP",
    
    # TYPE C Configuration
    "calc_type": "component_ratio",  # Ratio of two components
    
    # Variables
    "variables": {
        "Area_tree": "Total pixels occupied by tree/vegetation elements",
        "Area_sky": "Total pixels occupied by sky elements",
        "TSV": "Tree-Sky View Factor ratio"
    },
    
    # Additional metadata
    "output_range": {
        "min": 0.0,
        "max": "unbounded",
        "description": "0 = no trees; 1 = equal tree/sky; >1 = trees dominate"
    },
    "algorithm": "Tree pixels / Sky pixels",
    "note": "When sky = 0, returns special value (inf or max_value)"
}

print(f"\n✅ Calculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f"   Formula: {INDICATOR['formula']}")
print(f"   Type: TYPE C (Component Ratio)")


# =============================================================================
# CLASS IDENTIFICATION KEYWORDS
# =============================================================================
# Keywords to identify tree/vegetation classes
TREE_KEYWORDS = [
    "tree", "trees",
    "vegetation", "plant", "plants",
    "foliage", "leaf", "leaves",
    "bush", "shrub", "hedge",
    "canopy", "greenery",
    "flora"
]

# Keywords to identify sky classes
SKY_KEYWORDS = [
    "sky",
    "cloud", "clouds"
]


def is_tree_class(class_name: str) -> bool:
    """
    Check if a class name represents tree/vegetation.
    
    Args:
        class_name: Name of the semantic class
        
    Returns:
        bool: True if class is tree/vegetation related
    """
    class_lower = class_name.lower().replace("-", " ").replace("_", " ")
    return any(kw in class_lower for kw in TREE_KEYWORDS)


def is_sky_class(class_name: str) -> bool:
    """
    Check if a class name represents sky.
    
    Args:
        class_name: Name of the semantic class
        
    Returns:
        bool: True if class is sky related
    """
    class_lower = class_name.lower().replace("-", " ").replace("_", " ")
    return any(kw in class_lower for kw in SKY_KEYWORDS)


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str, 
                        semantic_colors: Dict[str, Tuple[int, int, int]] = None,
                        max_value: float = 999.0) -> Dict:
    """
    Calculate the Tree-Sky View Factor (TSV) indicator.
    
    TYPE C - Component Ratio
    
    Formula:
        TSV = Area_tree / Area_sky
        
    When sky pixels = 0, returns max_value to indicate trees dominate completely.
    
    Args:
        image_path: Path to the semantic segmentation mask image
        semantic_colors: Dictionary mapping class names to RGB tuples.
        max_value: Value to return when sky = 0 (default: 999.0)
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): TSV ratio
            - 'tree_pixels' (int): Total tree/vegetation pixels
            - 'sky_pixels' (int): Total sky pixels
            - 'tree_pct' (float): Tree coverage percentage
            - 'sky_pct' (float): Sky coverage percentage
            - 'tree_classes_found' (dict): Pixel counts by tree class
            - 'sky_classes_found' (dict): Pixel counts by sky class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"TSV: {result['value']:.3f}")
        ...     print(f"Tree: {result['tree_pct']:.1f}%, Sky: {result['sky_pct']:.1f}%")
    """
    try:
        # Step 1: Load and prepare the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Step 2: Create masks for tree and sky
        tree_mask = np.zeros((h, w), dtype=np.uint8)
        sky_mask = np.zeros((h, w), dtype=np.uint8)
        tree_classes_found = {}
        sky_classes_found = {}
        
        if semantic_colors:
            # Use provided semantic color configuration
            for class_name, rgb in semantic_colors.items():
                mask = np.all(pixels == rgb, axis=2)
                count = int(np.sum(mask))
                
                if count > 0:
                    if is_tree_class(class_name):
                        tree_mask[mask] = 1
                        tree_classes_found[class_name] = count
                    elif is_sky_class(class_name):
                        sky_mask[mask] = 1
                        sky_classes_found[class_name] = count
        else:
            # Fallback: try to detect by common colors (heuristic)
            r, g, b = pixels[:,:,0], pixels[:,:,1], pixels[:,:,2]
            
            # Green-ish colors for vegetation
            green_like = (g > r) & (g > b) & (g > 50)
            tree_mask[green_like] = 1
            if np.sum(green_like) > 0:
                tree_classes_found['detected_vegetation'] = int(np.sum(green_like))
            
            # Blue-ish colors for sky
            sky_like = (b > 150) & (b > r) & ((r + g + b) > 300)
            sky_mask[sky_like] = 1
            if np.sum(sky_like) > 0:
                sky_classes_found['detected_sky'] = int(np.sum(sky_like))
        
        # Step 3: Calculate pixel counts
        tree_pixels = int(np.sum(tree_mask > 0))
        sky_pixels = int(np.sum(sky_mask > 0))
        
        # Step 4: Calculate TSV ratio
        if sky_pixels > 0:
            tsv = tree_pixels / sky_pixels
        else:
            # No sky visible - return max_value if trees exist, else 0
            tsv = max_value if tree_pixels > 0 else 0.0
        
        # Step 5: Calculate percentages
        tree_pct = (tree_pixels / total_pixels) * 100 if total_pixels > 0 else 0
        sky_pct = (sky_pixels / total_pixels) * 100 if total_pixels > 0 else 0
        
        # Step 6: Return results
        return {
            'success': True,
            'value': round(tsv, 3),
            'tree_pixels': tree_pixels,
            'sky_pixels': sky_pixels,
            'total_pixels': int(total_pixels),
            'tree_pct': round(tree_pct, 2),
            'sky_pct': round(sky_pct, 2),
            'n_tree_classes': len(tree_classes_found),
            'n_sky_classes': len(sky_classes_found),
            'tree_classes_found': dict(sorted(tree_classes_found.items(), key=lambda x: x[1], reverse=True)),
            'sky_classes_found': dict(sorted(sky_classes_found.items(), key=lambda x: x[1], reverse=True)),
            'sky_is_zero': sky_pixels == 0
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
def interpret_tsv(tsv: float) -> str:
    """
    Interpret the Tree-Sky View Factor value.
    
    Args:
        tsv: TSV ratio
        
    Returns:
        str: Qualitative interpretation
    """
    if tsv is None:
        return "Unable to interpret (no data)"
    elif tsv == 0:
        return "No tree coverage: open sky or no sky/trees"
    elif tsv < 0.2:
        return "Very low tree-to-sky ratio: sky dominates"
    elif tsv < 0.5:
        return "Low tree-to-sky ratio: more sky than trees"
    elif tsv < 1.0:
        return "Moderate tree-to-sky ratio: approaching balance"
    elif tsv == 1.0:
        return "Balanced: equal tree and sky coverage"
    elif tsv < 2.0:
        return "Elevated tree-to-sky ratio: trees exceed sky"
    elif tsv < 5.0:
        return "High tree-to-sky ratio: trees dominate"
    elif tsv < 100:
        return "Very high tree-to-sky ratio: dense canopy"
    else:
        return "Extreme tree coverage: minimal or no sky visible"


def explain_formula() -> str:
    """
    Provide educational explanation of the TSV formula.
    
    Returns:
        str: Explanation text
    """
    return """
    Tree-Sky View Factor (TSV) Formula:
    
    TSV = Area_tree / Area_sky
    
    Where:
    - Area_tree = Total pixels of tree/vegetation elements
    - Area_sky = Total pixels of sky elements
    
    Interpretation:
    - TSV = 0: No tree coverage (only sky visible, or neither)
    - TSV < 1: More sky than trees (open canopy)
    - TSV = 1: Equal tree and sky coverage (balanced)
    - TSV > 1: More trees than sky (dense canopy)
    - TSV → ∞: No sky visible (complete canopy closure)
    
    Reference values:
    - Open plaza: TSV ≈ 0.1-0.3 (mostly sky)
    - Suburban street: TSV ≈ 0.5-1.0 (balanced)
    - Tree-lined avenue: TSV ≈ 1.0-3.0 (trees dominate)
    - Dense forest path: TSV ≈ 5.0-50+ (minimal sky)
    
    Note: When sky = 0, returns max_value (999.0) to indicate
    complete canopy closure. When both are 0, returns 0.
    
    This indicator complements:
    - IND_GVI: Green View Index (tree/total)
    - IND_SVF: Sky View Factor (sky/total)
    - TSV combines both: (tree/total) / (sky/total) = tree/sky
    """


# =============================================================================
# STANDALONE TEST (Optional)
# =============================================================================
if __name__ == "__main__":
    import os
    
    print("\n🧪 Testing Tree-Sky View Factor calculator...")
    
    # Test 1: Only sky (no trees)
    test_img_1 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_1[:, :] = [135, 206, 235]  # Sky blue
    
    test_path_1 = '/tmp/test_tsv_1.png'
    Image.fromarray(test_img_1).save(test_path_1)
    
    test_semantic_1 = {"sky": (135, 206, 235)}
    result_1 = calculate_indicator(test_path_1, test_semantic_1)
    
    print(f"\n   Test 1: Only sky (100% sky, 0% tree)")
    print(f"      Expected TSV: 0.000")
    print(f"      Calculated TSV: {result_1.get('value', 'N/A')}")
    print(f"      Interpretation: {interpret_tsv(result_1.get('value'))}")
    
    os.remove(test_path_1)
    
    # Test 2: Only trees (no sky)
    test_img_2 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_2[:, :] = [34, 139, 34]  # Forest green
    
    test_path_2 = '/tmp/test_tsv_2.png'
    Image.fromarray(test_img_2).save(test_path_2)
    
    test_semantic_2 = {"tree": (34, 139, 34), "sky": (135, 206, 235)}
    result_2 = calculate_indicator(test_path_2, test_semantic_2)
    
    print(f"\n   Test 2: Only trees (0% sky, 100% tree)")
    print(f"      Expected TSV: 999.0 (max_value, no sky)")
    print(f"      Calculated TSV: {result_2.get('value', 'N/A')}")
    print(f"      Sky is zero: {result_2.get('sky_is_zero', 'N/A')}")
    print(f"      Interpretation: {interpret_tsv(result_2.get('value'))}")
    
    os.remove(test_path_2)
    
    # Test 3: Equal tree and sky (50/50)
    test_img_3 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_3[:50, :] = [135, 206, 235]  # Sky - top 50%
    test_img_3[50:, :] = [34, 139, 34]    # Tree - bottom 50%
    
    test_path_3 = '/tmp/test_tsv_3.png'
    Image.fromarray(test_img_3).save(test_path_3)
    
    result_3 = calculate_indicator(test_path_3, test_semantic_2)
    
    print(f"\n   Test 3: Equal tree and sky (50% each)")
    print(f"      Expected TSV: 1.000")
    print(f"      Calculated TSV: {result_3.get('value', 'N/A')}")
    print(f"      Tree: {result_3.get('tree_pct', 0):.1f}%, Sky: {result_3.get('sky_pct', 0):.1f}%")
    print(f"      Interpretation: {interpret_tsv(result_3.get('value'))}")
    
    os.remove(test_path_3)
    
    # Test 4: More trees than sky (75% tree, 25% sky)
    test_img_4 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_4[:25, :] = [135, 206, 235]  # Sky - 25%
    test_img_4[25:, :] = [34, 139, 34]    # Tree - 75%
    
    test_path_4 = '/tmp/test_tsv_4.png'
    Image.fromarray(test_img_4).save(test_path_4)
    
    result_4 = calculate_indicator(test_path_4, test_semantic_2)
    
    print(f"\n   Test 4: More trees (75% tree, 25% sky)")
    print(f"      Expected TSV: 3.000 (75/25)")
    print(f"      Calculated TSV: {result_4.get('value', 'N/A')}")
    print(f"      Tree: {result_4.get('tree_pct', 0):.1f}%, Sky: {result_4.get('sky_pct', 0):.1f}%")
    print(f"      Interpretation: {interpret_tsv(result_4.get('value'))}")
    
    os.remove(test_path_4)
    
    # Test 5: More sky than trees (20% tree, 80% sky)
    test_img_5 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_5[:80, :] = [135, 206, 235]  # Sky - 80%
    test_img_5[80:, :] = [34, 139, 34]    # Tree - 20%
    
    test_path_5 = '/tmp/test_tsv_5.png'
    Image.fromarray(test_img_5).save(test_path_5)
    
    result_5 = calculate_indicator(test_path_5, test_semantic_2)
    
    print(f"\n   Test 5: More sky (20% tree, 80% sky)")
    print(f"      Expected TSV: 0.250 (20/80)")
    print(f"      Calculated TSV: {result_5.get('value', 'N/A')}")
    print(f"      Tree: {result_5.get('tree_pct', 0):.1f}%, Sky: {result_5.get('sky_pct', 0):.1f}%")
    print(f"      Interpretation: {interpret_tsv(result_5.get('value'))}")
    
    os.remove(test_path_5)
    
    print("\n   ✅ Test complete!")
    print("\n   📝 Note: TSV = tree_pixels / sky_pixels")
    print("      - TSV < 1: Sky dominates")
    print("      - TSV = 1: Balanced")
    print("      - TSV > 1: Trees dominate")
