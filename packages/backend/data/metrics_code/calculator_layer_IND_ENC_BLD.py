"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_ENC_BLD
Indicator Name: Enclosure by Buildings
Type: TYPE D (Enclosure / Derived Ratio)

Description:
    The Enclosure by Buildings (ENC_BLD) measures the proportion of 
    the sky view obstructed specifically by building structures. It 
    quantifies how much of the vertical visual field is blocked by 
    buildings, providing insights into urban density and spatial 
    enclosure from an architectural perspective.
    
Formula: 
    ENC_BLD = 1 - SVF_buildings
    
    Where:
    SVF_buildings = Sky_Pixels / (Sky_Pixels + Building_Pixels)
    
    Simplified:
    ENC_BLD = Building_Pixels / (Sky_Pixels + Building_Pixels)
    
Variables:
    - Sky_Pixels: Number of pixels classified as sky
    - Building_Pixels: Number of pixels classified as building-related

Unit: ratio (0 to 1)
Range: 0.0 (no building enclosure) to 1.0 (completely enclosed by buildings)
"""

import numpy as np
from PIL import Image
from typing import Dict, List, Tuple


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_ENC_BLD",
    "name": "Enclosure by Buildings",
    "unit": "ratio",
    "formula": "ENC_BLD = 1 - SVF_buildings = Building_Pixels / (Sky_Pixels + Building_Pixels)",
    "formula_description": "Proportion of sky view obstructed by building structures",
    "target_direction": "CONTEXT",  # Depends on design intent
    "definition": "The proportion of the sky view obstructed specifically by building structures",
    "category": "CAT_CFG",
    
    # TYPE D Configuration
    "calc_type": "enclosure",  # Derived ratio from sky and building pixels
    
    # Variables
    "variables": {
        "Sky_Pixels": "Number of pixels classified as sky",
        "Building_Pixels": "Number of pixels classified as building-related",
        "SVF_buildings": "Sky View Factor considering only buildings"
    },
    
    # Component classes
    "component_classes": {
        "sky": ["sky", "cloud", "clouds"],
        "buildings": [
            "building", "edifice", "house", "skyscraper",
            "tower", "apartment", "office", "facade"
        ]
    },
    
    # Additional metadata
    "output_range": {
        "min": 0.0,
        "max": 1.0,
        "description": "0 = open sky (no building enclosure); 1 = completely enclosed by buildings"
    },
    "algorithm": "Derived ratio: 1 - (Sky / (Sky + Building))",
    "note": "Higher values indicate more building enclosure, reducing sky visibility"
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


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str, 
                        semantic_colors: Dict[str, Tuple[int, int, int]] = None) -> Dict:
    """
    Calculate the Enclosure by Buildings (ENC_BLD) indicator.
    
    TYPE D - Enclosure / Derived Ratio
    
    Formula:
        ENC_BLD = 1 - SVF_buildings
        
        Where:
        SVF_buildings = Sky_Pixels / (Sky_Pixels + Building_Pixels)
        
        Simplified:
        ENC_BLD = Building_Pixels / (Sky_Pixels + Building_Pixels)
    
    Args:
        image_path: Path to the semantic segmentation mask image
        semantic_colors: Dictionary mapping class names to RGB tuples.
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): ENC_BLD ratio (0 to 1)
            - 'sky_pixels' (int): Total sky pixels
            - 'building_pixels' (int): Total building pixels
            - 'svf_buildings' (float): Sky View Factor for buildings
            - 'sky_classes_found' (dict): Pixel counts by sky class
            - 'building_classes_found' (dict): Pixel counts by building class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"ENC_BLD: {result['value']:.4f}")
        ...     print(f"SVF_buildings: {result['svf_buildings']:.4f}")
    """
    try:
        # Step 1: Load and prepare the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Step 2: Create masks for sky and buildings
        sky_mask = np.zeros((h, w), dtype=np.uint8)
        building_mask = np.zeros((h, w), dtype=np.uint8)
        
        sky_classes_found = {}
        building_classes_found = {}
        
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
        
        # Step 3: Calculate pixel counts
        sky_pixels = int(np.sum(sky_mask > 0))
        building_pixels = int(np.sum(building_mask > 0))
        
        # Step 4: Calculate ENC_BLD
        # ENC_BLD = 1 - SVF_buildings
        # SVF_buildings = Sky / (Sky + Building)
        # ENC_BLD = Building / (Sky + Building)
        
        denominator = sky_pixels + building_pixels
        
        if denominator > 0:
            svf_buildings = sky_pixels / denominator
            enc_bld = building_pixels / denominator  # = 1 - svf_buildings
        else:
            # No sky or building pixels found
            svf_buildings = 0.0
            enc_bld = 0.0
        
        # Step 5: Calculate additional metrics
        sky_pct = (sky_pixels / total_pixels * 100) if total_pixels > 0 else 0
        building_pct = (building_pixels / total_pixels * 100) if total_pixels > 0 else 0
        
        n_sky_classes = len(sky_classes_found)
        n_building_classes = len(building_classes_found)
        
        # Sort classes by pixel count
        sorted_sky = dict(sorted(sky_classes_found.items(), key=lambda x: x[1], reverse=True))
        sorted_building = dict(sorted(building_classes_found.items(), key=lambda x: x[1], reverse=True))
        
        # Find dominant building class
        dominant_building = max(building_classes_found, key=building_classes_found.get) if building_classes_found else None
        
        # Step 6: Return results
        return {
            'success': True,
            'value': round(enc_bld, 4),
            'svf_buildings': round(svf_buildings, 4),
            'sky_pixels': sky_pixels,
            'building_pixels': building_pixels,
            'total_pixels': int(total_pixels),
            'sky_pct': round(sky_pct, 2),
            'building_pct': round(building_pct, 2),
            'denominator': denominator,
            'n_sky_classes': n_sky_classes,
            'n_building_classes': n_building_classes,
            'sky_classes_found': sorted_sky,
            'building_classes_found': sorted_building,
            'dominant_building_class': dominant_building,
            'enclosure_pct': round(enc_bld * 100, 2)
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
def interpret_enc_bld(enc_bld: float) -> str:
    """
    Interpret the Enclosure by Buildings value.
    
    Args:
        enc_bld: ENC_BLD ratio (0 to 1)
        
    Returns:
        str: Qualitative interpretation
    """
    if enc_bld is None:
        return "Unable to interpret (no data)"
    elif enc_bld < 0.1:
        return "Very open: minimal building enclosure"
    elif enc_bld < 0.25:
        return "Open: low building presence in sky view"
    elif enc_bld < 0.40:
        return "Semi-enclosed: moderate building enclosure"
    elif enc_bld < 0.60:
        return "Enclosed: significant building presence"
    elif enc_bld < 0.80:
        return "Highly enclosed: buildings dominate sky view"
    else:
        return "Very highly enclosed: minimal sky visibility"


def explain_formula() -> str:
    """
    Provide educational explanation of the ENC_BLD formula.
    
    Returns:
        str: Explanation text
    """
    return """
    Enclosure by Buildings (ENC_BLD) Formula:
    
    ENC_BLD = 1 - SVF_buildings
    
    Where:
        SVF_buildings = Sky_Pixels / (Sky_Pixels + Building_Pixels)
    
    Simplified:
        ENC_BLD = Building_Pixels / (Sky_Pixels + Building_Pixels)
    
    This formula measures:
    - How much of the vertical visual field (sky + buildings) is occupied by buildings
    - The degree to which buildings obstruct the view of the sky
    
    Components:
    
    1. Sky Classes:
       - sky, clouds
    
    2. Building Classes:
       - building, edifice, house
       - skyscraper, tower
       - apartment, office
       - facade, wall
    
    Interpretation:
    - ENC_BLD = 0: Completely open sky (no buildings in view)
    - ENC_BLD = 0.5: Equal sky and building coverage
    - ENC_BLD = 1: Completely enclosed by buildings (no sky visible)
    
    Relationship with SVF:
    - SVF_buildings = 1 - ENC_BLD
    - High SVF → Low enclosure (open sky)
    - Low SVF → High enclosure (buildings dominate)
    
    Urban Planning Relevance:
    - High enclosure: Dense urban canyons, limited daylight
    - Moderate enclosure: Balanced urban streetscape
    - Low enclosure: Open plazas, parks, suburban areas
    
    Note: This indicator considers ONLY buildings vs sky.
    For total enclosure (including trees), see IND_ENC_TRE.
    """


# =============================================================================
# STANDALONE TEST (Optional)
# =============================================================================
if __name__ == "__main__":
    import os
    
    print("\n🧪 Testing Enclosure by Buildings calculator...")
    
    # Test 1: No buildings (all sky)
    test_img_1 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_1[:, :] = [135, 206, 235]  # Sky blue
    
    test_path_1 = '/tmp/test_enc_bld_1.png'
    Image.fromarray(test_img_1).save(test_path_1)
    
    test_semantic_1 = {"sky": (135, 206, 235), "building": (128, 64, 64)}
    result_1 = calculate_indicator(test_path_1, test_semantic_1)
    
    print(f"\n   Test 1: 100% sky, 0% building")
    print(f"      Expected ENC_BLD: 0.0000")
    print(f"      Calculated ENC_BLD: {result_1.get('value', 'N/A')}")
    print(f"      SVF_buildings: {result_1.get('svf_buildings', 'N/A')}")
    print(f"      Interpretation: {interpret_enc_bld(result_1.get('value'))}")
    
    os.remove(test_path_1)
    
    # Test 2: Half sky, half buildings
    test_img_2 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_2[:50, :] = [135, 206, 235]  # Sky (50%)
    test_img_2[50:, :] = [128, 64, 64]    # Building (50%)
    
    test_path_2 = '/tmp/test_enc_bld_2.png'
    Image.fromarray(test_img_2).save(test_path_2)
    
    result_2 = calculate_indicator(test_path_2, test_semantic_1)
    
    print(f"\n   Test 2: 50% sky, 50% building")
    print(f"      Expected ENC_BLD: 0.5000")
    print(f"      Calculated ENC_BLD: {result_2.get('value', 'N/A')}")
    print(f"      SVF_buildings: {result_2.get('svf_buildings', 'N/A')}")
    print(f"      Interpretation: {interpret_enc_bld(result_2.get('value'))}")
    
    os.remove(test_path_2)
    
    # Test 3: Mostly buildings (70% building, 30% sky)
    test_img_3 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_3[:30, :] = [135, 206, 235]  # Sky (30%)
    test_img_3[30:, :] = [128, 64, 64]    # Building (70%)
    
    test_path_3 = '/tmp/test_enc_bld_3.png'
    Image.fromarray(test_img_3).save(test_path_3)
    
    result_3 = calculate_indicator(test_path_3, test_semantic_1)
    
    print(f"\n   Test 3: 30% sky, 70% building")
    print(f"      Expected ENC_BLD: 0.7000")
    print(f"      Calculated ENC_BLD: {result_3.get('value', 'N/A')}")
    print(f"      SVF_buildings: {result_3.get('svf_buildings', 'N/A')}")
    print(f"      Interpretation: {interpret_enc_bld(result_3.get('value'))}")
    
    os.remove(test_path_3)
    
    # Test 4: All buildings (no sky)
    test_img_4 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_4[:, :] = [128, 64, 64]  # All building
    
    test_path_4 = '/tmp/test_enc_bld_4.png'
    Image.fromarray(test_img_4).save(test_path_4)
    
    result_4 = calculate_indicator(test_path_4, test_semantic_1)
    
    print(f"\n   Test 4: 0% sky, 100% building")
    print(f"      Expected ENC_BLD: 1.0000")
    print(f"      Calculated ENC_BLD: {result_4.get('value', 'N/A')}")
    print(f"      SVF_buildings: {result_4.get('svf_buildings', 'N/A')}")
    print(f"      Interpretation: {interpret_enc_bld(result_4.get('value'))}")
    
    os.remove(test_path_4)
    
    # Test 5: Multiple building classes
    test_img_5 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_5[:40, :] = [135, 206, 235]   # Sky (40%)
    test_img_5[40:70, :] = [128, 64, 64]   # Building (30%)
    test_img_5[70:, :] = [192, 128, 128]   # House (30%)
    
    test_path_5 = '/tmp/test_enc_bld_5.png'
    Image.fromarray(test_img_5).save(test_path_5)
    
    test_semantic_5 = {
        "sky": (135, 206, 235), 
        "building": (128, 64, 64),
        "house": (192, 128, 128)
    }
    result_5 = calculate_indicator(test_path_5, test_semantic_5)
    
    print(f"\n   Test 5: 40% sky, 30% building + 30% house = 60% total building")
    print(f"      Expected ENC_BLD: 0.6000")
    print(f"      Calculated ENC_BLD: {result_5.get('value', 'N/A')}")
    print(f"      Building classes: {result_5.get('n_building_classes', 0)}")
    print(f"      Building breakdown: {result_5.get('building_classes_found', {})}")
    print(f"      Interpretation: {interpret_enc_bld(result_5.get('value'))}")
    
    os.remove(test_path_5)
    
    print("\n   ✅ Test complete!")
    print("\n   📊 Relationship:")
    print("      ENC_BLD + SVF_buildings = 1.0")
    print("      High ENC_BLD = Low sky visibility (urban canyon)")
    print("      Low ENC_BLD = High sky visibility (open area)")
