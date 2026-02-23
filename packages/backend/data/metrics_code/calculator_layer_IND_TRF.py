"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_TRF
Indicator Name: Traffic Recognition
Type: TYPE A (Simple Pixel Ratio)

Description:
    The Traffic Recognition (TRF) indicator measures the proportion of 
    the visual field occupied by traffic guidance elements and pedestrian 
    paths. This indicator reflects the visibility and presence of traffic 
    infrastructure that supports navigation, safety, and pedestrian 
    accessibility in urban environments.
    
Formula: 
    TR = (P_traffic_signal + P_sidewalk + P_railway) / P_all
    
Variables:
    - P_traffic_signal: Traffic signal/light pixels
    - P_sidewalk: Sidewalk pixels
    - P_railway: Railway pixels
    - P_all: Total pixels in image

Unit: ratio (0 to 1)
Range: 0.0 (no traffic elements) to 1.0 (all traffic elements)
"""

import numpy as np
from PIL import Image
from typing import Dict, List, Tuple


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_TRF",
    "name": "Traffic Recognition",
    "unit": "ratio",
    "formula": "TR = (P_traffic_signal + P_sidewalk + P_railway) / P_all",
    "formula_description": "Sum of traffic element pixels divided by total pixels",
    "target_direction": "POSITIVE",  # More traffic elements indicate better navigation support
    "definition": "The proportion of visual field occupied by traffic guidance elements and pedestrian paths",
    "category": "CAT_CMP",
    
    # TYPE A Configuration
    "calc_type": "ratio",  # Simple pixel ratio
    
    # Variables
    "variables": {
        "P_traffic_signal": "Traffic signal/light pixels",
        "P_sidewalk": "Sidewalk pixels",
        "P_railway": "Railway pixels",
        "P_all": "Total pixels in image"
    },
    
    # Additional metadata
    "output_range": {
        "min": 0.0,
        "max": 1.0,
        "description": "0 = no traffic elements; 1 = all traffic elements"
    },
    "algorithm": "Sum of traffic element class pixels / Total pixels",
    "note": "Higher values indicate more visible traffic guidance and pedestrian infrastructure"
}

print(f"\n✅ Calculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f"   Formula: {INDICATOR['formula']}")
print(f"   Type: TYPE A (Simple Pixel Ratio)")


# =============================================================================
# TRAFFIC ELEMENT CLASS IDENTIFICATION
# =============================================================================
# Keywords to identify traffic element classes in semantic segmentation
# These are matched against class names (case-insensitive, partial match)
TRAFFIC_KEYWORDS = [
    # Traffic signals and lights
    "traffic signal", "traffic_signal", "trafficsignal",
    "traffic light", "traffic_light", "trafficlight",
    "signal", "stoplight", "stop light",
    
    # Sidewalks and pedestrian paths
    "sidewalk", "side walk", "side_walk",
    "pavement", "footpath", "foot path", "foot_path",
    "pedestrian", "walkway", "walk way", "walk_way",
    "crosswalk", "cross walk", "cross_walk",
    "zebra crossing", "zebra_crossing",
    
    # Railway elements
    "railway", "rail way", "rail_way",
    "railroad", "rail road", "rail_road",
    "train track", "train_track", "traintrack",
    "rail", "track", "tram", "tramway"
]

# Organized by category for reporting
TRAFFIC_CATEGORIES = {
    "traffic_signal": ["traffic signal", "traffic_signal", "trafficsignal", 
                       "traffic light", "traffic_light", "trafficlight",
                       "signal", "stoplight", "stop light"],
    "sidewalk": ["sidewalk", "side walk", "side_walk", "pavement", 
                 "footpath", "foot path", "foot_path", "pedestrian", 
                 "walkway", "walk way", "walk_way", "crosswalk", 
                 "cross walk", "cross_walk", "zebra crossing", "zebra_crossing"],
    "railway": ["railway", "rail way", "rail_way", "railroad", 
                "rail road", "rail_road", "train track", "train_track", 
                "traintrack", "rail", "track", "tram", "tramway"]
}


def is_traffic_class(class_name: str) -> str:
    """
    Check if a class name represents a traffic element and return its category.
    
    Args:
        class_name: Name of the semantic class
        
    Returns:
        str: Category name ('traffic_signal', 'sidewalk', 'railway') or None
    """
    class_lower = class_name.lower().replace("-", " ").replace("_", " ")
    
    for category, keywords in TRAFFIC_CATEGORIES.items():
        for keyword in keywords:
            keyword_lower = keyword.lower()
            if keyword_lower in class_lower:
                return category
    
    return None


def is_any_traffic_class(class_name: str) -> bool:
    """
    Check if a class name represents any traffic element.
    
    Args:
        class_name: Name of the semantic class
        
    Returns:
        bool: True if class is a traffic element
    """
    return is_traffic_class(class_name) is not None


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str, 
                        semantic_colors: Dict[str, Tuple[int, int, int]] = None) -> Dict:
    """
    Calculate the Traffic Recognition (TRF) indicator.
    
    TYPE A - Simple Pixel Ratio
    
    Formula:
        TR = (P_traffic_signal + P_sidewalk + P_railway) / P_all
        
    Traffic element classes include: traffic signals/lights, sidewalks, railways
    
    Args:
        image_path: Path to the semantic segmentation mask image
        semantic_colors: Dictionary mapping class names to RGB tuples.
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): TRF ratio (0 to 1)
            - 'traffic_pixels' (int): Total traffic element pixels
            - 'total_pixels' (int): Total image pixels
            - 'traffic_coverage_pct' (float): Traffic coverage percentage
            - 'category_breakdown' (dict): Pixels by category
            - 'traffic_classes_found' (dict): Pixel counts by class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"TRF: {result['value']:.4f}")
        ...     print(f"Traffic coverage: {result['traffic_coverage_pct']:.2f}%")
    """
    try:
        # Step 1: Load and prepare the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Step 2: Create traffic mask and count by class/category
        traffic_mask = np.zeros((h, w), dtype=np.uint8)
        traffic_classes_found = {}
        category_breakdown = {
            'traffic_signal': 0,
            'sidewalk': 0,
            'railway': 0
        }
        
        if semantic_colors:
            # Use provided semantic color configuration
            for class_name, rgb in semantic_colors.items():
                category = is_traffic_class(class_name)
                if category:
                    mask = np.all(pixels == rgb, axis=2)
                    count = int(np.sum(mask))
                    if count > 0:
                        traffic_mask[mask] = 1
                        traffic_classes_found[class_name] = count
                        category_breakdown[category] += count
        
        # Step 3: Calculate TRF
        traffic_pixels = int(np.sum(traffic_mask > 0))
        trf = traffic_pixels / total_pixels if total_pixels > 0 else 0.0
        
        # Step 4: Calculate additional metrics
        n_traffic_classes = len(traffic_classes_found)
        traffic_coverage_pct = trf * 100
        
        # Sort traffic classes by pixel count
        sorted_traffic = dict(sorted(
            traffic_classes_found.items(), 
            key=lambda x: x[1], 
            reverse=True
        ))
        
        # Calculate category percentages
        category_percentages = {
            cat: round(count / total_pixels * 100, 2) if total_pixels > 0 else 0
            for cat, count in category_breakdown.items()
        }
        
        # Step 5: Return results
        return {
            'success': True,
            'value': round(trf, 4),
            'traffic_pixels': traffic_pixels,
            'total_pixels': int(total_pixels),
            'non_traffic_pixels': int(total_pixels - traffic_pixels),
            'traffic_coverage_pct': round(traffic_coverage_pct, 2),
            'n_traffic_classes': n_traffic_classes,
            'traffic_classes_found': sorted_traffic,
            'category_breakdown': category_breakdown,
            'category_percentages': category_percentages,
            'dominant_category': max(category_breakdown, key=category_breakdown.get) if any(category_breakdown.values()) else None
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
def interpret_trf(trf: float) -> str:
    """
    Interpret the Traffic Recognition value.
    
    Args:
        trf: TRF ratio (0 to 1)
        
    Returns:
        str: Qualitative interpretation
    """
    if trf is None:
        return "Unable to interpret (no data)"
    elif trf < 0.01:
        return "No traffic elements detected"
    elif trf < 0.05:
        return "Minimal traffic infrastructure visible"
    elif trf < 0.10:
        return "Some traffic elements present"
    elif trf < 0.20:
        return "Moderate traffic infrastructure"
    elif trf < 0.35:
        return "Good traffic visibility"
    else:
        return "High traffic infrastructure coverage"


def explain_formula() -> str:
    """
    Provide educational explanation of the TRF formula.
    
    Returns:
        str: Explanation text
    """
    return """
    Traffic Recognition (TRF) Formula:
    
    TR = (P_traffic_signal + P_sidewalk + P_railway) / P_all
    
    Simplified as:
    TR = Sum(traffic_element_pixels) / Total_pixels
    
    Components:
    
    1. Traffic Signals (P_traffic_signal):
       - Traffic lights
       - Stop lights
       - Signal indicators
    
    2. Sidewalks (P_sidewalk):
       - Sidewalks and pavements
       - Footpaths and walkways
       - Crosswalks and zebra crossings
       - Pedestrian paths
    
    3. Railways (P_railway):
       - Railway tracks
       - Tram lines
       - Railroad crossings
    
    Interpretation:
    - TR ≈ 0: No traffic infrastructure visible
    - TR ≈ 0.05: Minimal traffic elements (5% of view)
    - TR ≈ 0.15: Moderate traffic infrastructure (15% of view)
    - TR > 0.30: High traffic coverage
    
    Note: In typical street scenes, sidewalks often dominate 
    the TRF calculation as they occupy larger visual areas 
    compared to traffic signals or railways.
    
    Higher TRF values indicate:
    - Better traffic navigation support
    - More pedestrian infrastructure
    - Higher urban development level
    """


# =============================================================================
# STANDALONE TEST (Optional)
# =============================================================================
if __name__ == "__main__":
    import os
    
    print("\n🧪 Testing Traffic Recognition calculator...")
    
    # Test 1: No traffic elements (all sky)
    test_img_1 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_1[:, :] = [135, 206, 235]  # Sky blue
    
    test_path_1 = '/tmp/test_trf_1.png'
    Image.fromarray(test_img_1).save(test_path_1)
    
    test_semantic_1 = {"sky": (135, 206, 235)}
    result_1 = calculate_indicator(test_path_1, test_semantic_1)
    
    print(f"\n   Test 1: No traffic elements (100% sky)")
    print(f"      Expected TRF: 0.0000")
    print(f"      Calculated TRF: {result_1.get('value', 'N/A')}")
    print(f"      Interpretation: {interpret_trf(result_1.get('value'))}")
    
    os.remove(test_path_1)
    
    # Test 2: Sidewalk only (20%)
    test_img_2 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_2[:, :] = [128, 128, 128]    # Gray (road)
    test_img_2[:20, :] = [200, 200, 200]  # Light gray (sidewalk) - 20%
    
    test_path_2 = '/tmp/test_trf_2.png'
    Image.fromarray(test_img_2).save(test_path_2)
    
    test_semantic_2 = {"road": (128, 128, 128), "sidewalk": (200, 200, 200)}
    result_2 = calculate_indicator(test_path_2, test_semantic_2)
    
    print(f"\n   Test 2: 20% sidewalk coverage")
    print(f"      Expected TRF: 0.2000")
    print(f"      Calculated TRF: {result_2.get('value', 'N/A')}")
    print(f"      Category breakdown: {result_2.get('category_breakdown', {})}")
    print(f"      Interpretation: {interpret_trf(result_2.get('value'))}")
    
    os.remove(test_path_2)
    
    # Test 3: Multiple traffic elements
    test_img_3 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_3[:, :] = [128, 128, 128]       # Gray (road) - base
    test_img_3[:15, :] = [200, 200, 200]     # Light gray (sidewalk) - 15%
    test_img_3[15:18, :] = [255, 255, 0]     # Yellow (traffic light) - 3%
    test_img_3[18:20, :] = [139, 69, 19]     # Brown (railway) - 2%
    
    test_path_3 = '/tmp/test_trf_3.png'
    Image.fromarray(test_img_3).save(test_path_3)
    
    test_semantic_3 = {
        "road": (128, 128, 128), 
        "sidewalk": (200, 200, 200),
        "traffic light": (255, 255, 0),
        "railway": (139, 69, 19)
    }
    result_3 = calculate_indicator(test_path_3, test_semantic_3)
    
    print(f"\n   Test 3: Multiple elements (15% sidewalk + 3% traffic light + 2% railway)")
    print(f"      Expected TRF: 0.2000")
    print(f"      Calculated TRF: {result_3.get('value', 'N/A')}")
    print(f"      Traffic classes: {result_3.get('n_traffic_classes', 0)}")
    print(f"      Category breakdown: {result_3.get('category_breakdown', {})}")
    print(f"      Dominant category: {result_3.get('dominant_category', 'N/A')}")
    print(f"      Interpretation: {interpret_trf(result_3.get('value'))}")
    
    os.remove(test_path_3)
    
    # Test 4: High traffic coverage (40%)
    test_img_4 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_4[:, :] = [128, 128, 128]    # Gray (road)
    test_img_4[:40, :] = [200, 200, 200]  # Light gray (sidewalk) - 40%
    
    test_path_4 = '/tmp/test_trf_4.png'
    Image.fromarray(test_img_4).save(test_path_4)
    
    result_4 = calculate_indicator(test_path_4, test_semantic_3)
    
    print(f"\n   Test 4: High traffic coverage (40% sidewalk)")
    print(f"      Expected TRF: 0.4000")
    print(f"      Calculated TRF: {result_4.get('value', 'N/A')}")
    print(f"      Interpretation: {interpret_trf(result_4.get('value'))}")
    
    os.remove(test_path_4)
    
    print("\n   ✅ Test complete!")
    print(f"\n   📝 Traffic categories: {list(TRAFFIC_CATEGORIES.keys())}")
