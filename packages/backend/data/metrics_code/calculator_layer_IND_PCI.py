"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_PCI
Indicator Name: Public-Facility Convenience Index
Type: TYPE A (Simple Pixel Ratio)

Description:
    The Public-Facility Convenience Index (PCI) measures the proportion of 
    the visual field occupied by public service facilities. This indicator 
    reflects street convenience by quantifying the presence of amenities 
    such as benches, lights, trash cans, and other public facilities that 
    enhance pedestrian experience and usability of urban spaces.
    
Formula: 
    PCI = (P_chair + P_toilet + P_bench + P_stool + P_trashcan + 
           P_table + P_armchair + P_light + P_streetlight + 
           P_bulletinboard) / P_all
    
Variables:
    - P_chair: Chair pixels
    - P_toilet: Toilet pixels
    - P_bench: Bench pixels
    - P_stool: Stool pixels
    - P_trashcan: Trash can pixels
    - P_table: Table pixels
    - P_armchair: Armchair pixels
    - P_light: Light pixels
    - P_streetlight: Street light pixels
    - P_bulletinboard: Bulletin board pixels
    - P_all: Total pixels in image

Unit: ratio (0 to 1)
Range: 0.0 (no public facilities) to 1.0 (all public facilities)
"""

import numpy as np
from PIL import Image
from typing import Dict, List, Tuple


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_PCI",
    "name": "Public-Facility Convenience Index",
    "unit": "ratio",
    "formula": "PCI = (P_chair + P_toilet + P_bench + P_stool + P_trashcan + P_table + P_armchair + P_light + P_streetlight + P_bulletinboard) / P_all",
    "formula_description": "Sum of public facility pixels divided by total pixels",
    "target_direction": "POSITIVE",  # More public facilities generally improve convenience
    "definition": "The proportion of the visual field occupied by public service facilities, reflecting street convenience",
    "category": "CAT_CMP",
    
    # TYPE A Configuration
    "calc_type": "ratio",  # Simple pixel ratio
    
    # Variables
    "variables": {
        "P_chair": "Chair pixels",
        "P_toilet": "Toilet pixels",
        "P_bench": "Bench pixels",
        "P_stool": "Stool pixels",
        "P_trashcan": "Trash can pixels",
        "P_table": "Table pixels",
        "P_armchair": "Armchair pixels",
        "P_light": "Light pixels",
        "P_streetlight": "Street light pixels",
        "P_bulletinboard": "Bulletin board pixels",
        "P_all": "Total pixels in image"
    },
    
    # Additional metadata
    "output_range": {
        "min": 0.0,
        "max": 1.0,
        "description": "0 = no public facilities; 1 = all public facilities"
    },
    "algorithm": "Sum of facility class pixels / Total pixels",
    "note": "Higher values indicate more public amenities visible in the scene"
}

print(f"\n✅ Calculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f"   Formula: {INDICATOR['formula']}")
print(f"   Type: TYPE A (Simple Pixel Ratio)")


# =============================================================================
# PUBLIC FACILITY CLASS IDENTIFICATION
# =============================================================================
# Keywords to identify public facility classes in semantic segmentation
# These are matched against class names (case-insensitive, partial match)
FACILITY_KEYWORDS = [
    "chair",
    "toilet",
    "bench",
    "stool",
    "trashcan", "trash can", "trash_can", "trash", "bin", "garbage",
    "table",
    "armchair", "arm chair", "arm_chair",
    "light", "lamp",
    "streetlight", "street light", "street_light", "streetlamp", "street lamp",
    "bulletinboard", "bulletin board", "bulletin_board", "signboard", "notice board"
]

# Default facility colors (if no semantic config provided)
# These are commonly used colors in segmentation datasets
DEFAULT_FACILITY_COLORS = {
    "chair": (200, 200, 100),
    "bench": (180, 180, 60),
    "streetlight": (255, 255, 128),
    "light": (255, 255, 200),
    "trashcan": (128, 128, 64)
}


def is_facility_class(class_name: str) -> bool:
    """
    Check if a class name represents a public facility.
    
    Args:
        class_name: Name of the semantic class
        
    Returns:
        bool: True if class is a public facility
    """
    class_lower = class_name.lower().replace("-", " ").replace("_", " ")
    
    for keyword in FACILITY_KEYWORDS:
        keyword_lower = keyword.lower()
        if keyword_lower in class_lower:
            return True
    
    return False


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str, 
                        semantic_colors: Dict[str, Tuple[int, int, int]] = None) -> Dict:
    """
    Calculate the Public-Facility Convenience Index (PCI) indicator.
    
    TYPE A - Simple Pixel Ratio
    
    Formula:
        PCI = Sum(facility_pixels) / Total_pixels
        
    Facility classes include: chair, toilet, bench, stool, trashcan, 
    table, armchair, light, streetlight, bulletinboard
    
    Args:
        image_path: Path to the semantic segmentation mask image
        semantic_colors: Dictionary mapping class names to RGB tuples.
                        If not provided, uses default facility colors.
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): PCI ratio (0 to 1)
            - 'facility_pixels' (int): Total facility pixels
            - 'total_pixels' (int): Total image pixels
            - 'facility_coverage_pct' (float): Facility coverage percentage
            - 'n_facility_classes' (int): Number of facility classes found
            - 'facility_classes_found' (dict): Pixel counts by facility class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"PCI: {result['value']:.4f}")
        ...     print(f"Facility coverage: {result['facility_coverage_pct']:.2f}%")
    """
    try:
        # Step 1: Load and prepare the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Step 2: Create facility mask and count by class
        facility_mask = np.zeros((h, w), dtype=np.uint8)
        facility_classes_found = {}
        
        if semantic_colors:
            # Use provided semantic color configuration
            for class_name, rgb in semantic_colors.items():
                if is_facility_class(class_name):
                    mask = np.all(pixels == rgb, axis=2)
                    count = int(np.sum(mask))
                    if count > 0:
                        facility_mask[mask] = 1
                        facility_classes_found[class_name] = count
        else:
            # Use default facility colors (fallback)
            for class_name, rgb in DEFAULT_FACILITY_COLORS.items():
                mask = np.all(pixels == rgb, axis=2)
                count = int(np.sum(mask))
                if count > 0:
                    facility_mask[mask] = 1
                    facility_classes_found[class_name] = count
        
        # Step 3: Calculate PCI
        facility_pixels = int(np.sum(facility_mask > 0))
        pci = facility_pixels / total_pixels if total_pixels > 0 else 0.0
        
        # Step 4: Calculate additional metrics
        n_facility_classes = len(facility_classes_found)
        facility_coverage_pct = pci * 100
        
        # Sort facility classes by pixel count
        sorted_facilities = dict(sorted(
            facility_classes_found.items(), 
            key=lambda x: x[1], 
            reverse=True
        ))
        
        # Step 5: Return results
        return {
            'success': True,
            'value': round(pci, 4),
            'facility_pixels': facility_pixels,
            'total_pixels': int(total_pixels),
            'non_facility_pixels': int(total_pixels - facility_pixels),
            'facility_coverage_pct': round(facility_coverage_pct, 2),
            'n_facility_classes': n_facility_classes,
            'facility_classes_found': sorted_facilities,
            'dominant_facility': list(sorted_facilities.keys())[0] if sorted_facilities else None
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
def interpret_pci(pci: float) -> str:
    """
    Interpret the Public-Facility Convenience Index value.
    
    Args:
        pci: PCI ratio (0 to 1)
        
    Returns:
        str: Qualitative interpretation
    """
    if pci is None:
        return "Unable to interpret (no data)"
    elif pci < 0.001:
        return "No public facilities detected in view"
    elif pci < 0.01:
        return "Minimal public facilities present"
    elif pci < 0.03:
        return "Some public facilities visible"
    elif pci < 0.05:
        return "Moderate public facility presence"
    elif pci < 0.10:
        return "Good public facility coverage"
    else:
        return "High public facility coverage"


def get_facility_categories() -> Dict[str, List[str]]:
    """
    Get categorized list of public facility types.
    
    Returns:
        dict: Categories and their facility types
    """
    return {
        "Seating": ["chair", "bench", "stool", "armchair"],
        "Lighting": ["light", "lamp", "streetlight", "street lamp"],
        "Sanitation": ["toilet", "trashcan", "bin", "garbage"],
        "Furniture": ["table"],
        "Information": ["bulletinboard", "signboard", "notice board"]
    }


def explain_formula() -> str:
    """
    Provide educational explanation of the PCI formula.
    
    Returns:
        str: Explanation text
    """
    return """
    Public-Facility Convenience Index (PCI) Formula:
    
    PCI = (P_chair + P_toilet + P_bench + P_stool + P_trashcan + 
           P_table + P_armchair + P_light + P_streetlight + 
           P_bulletinboard) / P_all
    
    Simplified as:
    PCI = Sum(facility_pixels) / Total_pixels
    
    Components:
    - Seating: chairs, benches, stools, armchairs
    - Lighting: lights, streetlights, lamps
    - Sanitation: toilets, trash cans, bins
    - Furniture: tables
    - Information: bulletin boards, signboards
    
    Interpretation:
    - PCI ≈ 0: No public facilities in view
    - PCI ≈ 0.01: Minimal facilities (1% of view)
    - PCI ≈ 0.05: Moderate facilities (5% of view)
    - PCI > 0.10: High facility coverage
    
    Note: In typical street scenes, PCI values are usually small 
    (< 5%) because public facilities occupy a small portion of 
    the visual field compared to buildings, roads, and sky.
    
    Higher PCI values indicate:
    - Better street amenities
    - More pedestrian-friendly environment
    - Higher level of urban service provision
    """


# =============================================================================
# STANDALONE TEST (Optional)
# =============================================================================
if __name__ == "__main__":
    import os
    
    print("\n🧪 Testing Public-Facility Convenience Index calculator...")
    
    # Test 1: No facilities (all sky)
    test_img_1 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_1[:, :] = [135, 206, 235]  # Sky blue
    
    test_path_1 = '/tmp/test_pci_1.png'
    Image.fromarray(test_img_1).save(test_path_1)
    
    test_semantic_1 = {"sky": (135, 206, 235)}
    result_1 = calculate_indicator(test_path_1, test_semantic_1)
    
    print(f"\n   Test 1: No facilities (100% sky)")
    print(f"      Expected PCI: 0.0000")
    print(f"      Calculated PCI: {result_1.get('value', 'N/A')}")
    print(f"      Interpretation: {interpret_pci(result_1.get('value'))}")
    
    os.remove(test_path_1)
    
    # Test 2: Some bench pixels (5%)
    test_img_2 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_2[:, :] = [128, 128, 128]  # Gray (road)
    test_img_2[:5, :] = [139, 90, 43]   # Brown (bench) - 5%
    
    test_path_2 = '/tmp/test_pci_2.png'
    Image.fromarray(test_img_2).save(test_path_2)
    
    test_semantic_2 = {"road": (128, 128, 128), "bench": (139, 90, 43)}
    result_2 = calculate_indicator(test_path_2, test_semantic_2)
    
    print(f"\n   Test 2: 5% bench coverage")
    print(f"      Expected PCI: 0.0500")
    print(f"      Calculated PCI: {result_2.get('value', 'N/A')}")
    print(f"      Facility classes: {result_2.get('facility_classes_found', {})}")
    print(f"      Interpretation: {interpret_pci(result_2.get('value'))}")
    
    os.remove(test_path_2)
    
    # Test 3: Multiple facility types
    test_img_3 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_3[:, :] = [128, 128, 128]       # Gray (road) - base
    test_img_3[:3, :] = [139, 90, 43]        # Brown (bench) - 3%
    test_img_3[3:5, :] = [255, 255, 128]     # Yellow (streetlight) - 2%
    test_img_3[5:6, :] = [0, 100, 0]         # Green (trashcan) - 1%
    
    test_path_3 = '/tmp/test_pci_3.png'
    Image.fromarray(test_img_3).save(test_path_3)
    
    test_semantic_3 = {
        "road": (128, 128, 128), 
        "bench": (139, 90, 43),
        "streetlight": (255, 255, 128),
        "trashcan": (0, 100, 0)
    }
    result_3 = calculate_indicator(test_path_3, test_semantic_3)
    
    print(f"\n   Test 3: Multiple facilities (3% bench + 2% streetlight + 1% trashcan)")
    print(f"      Expected PCI: 0.0600")
    print(f"      Calculated PCI: {result_3.get('value', 'N/A')}")
    print(f"      Facility classes: {result_3.get('n_facility_classes', 0)}")
    print(f"      Breakdown: {result_3.get('facility_classes_found', {})}")
    print(f"      Interpretation: {interpret_pci(result_3.get('value'))}")
    
    os.remove(test_path_3)
    
    # Test 4: High facility coverage (10%)
    test_img_4 = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img_4[:, :] = [128, 128, 128]   # Gray (road)
    test_img_4[:10, :] = [139, 90, 43]   # Brown (bench) - 10%
    
    test_path_4 = '/tmp/test_pci_4.png'
    Image.fromarray(test_img_4).save(test_path_4)
    
    result_4 = calculate_indicator(test_path_4, test_semantic_3)
    
    print(f"\n   Test 4: High facility coverage (10% bench)")
    print(f"      Expected PCI: 0.1000")
    print(f"      Calculated PCI: {result_4.get('value', 'N/A')}")
    print(f"      Interpretation: {interpret_pci(result_4.get('value'))}")
    
    os.remove(test_path_4)
    
    print("\n   ✅ Test complete!")
    print("\n   📝 Facility keywords used:", FACILITY_KEYWORDS[:5], "...")
