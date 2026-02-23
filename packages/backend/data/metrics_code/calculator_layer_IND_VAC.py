"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_VAC
Indicator Name: Visible Accessibility Index
Type: TYPE A (Simple Pixel Ratio)

Description:
    The Visible Accessibility Index (VAC) measures the proportion of 
    pixels representing accessibility features such as sidewalks, paths, 
    stairs, streetlights, and benches. This indicator reflects the visual 
    presence of infrastructure that supports pedestrian accessibility 
    and mobility in urban environments.
    
Formula: 
    VAC = (Pixels_Sidewalk + Pixels_Path + Pixels_Stairs + 
           Pixels_Streetlight + Pixels_Bench + ...) / Total_Pixels
    
Variables:
    - Pixels_Sidewalk: Sidewalk/pavement pixels
    - Pixels_Path: Path/walkway pixels
    - Pixels_Stairs: Stairs/steps pixels
    - Pixels_Streetlight: Street light pixels
    - Pixels_Bench: Bench pixels
    - Total_Pixels: Total image pixels

Unit: ratio (0 to 1)
Range: 0.0 (no accessibility features) to 1.0 (all accessibility features)
"""

import numpy as np
from PIL import Image
from typing import Dict, List, Tuple


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_VAC",
    "name": "Visible Accessibility Index",
    "unit": "ratio",
    "formula": "VAC = Sum(Pixels_Sidewalk + Pixels_Streetlight + Pixels_Bench + Pixels_Path + Pixels_Stairs) / Total_Pixels",
    "formula_description": "Sum of accessibility feature pixels divided by total pixels",
    "target_direction": "POSITIVE",  # More accessibility features generally improve usability
    "definition": "The proportion of pixels representing accessibility features such as sidewalks, paths, stairs, streetlights, and benches",
    "category": "CAT_CMP",
    
    # TYPE A Configuration
    "calc_type": "ratio",  # Simple pixel ratio
    
    # Variables
    "variables": {
        "Pixels_Sidewalk": "Sidewalk/pavement pixels",
        "Pixels_Path": "Path/walkway pixels",
        "Pixels_Stairs": "Stairs/steps pixels",
        "Pixels_Streetlight": "Street light pixels",
        "Pixels_Bench": "Bench pixels",
        "Total_Pixels": "Total image pixels"
    },
    
    # Additional metadata
    "output_range": {
        "min": 0.0,
        "max": 1.0,
        "description": "0 = no accessibility features; 1 = all accessibility features"
    },
    "algorithm": "Sum of accessibility feature pixels / Total pixels",
    "note": "Higher values indicate more visible accessibility infrastructure"
}

print(f"\n✅ Calculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f"   Formula: {INDICATOR['formula']}")
print(f"   Type: TYPE A (Simple Pixel Ratio)")


# =============================================================================
# ACCESSIBILITY FEATURE CLASS IDENTIFICATION
# =============================================================================
# Keywords to identify accessibility feature classes in semantic segmentation
# These are matched against class names (case-insensitive, partial match)

# Organized by category
ACCESSIBILITY_CATEGORIES = {
    "sidewalk": [
        "sidewalk", "side walk", "side_walk",
        "pavement", "footpath", "foot path", "foot_path",
        "pedestrian", "walkway", "walk way", "walk_way"
    ],
    "path": [
        "path", "pathway", "trail",
        "crossing", "crosswalk", "cross walk", "cross_walk",
        "zebra crossing", "zebra_crossing"
    ],
    "stairs": [
        "stairs", "stair", "step", "steps",
        "staircase", "stairway"
    ],
    "streetlight": [
        "streetlight", "street light", "street_light",
        "streetlamp", "street lamp", "street_lamp",
        "light pole", "lamp post", "lamppost",
        "pole light"
    ],
    "bench": [
        "bench", "seat", "seating",
        "park bench", "park_bench"
    ],
    "ramp": [
        "ramp", "wheelchair ramp", "access ramp",
        "curb cut", "curb_cut"
    ]
}

# Flatten keywords for simple matching
ACCESSIBILITY_KEYWORDS = []
for category, keywords in ACCESSIBILITY_CATEGORIES.items():
    ACCESSIBILITY_KEYWORDS.extend(keywords)


def get_accessibility_category(class_name: str) -> str:
    """
    Check if a class name represents an accessibility feature and return its category.
    
    Args:
        class_name: Name of the semantic class
        
    Returns:
        str: Category name or None if not accessibility related
    """
    class_lower = class_name.lower().replace("-", " ").replace("_", " ")
    
    for category, keywords in ACCESSIBILITY_CATEGORIES.items():
        for keyword in keywords:
            keyword_lower = keyword.lower()
            if keyword_lower in class_lower:
                return category
    
    return None


def is_accessibility_class(class_name: str) -> bool:
    """
    Check if a class name represents any accessibility feature.
    
    Args:
        class_name: Name of the semantic class
        
    Returns:
        bool: True if class is an accessibility feature
    """
    return get_accessibility_category(class_name) is not None


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str, 
                        semantic_colors: Dict[str, Tuple[int, int, int]] = None) -> Dict:
    """
    Calculate the Visible Accessibility Index (VAC) indicator.
    
    TYPE A - Simple Pixel Ratio
    
    Formula:
        VAC = Sum(accessibility_feature_pixels) / Total_pixels
        
    Accessibility features include: sidewalks, paths, stairs, streetlights, benches, ramps
    
    Args:
        image_path: Path to the semantic segmentation mask image
        semantic_colors: Dictionary mapping class names to RGB tuples.
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): VAC ratio (0 to 1)
            - 'accessibility_pixels' (int): Total accessibility feature pixels
            - 'total_pixels' (int): Total image pixels
            - 'accessibility_coverage_pct' (float): Accessibility coverage percentage
            - 'category_breakdown' (dict): Pixels by category
            - 'accessibility_classes_found' (dict): Pixel counts by class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"VAC: {result['value']:.4f}")
        ...     print(f"Accessibility coverage: {result['accessibility_coverage_pct']:.2f}%")
    """
    try:
        # Step 1: Load and prepare the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Step 2: Create accessibility mask and count by class/category
        accessibility_mask = np.zeros((h, w), dtype=np.uint8)
        accessibility_classes_found = {}
        category_breakdown = {cat: 0 for cat in ACCESSIBILITY_CATEGORIES.keys()}
        
        if semantic_colors:
            # Use provided semantic color configuration
            for class_name, rgb in semantic_colors.items():
                category = get_accessibility_category(class_name)
                if category:
                    mask = np.all(pixels == rgb, axis=2)
                    count = int(np.sum(mask))
                    if count > 0:
                        accessibility_mask[mask] = 1
                        accessibility_classes_found[class_name] = count
                        category_breakdown[category] += count
        
        # Step 3: Calculate VAC
        accessibility_pixels = int(np.sum(accessibility_mask > 0))
        vac = accessibility_pixels / total_pixels if total_pixels > 0 else 0.0
        
        # Step 4: Calculate additional metrics
        n_accessibility_classes = len(accessibility_classes_found)
        accessibility_coverage_pct = vac * 100
        
        # Sort accessibility classes by pixel count
        sorted_accessibility = dict(sorted(
            accessibility_classes_found.items(), 
            key=lambda x: x[1], 
            reverse=True
        ))
        
        # Calculate category percentages
        category_percentages = {
            cat: round(count / total_pixels * 100, 2) if total_pixels > 0 else 0
            for cat, count in category_breakdown.items()
        }
        
        # Find dominant category
        non_zero_categories = {k: v for k, v in category_breakdown.items() if v > 0}
        dominant_category = max(non_zero_categories, key=non_zero_categories.get) if non_zero_categories else None
        
        # Step 5: Return results
        return {
            'success': True,
            'value': round(vac, 4),
            'accessibility_pixels': accessibility_pixels,
            'total_pixels': int(total_pixels),
            'non_accessibility_pixels': int(total_pixels - accessibility_pixels),
            'accessibility_coverage_pct': round(accessibility_coverage_pct, 2),
            'n_accessibility_classes': n_accessibility_classes,
            'accessibility_classes_found': sorted_accessibility,
            'category_breakdown': category_breakdown,
            'category_percentages': category_percentages,
            'dominant_category': dominant_category,
            'n_categories_present': len(non_zero_categories)
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
def interpret_vac(vac: float) -> str:
    """
    Interpret the Visible Accessibility Index value.
    
    Args:
        vac: VAC ratio (0 to 1)
        
    Returns:
        str: Qualitative interpretation
    """
    if vac is None:
        return "Unable to interpret (no data)"
    elif vac < 0.01:
        return "No accessibility features detected"
    elif vac < 0.05:
        return "Minimal accessibility infrastructure visible"
    elif vac < 0.10:
        return "Some accessibility features present"
    elif vac < 0.20:
        return "Moderate accessibility infrastructure"
    elif vac < 0.35:
        return "Good accessibility coverage"
    else:
        return "High accessibility infrastructure coverage"


def explain_formula() -> str:
    """
    Provide educational explanation of the VAC formula.
    
    Returns:
        str: Explanation text
    """
    return """
    Visible Accessibility Index (VAC) Formula:
    
    VAC = Sum(Accessibility_Feature_Pixels) / Total_Pixels
    
    Expanded:
    VAC = (Pixels_Sidewalk + Pixels_Path + Pixels_Stairs + 
           Pixels_Streetlight + Pixels_Bench + Pixels_Ramp) / Total_Pixels
    
    Feature Categories:
    
    1. Sidewalks:
       - Sidewalks, pavements, footpaths
       - Pedestrian walkways
    
    2. Paths:
       - Walking paths, trails
       - Crosswalks, zebra crossings
    
    3. Stairs:
       - Stairs, steps, staircases
       - Stairways
    
    4. Street Lighting:
       - Streetlights, lamp posts
       - Light poles
    
    5. Benches:
       - Park benches, seating
       - Rest areas
    
    6. Ramps:
       - Wheelchair ramps
       - Curb cuts, access ramps
    
    Interpretation:
    - VAC ≈ 0: No accessibility features visible
    - VAC ≈ 0.05: Minimal features (5% of view)
    - VAC ≈ 0.15: Moderate accessibility (15% of view)
    - VAC > 0.30: High accessibility coverage
    
    Note: In typical street scenes, sidewalks usually dominate 
    the VAC calculation. Higher VAC values indicate:
    - Better pedestrian infrastructure
    - More accessible environment
    - Enhanced mobility support
    """


# =============================================================================
# STANDALONE TEST (Optional)
# =============================================================================
if __name__ == "__main__":
    import os
    
    print("\n🧪 Testing Visible Accessibility Index calculator...")
    
    # Test 1: No accessibility features (all sky)
    test_img_1 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_1[:, :] = [135, 206, 235]  # Sky blue
    
    test_path_1 = '/tmp/test_vac_1.png'
    Image.fromarray(test_img_1).save(test_path_1)
    
    test_semantic_1 = {"sky": (135, 206, 235)}
    result_1 = calculate_indicator(test_path_1, test_semantic_1)
    
    print(f"\n   Test 1: No accessibility features (100% sky)")
    print(f"      Expected VAC: 0.0000")
    print(f"      Calculated VAC: {result_1.get('value', 'N/A')}")
    print(f"      Interpretation: {interpret_vac(result_1.get('value'))}")
    
    os.remove(test_path_1)
    
    # Test 2: Sidewalk only (20%)
    test_img_2 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_2[:, :] = [128, 128, 128]    # Gray (road)
    test_img_2[:20, :] = [200, 200, 200]  # Light gray (sidewalk) - 20%
    
    test_path_2 = '/tmp/test_vac_2.png'
    Image.fromarray(test_img_2).save(test_path_2)
    
    test_semantic_2 = {"road": (128, 128, 128), "sidewalk": (200, 200, 200)}
    result_2 = calculate_indicator(test_path_2, test_semantic_2)
    
    print(f"\n   Test 2: 20% sidewalk coverage")
    print(f"      Expected VAC: 0.2000")
    print(f"      Calculated VAC: {result_2.get('value', 'N/A')}")
    print(f"      Category breakdown: {result_2.get('category_breakdown', {})}")
    print(f"      Interpretation: {interpret_vac(result_2.get('value'))}")
    
    os.remove(test_path_2)
    
    # Test 3: Multiple accessibility features
    test_img_3 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_3[:, :] = [128, 128, 128]       # Gray (road) - base
    test_img_3[:15, :] = [200, 200, 200]     # Light gray (sidewalk) - 15%
    test_img_3[15:18, :] = [255, 255, 128]   # Yellow (streetlight) - 3%
    test_img_3[18:20, :] = [139, 90, 43]     # Brown (bench) - 2%
    
    test_path_3 = '/tmp/test_vac_3.png'
    Image.fromarray(test_img_3).save(test_path_3)
    
    test_semantic_3 = {
        "road": (128, 128, 128), 
        "sidewalk": (200, 200, 200),
        "streetlight": (255, 255, 128),
        "bench": (139, 90, 43)
    }
    result_3 = calculate_indicator(test_path_3, test_semantic_3)
    
    print(f"\n   Test 3: Multiple features (15% sidewalk + 3% streetlight + 2% bench)")
    print(f"      Expected VAC: 0.2000")
    print(f"      Calculated VAC: {result_3.get('value', 'N/A')}")
    print(f"      Accessibility classes: {result_3.get('n_accessibility_classes', 0)}")
    print(f"      Category breakdown: {result_3.get('category_breakdown', {})}")
    print(f"      Dominant category: {result_3.get('dominant_category', 'N/A')}")
    print(f"      Interpretation: {interpret_vac(result_3.get('value'))}")
    
    os.remove(test_path_3)
    
    # Test 4: High accessibility coverage (40%)
    test_img_4 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_4[:, :] = [128, 128, 128]    # Gray (road)
    test_img_4[:40, :] = [200, 200, 200]  # Light gray (sidewalk) - 40%
    
    test_path_4 = '/tmp/test_vac_4.png'
    Image.fromarray(test_img_4).save(test_path_4)
    
    result_4 = calculate_indicator(test_path_4, test_semantic_3)
    
    print(f"\n   Test 4: High accessibility coverage (40% sidewalk)")
    print(f"      Expected VAC: 0.4000")
    print(f"      Calculated VAC: {result_4.get('value', 'N/A')}")
    print(f"      Interpretation: {interpret_vac(result_4.get('value'))}")
    
    os.remove(test_path_4)
    
    print("\n   ✅ Test complete!")
    print(f"\n   📝 Accessibility categories: {list(ACCESSIBILITY_CATEGORIES.keys())}")
