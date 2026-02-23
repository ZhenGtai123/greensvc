"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_SVF_DEC
Indicator Name: Sky View Factor Decrease
Type: TYPE D (Derived Ratio)

Description:
    The Sky View Factor Decrease (SVF_DEC) measures the reduction in 
    Sky View Factor specifically attributed to vegetation/trees. It 
    quantifies how much the tree canopy reduces sky visibility compared 
    to a scenario with only buildings (no vegetation).
    
Formula: 
    SVF_DEC = SVFS - SVFP
    
    Where:
    SVFS (Simulation-based SVF) = Sky / (Sky + Building)  [without trees]
    SVFP (Photographic SVF) = Sky / (Sky + Building + Tree)  [with trees]
    
    Simplified:
    SVF_DEC = Sky/(Sky+Building) - Sky/(Sky+Building+Tree)
    
Variables:
    - SVFS: Simulation-based Sky View Factor (hypothetical, without vegetation)
    - SVFP: Photographic Sky View Factor (actual, with vegetation)
    - Sky_Pixels: Number of pixels classified as sky
    - Building_Pixels: Number of pixels classified as building
    - Tree_Pixels: Number of pixels classified as tree/vegetation

Unit: ratio (0 to 1)
Range: 0.0 (no SVF decrease from trees) to <1.0 (significant decrease)
"""

import numpy as np
from PIL import Image
from typing import Dict, List, Tuple


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_SVF_DEC",
    "name": "Sky View Factor Decrease",
    "unit": "ratio",
    "formula": "SVF_DEC = SVFS - SVFP",
    "formula_description": "Reduction in SVF specifically attributed to vegetation/trees",
    "target_direction": "CONTEXT",  # Depends on design intent
    "definition": "The reduction in SVF specifically attributed to vegetation/trees",
    "category": "CAT_CFG",
    
    # TYPE D Configuration
    "calc_type": "derived",  # Derived from comparing two SVF calculations
    
    # Variables
    "variables": {
        "SVFS": "Simulation-based Sky View Factor (without vegetation)",
        "SVFP": "Photographic Sky View Factor (with vegetation)",
        "Sky_Pixels": "Number of pixels classified as sky",
        "Building_Pixels": "Number of pixels classified as building",
        "Tree_Pixels": "Number of pixels classified as tree/vegetation"
    },
    
    # Additional metadata
    "output_range": {
        "min": 0.0,
        "max": "<1.0",
        "description": "0 = no SVF decrease from trees; higher = more decrease"
    },
    "algorithm": "Derived ratio: SVF(no trees) - SVF(with trees)",
    "note": "Higher values indicate trees significantly reduce sky visibility"
}

print(f"\n✅ Calculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f"   Formula: {INDICATOR['formula']}")
print(f"   Type: TYPE D (Derived Ratio)")


# =============================================================================
# CLASS IDENTIFICATION
# =============================================================================
# Keywords to identify sky classes
SKY_KEYWORDS = [
    "sky", "cloud", "clouds"
]

# Keywords to identify building classes
BUILDING_KEYWORDS = [
    "building", "edifice",
    "house", "home", "residence",
    "skyscraper", "tower",
    "apartment", "flat",
    "office", "commercial",
    "facade", "wall",
    "architecture", "structure"
]

# Keywords to identify tree/vegetation classes
TREE_KEYWORDS = [
    "tree", "trees",
    "vegetation", "plant", "plants",
    "foliage", "leaf", "leaves",
    "canopy", "crown",
    "bush", "shrub",
    "greenery", "flora"
]


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


def is_building_class(class_name: str) -> bool:
    """
    Check if a class name represents a building structure.
    
    Args:
        class_name: Name of the semantic class
        
    Returns:
        bool: True if class is building related
    """
    class_lower = class_name.lower().replace("-", " ").replace("_", " ")
    return any(kw in class_lower for kw in BUILDING_KEYWORDS)


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


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str, 
                        semantic_colors: Dict[str, Tuple[int, int, int]] = None) -> Dict:
    """
    Calculate the Sky View Factor Decrease (SVF_DEC) indicator.
    
    TYPE D - Derived Ratio
    
    Formula:
        SVF_DEC = SVFS - SVFP
        
        Where:
        SVFS = Sky / (Sky + Building)  [Simulation-based, without trees]
        SVFP = Sky / (Sky + Building + Tree)  [Photographic, with trees]
    
    Args:
        image_path: Path to the semantic segmentation mask image
        semantic_colors: Dictionary mapping class names to RGB tuples.
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): SVF_DEC ratio (0 to 1)
            - 'svfs' (float): Simulation-based SVF (without trees)
            - 'svfp' (float): Photographic SVF (with trees)
            - 'sky_pixels' (int): Total sky pixels
            - 'building_pixels' (int): Total building pixels
            - 'tree_pixels' (int): Total tree pixels
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"SVF_DEC: {result['value']:.4f}")
        ...     print(f"SVFS: {result['svfs']:.4f}, SVFP: {result['svfp']:.4f}")
    """
    try:
        # Step 1: Load and prepare the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Step 2: Create masks for sky, buildings, and trees
        sky_mask = np.zeros((h, w), dtype=np.uint8)
        building_mask = np.zeros((h, w), dtype=np.uint8)
        tree_mask = np.zeros((h, w), dtype=np.uint8)
        
        sky_classes_found = {}
        building_classes_found = {}
        tree_classes_found = {}
        
        if semantic_colors:
            # Use provided semantic color configuration
            for class_name, rgb in semantic_colors.items():
                mask = np.all(pixels == rgb, axis=2)
                count = int(np.sum(mask))
                
                if count > 0:
                    if is_sky_class(class_name):
                        sky_mask[mask] = 1
                        sky_classes_found[class_name] = count
                    elif is_building_class(class_name):
                        building_mask[mask] = 1
                        building_classes_found[class_name] = count
                    elif is_tree_class(class_name):
                        tree_mask[mask] = 1
                        tree_classes_found[class_name] = count
        
        # Step 3: Calculate pixel counts
        sky_pixels = int(np.sum(sky_mask > 0))
        building_pixels = int(np.sum(building_mask > 0))
        tree_pixels = int(np.sum(tree_mask > 0))
        
        # Step 4: Calculate SVF values
        # SVFS = Sky / (Sky + Building)  [Simulation - without trees]
        # SVFP = Sky / (Sky + Building + Tree)  [Photographic - with trees]
        
        # Denominator for SVFS (simulation, no trees)
        denom_svfs = sky_pixels + building_pixels
        # Denominator for SVFP (photographic, with trees)
        denom_svfp = sky_pixels + building_pixels + tree_pixels
        
        if denom_svfs > 0:
            svfs = sky_pixels / denom_svfs
        else:
            svfs = 1.0  # If no buildings, full sky view
        
        if denom_svfp > 0:
            svfp = sky_pixels / denom_svfp
        else:
            svfp = 1.0  # If nothing visible, assume full sky view
        
        # Step 5: Calculate SVF Decrease
        # SVF_DEC = SVFS - SVFP
        svf_dec = svfs - svfp
        
        # Ensure non-negative (should always be >= 0 mathematically)
        svf_dec = max(0.0, svf_dec)
        
        # Step 6: Calculate additional metrics
        sky_pct = (sky_pixels / total_pixels * 100) if total_pixels > 0 else 0
        building_pct = (building_pixels / total_pixels * 100) if total_pixels > 0 else 0
        tree_pct = (tree_pixels / total_pixels * 100) if total_pixels > 0 else 0
        
        # Percent of SVF lost due to trees
        svf_decrease_pct = svf_dec * 100
        # Relative decrease (percentage of original SVFS lost)
        relative_decrease = (svf_dec / svfs * 100) if svfs > 0 else 0
        
        # Sort classes by pixel count
        sorted_tree = dict(sorted(tree_classes_found.items(), key=lambda x: x[1], reverse=True))
        
        # Step 7: Return results
        return {
            'success': True,
            'value': round(svf_dec, 4),
            'svfs': round(svfs, 4),
            'svfp': round(svfp, 4),
            'sky_pixels': sky_pixels,
            'building_pixels': building_pixels,
            'tree_pixels': tree_pixels,
            'total_pixels': int(total_pixels),
            'sky_pct': round(sky_pct, 2),
            'building_pct': round(building_pct, 2),
            'tree_pct': round(tree_pct, 2),
            'svf_decrease_pct': round(svf_decrease_pct, 2),
            'relative_decrease_pct': round(relative_decrease, 2),
            'n_tree_classes': len(tree_classes_found),
            'tree_classes_found': sorted_tree,
            'sky_classes_found': sky_classes_found,
            'building_classes_found': building_classes_found
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
def interpret_svf_dec(svf_dec: float) -> str:
    """
    Interpret the Sky View Factor Decrease value.
    
    Args:
        svf_dec: SVF_DEC ratio (0 to 1)
        
    Returns:
        str: Qualitative interpretation
    """
    if svf_dec is None:
        return "Unable to interpret (no data)"
    elif svf_dec < 0.01:
        return "Negligible: trees have minimal impact on SVF"
    elif svf_dec < 0.05:
        return "Minor decrease: light tree impact"
    elif svf_dec < 0.15:
        return "Moderate decrease: noticeable tree canopy effect"
    elif svf_dec < 0.30:
        return "Significant decrease: substantial tree canopy"
    elif svf_dec < 0.50:
        return "High decrease: dense tree canopy"
    else:
        return "Very high decrease: trees dominate sky obstruction"


def explain_formula() -> str:
    """
    Provide educational explanation of the SVF_DEC formula.
    
    Returns:
        str: Explanation text
    """
    return """
    Sky View Factor Decrease (SVF_DEC) Formula:
    
    SVF_DEC = SVFS - SVFP
    
    Where:
        SVFS = Sky / (Sky + Building)      [Simulation-based, without trees]
        SVFP = Sky / (Sky + Building + Tree)  [Photographic, with trees]
    
    This formula measures:
    - The difference between SVF if there were no trees vs actual SVF
    - Quantifies how much trees reduce sky visibility
    - Isolates the vegetation contribution to sky obstruction
    
    Mathematical Understanding:
        Let S = Sky, B = Building, T = Tree
        
        SVFS = S / (S + B)       [hypothetical - no trees]
        SVFP = S / (S + B + T)   [actual - with trees]
        
        SVF_DEC = S/(S+B) - S/(S+B+T)
                = S * T / [(S+B) * (S+B+T)]  [after algebra]
    
    Interpretation:
    - SVF_DEC = 0: Trees have no impact (either no trees or no buildings)
    - SVF_DEC > 0: Trees reduce SVF beyond building obstruction
    - Higher SVF_DEC = More sky view lost to tree canopy
    
    Special Cases:
    - No trees (T=0): SVF_DEC = 0 (SVFS = SVFP)
    - No buildings (B=0): SVF_DEC = T/(S+T) (tree enclosure in open space)
    - Dense trees: SVF_DEC approaches SVFS (trees block remaining sky)
    
    Urban Planning Relevance:
    - High SVF_DEC: Dense urban forest, good shade but reduced daylight
    - Low SVF_DEC: Sparse vegetation, minimal canopy impact
    - Helps distinguish tree vs building contributions to enclosure
    
    Relationship with other indicators:
    - Related to IND_ENC_TRE (tree enclosure)
    - Complementary to IND_ENC_BLD (building enclosure)
    - Provides the "delta" perspective on vegetation impact
    """


# =============================================================================
# STANDALONE TEST (Optional)
# =============================================================================
if __name__ == "__main__":
    import os
    
    print("\n🧪 Testing Sky View Factor Decrease calculator...")
    
    # Test 1: Only sky (no trees, no buildings)
    test_img_1 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_1[:, :] = [135, 206, 235]  # Sky blue
    
    test_path_1 = '/tmp/test_svf_dec_1.png'
    Image.fromarray(test_img_1).save(test_path_1)
    
    test_semantic = {
        "sky": (135, 206, 235), 
        "building": (128, 64, 64),
        "tree": (34, 139, 34)
    }
    result_1 = calculate_indicator(test_path_1, test_semantic)
    
    print(f"\n   Test 1: 100% sky, 0% building, 0% tree")
    print(f"      Expected SVF_DEC: 0.0000 (no trees to reduce SVF)")
    print(f"      Calculated SVF_DEC: {result_1.get('value', 'N/A')}")
    print(f"      SVFS: {result_1.get('svfs', 'N/A')}, SVFP: {result_1.get('svfp', 'N/A')}")
    print(f"      Interpretation: {interpret_svf_dec(result_1.get('value'))}")
    
    os.remove(test_path_1)
    
    # Test 2: Sky and buildings only (no trees)
    test_img_2 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_2[:50, :] = [135, 206, 235]  # Sky (50%)
    test_img_2[50:, :] = [128, 64, 64]    # Building (50%)
    
    test_path_2 = '/tmp/test_svf_dec_2.png'
    Image.fromarray(test_img_2).save(test_path_2)
    
    result_2 = calculate_indicator(test_path_2, test_semantic)
    
    print(f"\n   Test 2: 50% sky, 50% building, 0% tree")
    print(f"      Expected SVF_DEC: 0.0000 (no trees)")
    print(f"      Calculated SVF_DEC: {result_2.get('value', 'N/A')}")
    print(f"      SVFS: {result_2.get('svfs', 'N/A')}, SVFP: {result_2.get('svfp', 'N/A')}")
    print(f"      Interpretation: {interpret_svf_dec(result_2.get('value'))}")
    
    os.remove(test_path_2)
    
    # Test 3: Sky and trees only (no buildings)
    test_img_3 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_3[:50, :] = [135, 206, 235]  # Sky (50%)
    test_img_3[50:, :] = [34, 139, 34]    # Tree (50%)
    
    test_path_3 = '/tmp/test_svf_dec_3.png'
    Image.fromarray(test_img_3).save(test_path_3)
    
    result_3 = calculate_indicator(test_path_3, test_semantic)
    
    print(f"\n   Test 3: 50% sky, 0% building, 50% tree")
    print(f"      Expected SVF_DEC: 0.5000 (SVFS=1.0, SVFP=0.5)")
    print(f"      Calculated SVF_DEC: {result_3.get('value', 'N/A')}")
    print(f"      SVFS: {result_3.get('svfs', 'N/A')}, SVFP: {result_3.get('svfp', 'N/A')}")
    print(f"      Interpretation: {interpret_svf_dec(result_3.get('value'))}")
    
    os.remove(test_path_3)
    
    # Test 4: Sky, buildings, and trees
    test_img_4 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_4[:40, :] = [135, 206, 235]  # Sky (40%)
    test_img_4[40:70, :] = [128, 64, 64]  # Building (30%)
    test_img_4[70:, :] = [34, 139, 34]    # Tree (30%)
    
    test_path_4 = '/tmp/test_svf_dec_4.png'
    Image.fromarray(test_img_4).save(test_path_4)
    
    result_4 = calculate_indicator(test_path_4, test_semantic)
    
    # SVFS = 40/(40+30) = 40/70 = 0.5714
    # SVFP = 40/(40+30+30) = 40/100 = 0.4
    # SVF_DEC = 0.5714 - 0.4 = 0.1714
    
    print(f"\n   Test 4: 40% sky, 30% building, 30% tree")
    print(f"      Expected SVF_DEC: ~0.1714")
    print(f"      Calculated SVF_DEC: {result_4.get('value', 'N/A')}")
    print(f"      SVFS: {result_4.get('svfs', 'N/A')}, SVFP: {result_4.get('svfp', 'N/A')}")
    print(f"      Relative decrease: {result_4.get('relative_decrease_pct', 'N/A')}%")
    print(f"      Interpretation: {interpret_svf_dec(result_4.get('value'))}")
    
    os.remove(test_path_4)
    
    # Test 5: Dense trees with buildings
    test_img_5 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_5[:20, :] = [135, 206, 235]  # Sky (20%)
    test_img_5[20:40, :] = [128, 64, 64]  # Building (20%)
    test_img_5[40:, :] = [34, 139, 34]    # Tree (60%)
    
    test_path_5 = '/tmp/test_svf_dec_5.png'
    Image.fromarray(test_img_5).save(test_path_5)
    
    result_5 = calculate_indicator(test_path_5, test_semantic)
    
    # SVFS = 20/(20+20) = 20/40 = 0.5
    # SVFP = 20/(20+20+60) = 20/100 = 0.2
    # SVF_DEC = 0.5 - 0.2 = 0.3
    
    print(f"\n   Test 5: 20% sky, 20% building, 60% tree (dense canopy)")
    print(f"      Expected SVF_DEC: 0.3000")
    print(f"      Calculated SVF_DEC: {result_5.get('value', 'N/A')}")
    print(f"      SVFS: {result_5.get('svfs', 'N/A')}, SVFP: {result_5.get('svfp', 'N/A')}")
    print(f"      Relative decrease: {result_5.get('relative_decrease_pct', 'N/A')}%")
    print(f"      Interpretation: {interpret_svf_dec(result_5.get('value'))}")
    
    os.remove(test_path_5)
    
    print("\n   ✅ Test complete!")
    print("\n   📊 Key Relationships:")
    print("      SVF_DEC = SVFS - SVFP")
    print("      SVFS = Sky / (Sky + Building)  [without trees]")
    print("      SVFP = Sky / (Sky + Building + Tree)  [with trees]")
    print("      Higher SVF_DEC = Trees have greater impact on sky visibility")
