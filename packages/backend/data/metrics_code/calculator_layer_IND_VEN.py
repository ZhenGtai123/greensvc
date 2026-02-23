"""
GreenSVC Stage 2.5 - Calculator Layer
================================================
Indicator ID: IND_VEN
Indicator Name: Visual Enclosure
Type: TYPE A (Ratio Mode - Multi-class)

Description:
    The Visual Enclosure (VEN) indicator quantifies the degree of spatial 
    enclosure created by vertical elements in street-level imagery. It measures 
    how much of the visual field is occupied by buildings, walls, trees, and 
    other vertical structures that block the view.
    
    High visual enclosure creates a sense of defined space and intimacy, 
    while low enclosure creates openness and expansiveness. The optimal 
    level depends on context - some environments benefit from enclosure 
    (intimate urban spaces) while others need openness (parks, plazas).

Formula: 
    VEN = (Pixels_Vertical_Elements / Pixels_Total) × 100
    
Alternative Formula:
    VEN ≈ 100 - Sky_View_Factor (SVF)

Variables:
    - Pixels_Vertical_Elements: Sum of pixels classified as buildings, walls, 
      trees, and other vertical structures
    - Pixels_Total: Total number of pixels in the image

Target Classes (Vertical Elements):
    1. Buildings: building, house, skyscraper, hovel/hut/shack
    2. Walls & Barriers: wall, fence, railing, bannister/balustrade
    3. Trees & Vegetation: tree, palm tree, plants
    4. Vertical Infrastructure: column/pillar, pole, tower, streetlight, 
       signboard, awning, booth/kiosk
"""

import numpy as np
from PIL import Image
from typing import Dict, List, Tuple


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    # Basic Information
    "id": "IND_VEN",
    "name": "Visual Enclosure",
    "unit": "%",
    "formula": "(Pixels_Vertical_Elements / Pixels_Total) × 100",
    "formula_alt": "100 - Sky_View_Factor",
    "target_direction": "NEUTRAL",  # Optimal enclosure depends on context
    "definition": "Degree of spatial enclosure from vertical elements",
    "category": "CAT_CFG",
    
    # TYPE A Configuration
    "calc_type": "ratio",
    
    # Target Classes - Vertical Elements (organized by type)
    "target_classes": {
        # Buildings and structures
        "buildings": [
            "building;edifice",
            "house",
            "skyscraper",
            "hovel;hut;hutch;shack;shanty",
            "booth;cubicle;stall;kiosk",
            "tower"
        ],
        # Walls and barriers
        "walls_barriers": [
            "wall",
            "fence;fencing",
            "railing;rail",
            "bannister;banister;balustrade;balusters;handrail"
        ],
        # Trees and vertical vegetation
        "vegetation": [
            "tree",
            "palm;palm;tree",
            "plant;flora;plant;life"
        ],
        # Vertical infrastructure
        "infrastructure": [
            "column;pillar",
            "pole",
            "streetlight;street;lamp",
            "signboard;sign",
            "awning;sunshade;sunblind"
        ]
    },
    
    # Flatten all classes for calculation
    "all_target_classes": [
        # Buildings
        "building;edifice",
        "house",
        "skyscraper",
        "hovel;hut;hutch;shack;shanty",
        "booth;cubicle;stall;kiosk",
        "tower",
        # Walls & Barriers
        "wall",
        "fence;fencing",
        "railing;rail",
        "bannister;banister;balustrade;balusters;handrail",
        # Trees & Vegetation
        "tree",
        "palm;palm;tree",
        "plant;flora;plant;life",
        # Infrastructure
        "column;pillar",
        "pole",
        "streetlight;street;lamp",
        "signboard;sign",
        "awning;sunshade;sunblind"
    ],
    
    # Metadata
    "variables": {
        "Pixels_Vertical_Elements": "Sum of pixels classified as buildings, walls, trees, and other vertical structures",
        "Pixels_Total": "Total number of pixels in the image"
    },
    "note": "Measures visual enclosure; neutral target direction as optimal level depends on urban context"
}

print(f"\n✅ Calculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f"   Type: TYPE A (ratio)")
print(f"   Target direction: {INDICATOR['target_direction']}")


# =============================================================================
# BUILD COLOR LOOKUP TABLE
# =============================================================================
TARGET_RGB = {}
TARGET_RGB_BY_CATEGORY = {}

print(f"\n🎯 Building color lookup for vertical element classes:")

# Build lookup by category
for category, class_list in INDICATOR.get('target_classes', {}).items():
    TARGET_RGB_BY_CATEGORY[category] = {}
    print(f"\n   📦 {category}:")
    
    for class_name in class_list:
        if class_name in semantic_colors:
            rgb = semantic_colors[class_name]
            TARGET_RGB[rgb] = class_name
            TARGET_RGB_BY_CATEGORY[category][rgb] = class_name
            print(f"      ✅ {class_name}: RGB{rgb}")
        else:
            print(f"      ⚠️ NOT FOUND: {class_name}")

total_classes = len(TARGET_RGB)
print(f"\n✅ Total vertical element classes loaded: {total_classes}")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str) -> Dict:
    """
    Calculate the Visual Enclosure (VEN) indicator for an image.
    
    TYPE A - Ratio Mode (Multi-class)
    
    Algorithm:
    1. Load the semantic segmentation mask image
    2. Count pixels belonging to vertical element classes (buildings, walls, trees, infrastructure)
    3. Calculate the ratio: (vertical_pixels / total_pixels) × 100
    
    Args:
        image_path: Path to the semantic segmentation mask image
        
    Returns:
        dict: Result dictionary containing:
            - 'success' (bool): Whether calculation succeeded
            - 'value' (float): Visual Enclosure percentage (0-100)
            - 'vertical_pixels' (int): Count of vertical element pixels
            - 'total_pixels' (int): Total pixel count
            - 'category_breakdown' (dict): Pixels by category (buildings, walls, vegetation, infrastructure)
            - 'class_breakdown' (dict): Pixels by individual class
            - 'error' (str): Error message if success is False
            
    Example:
        >>> result = calculate_indicator('/path/to/mask.png')
        >>> if result['success']:
        ...     print(f"Visual Enclosure: {result['value']:.1f}%")
        ...     print(f"Building contribution: {result['category_breakdown']['buildings']}px")
    """
    try:
        # Step 1: Load and prepare the image
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        
        # Reshape for efficient comparison
        flat_pixels = pixels.reshape(-1, 3)
        
        # Step 2: Count pixels by category
        category_counts = {category: 0 for category in INDICATOR.get('target_classes', {}).keys()}
        class_breakdown = {}
        total_vertical_pixels = 0
        
        for category, rgb_map in TARGET_RGB_BY_CATEGORY.items():
            category_total = 0
            
            for rgb, class_name in rgb_map.items():
                # Create boolean mask for this class
                mask = np.all(flat_pixels == rgb, axis=1)
                count = np.sum(mask)
                
                if count > 0:
                    class_breakdown[class_name] = int(count)
                    category_total += count
            
            category_counts[category] = int(category_total)
            total_vertical_pixels += category_total
        
        # Step 3: Calculate the visual enclosure ratio
        if total_pixels > 0:
            enclosure_ratio = (total_vertical_pixels / total_pixels) * 100
        else:
            enclosure_ratio = 0
        
        # Step 4: Calculate category ratios
        category_ratios = {}
        for category, count in category_counts.items():
            category_ratios[category] = round((count / total_pixels) * 100, 3) if total_pixels > 0 else 0
        
        # Step 5: Return results
        return {
            'success': True,
            'value': round(enclosure_ratio, 3),
            'vertical_pixels': int(total_vertical_pixels),
            'total_pixels': int(total_pixels),
            'category_breakdown': category_counts,
            'category_ratios': category_ratios,
            'class_breakdown': class_breakdown,
            'estimated_svf': round(100 - enclosure_ratio, 3)  # Approximate SVF
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
def interpret_enclosure(value: float) -> str:
    """
    Interpret the visual enclosure value.
    
    Note: Optimal enclosure depends on context. This interpretation
    describes the enclosure level, not whether it's good or bad.
    
    Args:
        value: Visual Enclosure percentage (0-100)
        
    Returns:
        str: Interpretation of the enclosure level
    """
    if value is None:
        return "Unable to interpret (no value)"
    elif value < 20:
        return "Very open: minimal vertical elements"
    elif value < 40:
        return "Open: low enclosure, expansive views"
    elif value < 60:
        return "Moderate: balanced enclosure"
    elif value < 80:
        return "Enclosed: significant vertical presence"
    else:
        return "Highly enclosed: dominated by vertical elements"


# =============================================================================
# STANDALONE TEST (Optional)
# =============================================================================
if __name__ == "__main__":
    import os
    
    print("\n🧪 Testing Visual Enclosure calculator...")
    
    # Create test image with known composition
    # 40% building + 15% wall + 15% tree + 10% pole = 80% vertical elements
    test_img = np.zeros((100, 100, 3), dtype=np.uint8)
    
    # Add building (40%)
    if 'building;edifice' in semantic_colors:
        test_img[0:40, :] = semantic_colors['building;edifice']
    
    # Add wall (15%)
    if 'wall' in semantic_colors:
        test_img[40:55, :] = semantic_colors['wall']
    
    # Add tree (15%)
    if 'tree' in semantic_colors:
        test_img[55:70, :] = semantic_colors['tree']
    
    # Add pole (10%)
    if 'pole' in semantic_colors:
        test_img[70:80, :] = semantic_colors['pole']
    
    # Remaining 20% is sky (non-vertical, not counted)
    if 'sky' in semantic_colors:
        test_img[80:100, :] = semantic_colors['sky']
    
    # Save and test
    test_path = '/tmp/test_ven.png'
    Image.fromarray(test_img).save(test_path)
    
    result = calculate_indicator(test_path)
    
    print(f"\n   Test composition: 40% building + 15% wall + 15% tree + 10% pole + 20% sky")
    print(f"   Expected enclosure: ~80%")
    print(f"   Calculated: {result['value']}%")
    print(f"   Estimated SVF: {result.get('estimated_svf', 'N/A')}%")
    print(f"\n   Category breakdown:")
    for cat, val in result.get('category_ratios', {}).items():
        print(f"      • {cat}: {val}%")
    print(f"\n   Interpretation: {interpret_enclosure(result['value'])}")
    
    # Cleanup
    os.remove(test_path)
    print("\n   🧹 Test cleanup complete")
