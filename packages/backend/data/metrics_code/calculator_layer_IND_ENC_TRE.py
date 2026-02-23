"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_ENC_TRE
Indicator Name: Enclosure by Trees
Type: TYPE D (Enclosure / Derived Ratio)

Description:
    The Enclosure by Trees (ENC_TRE) measures the proportion of the 
    sky view obstructed specifically by tree canopies. It quantifies 
    the contribution of vegetation to vertical enclosure, separate 
    from building enclosure.
    
Formula: 
    ENC_TRE = (1 - SVF_total) - (1 - SVF_buildings)
    
    Where:
    SVF_total = Sky / (Sky + Building + Tree)
    SVF_buildings = Sky / (Sky + Building)
    
    Simplified:
    ENC_TRE = Tree_Pixels / (Sky_Pixels + Building_Pixels + Tree_Pixels)
    
Variables:
    - Sky_Pixels: Number of pixels classified as sky
    - Building_Pixels: Number of pixels classified as building
    - Tree_Pixels: Number of pixels classified as tree/vegetation
    - SVF_total: Total Sky View Factor
    - SVF_buildings: Sky View Factor considering only buildings

Unit: ratio (0 to 1)
Range: 0.0 (no tree enclosure) to 1.0 (completely enclosed by trees)
"""

import numpy as np
from PIL import Image
from typing import Dict, List, Tuple


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_ENC_TRE",
    "name": "Enclosure by Trees",
    "unit": "ratio",
    "formula": "ENC_TRE = (1 - SVF_total) - (1 - SVF_buildings)",
    "formula_description": "Proportion of sky view obstructed specifically by tree canopies",
    "target_direction": "CONTEXT",  # Depends on design intent
    "definition": "The proportion of the sky view obstructed specifically by tree canopies",
    "category": "CAT_CFG",
    
    # TYPE D Configuration
    "calc_type": "enclosure",  # Derived ratio from sky, building, and tree pixels
    
    # Variables
    "variables": {
        "Sky_Pixels": "Number of pixels classified as sky",
        "Building_Pixels": "Number of pixels classified as building",
        "Tree_Pixels": "Number of pixels classified as tree/vegetation",
        "SVF_total": "Total Sky View Factor (considering all obstructions)",
        "SVF_buildings": "Sky View Factor considering only buildings"
    },
    
    # Additional metadata
    "output_range": {
        "min": 0.0,
        "max": 1.0,
        "description": "0 = no tree enclosure; 1 = completely enclosed by trees"
    },
    "algorithm": "Derived ratio: (1 - SVF_total) - (1 - SVF_buildings) = Tree / (Sky + Building + Tree)",
    "note": "Higher values indicate more tree canopy enclosure in the vertical visual field"
}

print(f"\n✅ Calculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f"   Formula: {INDICATOR['formula']}")
print(f"   Type: TYPE D (Enclosure)")


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
    Calculate the Enclosure by Trees (ENC_TRE) indicator.
    
    TYPE D - Enclosure / Derived Ratio
    
    Formula:
        ENC_TRE = (1 - SVF_total) - (1 - SVF_buildings)
        
        Where:
        SVF_total = Sky / (Sky + Building + Tree)
        SVF_buildings = Sky / (Sky + Building)
        
        Simplified:
        ENC_TRE = Tree / (Sky + Building + Tree)
    
    Args:
        image_path: Path to the semantic segmentation mask image
        semantic_colors: Dictionary mapping class names to RGB tuples.
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): ENC_TRE ratio (0 to 1)
            - 'sky_pixels' (int): Total sky pixels
            - 'building_pixels' (int): Total building pixels
            - 'tree_pixels' (int): Total tree pixels
            - 'svf_total' (float): Total Sky View Factor
            - 'svf_buildings' (float): Sky View Factor for buildings only
            - 'enc_buildings' (float): Building enclosure (for comparison)
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"ENC_TRE: {result['value']:.4f}")
        ...     print(f"SVF_total: {result['svf_total']:.4f}")
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
        
        # Step 4: Calculate SVF and Enclosure values
        # SVF_total = Sky / (Sky + Building + Tree)
        # SVF_buildings = Sky / (Sky + Building)
        # ENC_TRE = (1 - SVF_total) - (1 - SVF_buildings)
        
        # Denominator for total SVF
        denom_total = sky_pixels + building_pixels + tree_pixels
        # Denominator for buildings-only SVF
        denom_buildings = sky_pixels + building_pixels
        
        if denom_total > 0:
            svf_total = sky_pixels / denom_total
        else:
            svf_total = 0.0
        
        if denom_buildings > 0:
            svf_buildings = sky_pixels / denom_buildings
        else:
            svf_buildings = 0.0
        
        # Calculate enclosure values
        enc_total = 1 - svf_total  # Total enclosure
        enc_buildings = 1 - svf_buildings  # Building enclosure only
        
        # ENC_TRE = (1 - SVF_total) - (1 - SVF_buildings)
        # This equals Tree / (Sky + Building + Tree)
        enc_tre = enc_total - enc_buildings
        
        # Alternative direct calculation (should give same result)
        # enc_tre_direct = tree_pixels / denom_total if denom_total > 0 else 0.0
        
        # Step 5: Calculate additional metrics
        sky_pct = (sky_pixels / total_pixels * 100) if total_pixels > 0 else 0
        building_pct = (building_pixels / total_pixels * 100) if total_pixels > 0 else 0
        tree_pct = (tree_pixels / total_pixels * 100) if total_pixels > 0 else 0
        
        # Sort classes by pixel count
        sorted_sky = dict(sorted(sky_classes_found.items(), key=lambda x: x[1], reverse=True))
        sorted_building = dict(sorted(building_classes_found.items(), key=lambda x: x[1], reverse=True))
        sorted_tree = dict(sorted(tree_classes_found.items(), key=lambda x: x[1], reverse=True))
        
        # Step 6: Return results
        return {
            'success': True,
            'value': round(enc_tre, 4),
            'svf_total': round(svf_total, 4),
            'svf_buildings': round(svf_buildings, 4),
            'enc_total': round(enc_total, 4),
            'enc_buildings': round(enc_buildings, 4),
            'sky_pixels': sky_pixels,
            'building_pixels': building_pixels,
            'tree_pixels': tree_pixels,
            'total_pixels': int(total_pixels),
            'vertical_view_pixels': denom_total,
            'sky_pct': round(sky_pct, 2),
            'building_pct': round(building_pct, 2),
            'tree_pct': round(tree_pct, 2),
            'n_sky_classes': len(sky_classes_found),
            'n_building_classes': len(building_classes_found),
            'n_tree_classes': len(tree_classes_found),
            'sky_classes_found': sorted_sky,
            'building_classes_found': sorted_building,
            'tree_classes_found': sorted_tree,
            'enclosure_pct': round(enc_tre * 100, 2)
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
def interpret_enc_tre(enc_tre: float) -> str:
    """
    Interpret the Enclosure by Trees value.
    
    Args:
        enc_tre: ENC_TRE ratio (0 to 1)
        
    Returns:
        str: Qualitative interpretation
    """
    if enc_tre is None:
        return "Unable to interpret (no data)"
    elif enc_tre < 0.05:
        return "Very open: minimal tree enclosure"
    elif enc_tre < 0.15:
        return "Open: low tree canopy presence"
    elif enc_tre < 0.30:
        return "Moderate tree enclosure"
    elif enc_tre < 0.50:
        return "Significant tree canopy enclosure"
    elif enc_tre < 0.70:
        return "High tree enclosure: dense canopy"
    else:
        return "Very high tree enclosure: canopy dominates"


def explain_formula() -> str:
    """
    Provide educational explanation of the ENC_TRE formula.
    
    Returns:
        str: Explanation text
    """
    return """
    Enclosure by Trees (ENC_TRE) Formula:
    
    ENC_TRE = (1 - SVF_total) - (1 - SVF_buildings)
    
    Where:
        SVF_total = Sky / (Sky + Building + Tree)
        SVF_buildings = Sky / (Sky + Building)
    
    Simplified:
        ENC_TRE = Tree / (Sky + Building + Tree)
    
    This formula measures:
    - The contribution of trees to total vertical enclosure
    - The difference between total enclosure and building-only enclosure
    
    Mathematical Derivation:
        Let S = Sky, B = Building, T = Tree
        
        SVF_total = S / (S + B + T)
        SVF_buildings = S / (S + B)
        
        ENC_TRE = (1 - SVF_total) - (1 - SVF_buildings)
                = (B + T)/(S + B + T) - B/(S + B)
                = T / (S + B + T)  [after algebraic simplification]
    
    Interpretation:
    - ENC_TRE = 0: No tree enclosure (open sky or buildings only)
    - ENC_TRE = 0.3: Trees block 30% of vertical view
    - ENC_TRE = 0.5: Trees block half of vertical view
    - ENC_TRE → 1: Trees dominate the vertical enclosure
    
    Relationship with other indicators:
    - ENC_TRE + ENC_BLD + SVF_total = 1.0 (in the vertical view space)
    - ENC_TRE isolates tree contribution from building contribution
    
    Urban Planning Relevance:
    - High ENC_TRE: Dense tree canopy, good shade but may feel enclosed
    - Moderate ENC_TRE: Balanced tree coverage, comfortable streets
    - Low ENC_TRE: Sparse vegetation in vertical view
    """


# =============================================================================
# STANDALONE TEST (Optional)
# =============================================================================
if __name__ == "__main__":
    import os
    
    print("\n🧪 Testing Enclosure by Trees calculator...")
    
    # Test 1: Only sky (no enclosure)
    test_img_1 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_1[:, :] = [135, 206, 235]  # Sky blue
    
    test_path_1 = '/tmp/test_enc_tre_1.png'
    Image.fromarray(test_img_1).save(test_path_1)
    
    test_semantic = {
        "sky": (135, 206, 235), 
        "building": (128, 64, 64),
        "tree": (34, 139, 34)
    }
    result_1 = calculate_indicator(test_path_1, test_semantic)
    
    print(f"\n   Test 1: 100% sky, 0% building, 0% tree")
    print(f"      Expected ENC_TRE: 0.0000")
    print(f"      Calculated ENC_TRE: {result_1.get('value', 'N/A')}")
    print(f"      SVF_total: {result_1.get('svf_total', 'N/A')}")
    print(f"      Interpretation: {interpret_enc_tre(result_1.get('value'))}")
    
    os.remove(test_path_1)
    
    # Test 2: Equal parts sky, building, tree
    test_img_2 = np.zeros((99, 100, 3), dtype=np.uint8)  # 99 rows for even division
    test_img_2[:33, :] = [135, 206, 235]   # Sky (33.3%)
    test_img_2[33:66, :] = [128, 64, 64]   # Building (33.3%)
    test_img_2[66:, :] = [34, 139, 34]     # Tree (33.3%)
    
    test_path_2 = '/tmp/test_enc_tre_2.png'
    Image.fromarray(test_img_2).save(test_path_2)
    
    result_2 = calculate_indicator(test_path_2, test_semantic)
    
    print(f"\n   Test 2: 33.3% sky, 33.3% building, 33.3% tree")
    print(f"      Expected ENC_TRE: ~0.3333")
    print(f"      Calculated ENC_TRE: {result_2.get('value', 'N/A')}")
    print(f"      SVF_total: {result_2.get('svf_total', 'N/A')}")
    print(f"      ENC_buildings: {result_2.get('enc_buildings', 'N/A')}")
    print(f"      Interpretation: {interpret_enc_tre(result_2.get('value'))}")
    
    os.remove(test_path_2)
    
    # Test 3: Sky and trees only (no buildings)
    test_img_3 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_3[:50, :] = [135, 206, 235]  # Sky (50%)
    test_img_3[50:, :] = [34, 139, 34]    # Tree (50%)
    
    test_path_3 = '/tmp/test_enc_tre_3.png'
    Image.fromarray(test_img_3).save(test_path_3)
    
    result_3 = calculate_indicator(test_path_3, test_semantic)
    
    print(f"\n   Test 3: 50% sky, 0% building, 50% tree")
    print(f"      Expected ENC_TRE: 0.5000")
    print(f"      Calculated ENC_TRE: {result_3.get('value', 'N/A')}")
    print(f"      SVF_total: {result_3.get('svf_total', 'N/A')}")
    print(f"      SVF_buildings: {result_3.get('svf_buildings', 'N/A')}")
    print(f"      Interpretation: {interpret_enc_tre(result_3.get('value'))}")
    
    os.remove(test_path_3)
    
    # Test 4: Mostly trees
    test_img_4 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_4[:20, :] = [135, 206, 235]  # Sky (20%)
    test_img_4[20:30, :] = [128, 64, 64]  # Building (10%)
    test_img_4[30:, :] = [34, 139, 34]    # Tree (70%)
    
    test_path_4 = '/tmp/test_enc_tre_4.png'
    Image.fromarray(test_img_4).save(test_path_4)
    
    result_4 = calculate_indicator(test_path_4, test_semantic)
    
    print(f"\n   Test 4: 20% sky, 10% building, 70% tree")
    print(f"      Expected ENC_TRE: 0.7000")
    print(f"      Calculated ENC_TRE: {result_4.get('value', 'N/A')}")
    print(f"      SVF_total: {result_4.get('svf_total', 'N/A')}")
    print(f"      ENC_buildings: {result_4.get('enc_buildings', 'N/A')}")
    print(f"      Interpretation: {interpret_enc_tre(result_4.get('value'))}")
    
    os.remove(test_path_4)
    
    # Test 5: Sky and buildings only (no trees)
    test_img_5 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_5[:50, :] = [135, 206, 235]  # Sky (50%)
    test_img_5[50:, :] = [128, 64, 64]    # Building (50%)
    
    test_path_5 = '/tmp/test_enc_tre_5.png'
    Image.fromarray(test_img_5).save(test_path_5)
    
    result_5 = calculate_indicator(test_path_5, test_semantic)
    
    print(f"\n   Test 5: 50% sky, 50% building, 0% tree")
    print(f"      Expected ENC_TRE: 0.0000")
    print(f"      Calculated ENC_TRE: {result_5.get('value', 'N/A')}")
    print(f"      SVF_total: {result_5.get('svf_total', 'N/A')}")
    print(f"      ENC_buildings: {result_5.get('enc_buildings', 'N/A')}")
    print(f"      Interpretation: {interpret_enc_tre(result_5.get('value'))}")
    
    os.remove(test_path_5)
    
    print("\n   ✅ Test complete!")
    print("\n   📊 Key Relationships:")
    print("      ENC_TRE = (1 - SVF_total) - (1 - SVF_buildings)")
    print("      ENC_TRE = Tree / (Sky + Building + Tree)")
    print("      ENC_TRE + ENC_BLD + SVF_total = 1.0 (in vertical view)")
