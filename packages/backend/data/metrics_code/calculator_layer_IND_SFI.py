"""Calculator Layer.

Indicator ID:   IND_SFI
Indicator Name: Spatial Feasibility Index
Type:           TYPE D

Formula: SFI = Wn / Rn
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    "id": "IND_SFI",
    "name": "Spatial Feasibility Index",
    "unit": "ratio",
    "formula": "SFI = Wn / Rn",
    "target_direction": "POSITIVE",
    "definition": "Ratio of sidewalk pixels to car lane pixels indicating pedestrian space priority",
    "category": "CAT_CFG",

    "calc_type": "composite",

    "component_classes": {
        "Wn_sidewalk": [
            "sidewalk",
            "sidewalk;curb",
        ],
        "Rn_car_lane": [
            "road",               # car lane road
            "lane",
            "car lane",
            "driveway",           # /
        ]
    },

    "aggregation": "ratio"
}

print(f"\nCalculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f" Aggregation: {INDICATOR.get('aggregation', 'ratio')}")


# =============================================================================
# COLOR LOOKUP TABLE
# =============================================================================
COMPONENT_RGB = {}

print(f"\nColor lookup for components:")
for component_name, class_list in INDICATOR.get('component_classes', {}).items():
    COMPONENT_RGB[component_name] = {}
    print(f"\n {component_name}:")

    for class_name in class_list:
        if class_name in semantic_colors:
            rgb = semantic_colors[class_name]
            COMPONENT_RGB[component_name][rgb] = class_name
            print(f" {class_name}: RGB{rgb}")
        else:
            print(f" ️ NOT FOUND: {class_name}")

print(f"\nComponents configured: {list(COMPONENT_RGB.keys())}")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str) -> Dict:
    try:
        # Step 1:
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape
        total_pixels = h * w
        flat_pixels = pixels.reshape(-1, 3)

        # Step 2:
        component_counts = {"Wn_sidewalk": 0, "Rn_car_lane": 0}
        component_ratios = {"Wn_sidewalk": 0, "Rn_car_lane": 0}
        all_class_counts = {}

        for component_name, rgb_map in COMPONENT_RGB.items():
            component_total = 0

            for rgb, class_name in rgb_map.items():
                mask = np.all(flat_pixels == rgb, axis=1)
                count = np.sum(mask)
                if count > 0:
                    all_class_counts[class_name] = int(count)
                    component_total += count

            component_counts[component_name] = int(component_total)
            component_ratios[component_name] = round(
                (component_total / total_pixels) * 100, 3
            ) if total_pixels > 0 else 0

        Wn = int(component_counts.get("Wn_sidewalk", 0))
        Rn = int(component_counts.get("Rn_car_lane", 0))

        # Step 3:
        if Rn == 0:
            value = 0
            note = "Rn (car lane pixels) is zero"
        else:
            value = Wn / Rn
            note = None

        # Step 4:
        result = {
            'success': True,
            'value': round(float(value), 3),
            'total_pixels': int(total_pixels),
            'Wn': Wn,
            'Rn': Rn,
            'Wn_ratio': component_ratios.get("Wn_sidewalk", 0),
            'Rn_ratio': component_ratios.get("Rn_car_lane", 0),
            'component_pixels': component_counts,
            'component_ratios': component_ratios,
            'class_breakdown': all_class_counts
        }

        if note:
            result['note'] = note

        return result

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'value': None
        }


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================
def interpret_sfi(sfi: float) -> str:
    if sfi < 0.2:
        return "Very low pedestrian priority"
    elif sfi < 0.5:
        return "Low pedestrian priority"
    elif sfi < 1.0:
        return "Moderate pedestrian priority"
    else:
        return "High pedestrian priority"


# =============================================================================
# TEST CODE
# =============================================================================
if __name__ == "__main__":
    print("\nTesting Spatial Feasibility Index calculator...")

    test_img = np.zeros((100, 100, 3), dtype=np.uint8)

    if ('sidewalk' in semantic_colors) and ('road' in semantic_colors):
        test_img[0:30, :] = semantic_colors['sidewalk']  # 30% sidewalk
        test_img[30:90, :] = semantic_colors['road']     # 60% road (car lane proxy)

        test_path = '/tmp/test_sfi.png'
        Image.fromarray(test_img).save(test_path)

        result = calculate_indicator(test_path)

        print(f"\nTest: 30% sidewalk / 60% road => SFI ≈ 0.5")
        print(f" Result: {result['value']}")
        print(f" Wn: {result['Wn']}, Rn: {result['Rn']}")
        print(f" Interpretation: {interpret_sfi(result['value'])}")

        import os
        os.remove(test_path)
    else:
        print(" ️ Required classes not found in semantic_colors")


# =============================================================================
# LAYER-AWARE CALCULATION (auto-added 2026-05-11)
# =============================================================================
def calculate_for_layer(semantic_map_path, mask_path=None):
    """Layer-aware wrapper. If mask_path provided, masks the semantic map
    to that layer before computing; else computes whole-image.
    
    The default strategy: copy semantic map, set non-mask pixels to 0
    (which won't match any real ADE20K color), then run calculate_indicator.
    """
    import numpy as np
    from PIL import Image
    import tempfile, os
    
    if not mask_path or not os.path.exists(mask_path):
        return calculate_indicator(semantic_map_path)
    
    try:
        sem_img = Image.open(semantic_map_path).convert('RGB')
        sem_arr = np.array(sem_img)
        with Image.open(mask_path) as m:
            m = m.convert('L')
            if m.size != (sem_arr.shape[1], sem_arr.shape[0]):
                m = m.resize((sem_arr.shape[1], sem_arr.shape[0]), Image.NEAREST)
            mask_arr = np.array(m) > 127
        # Apply mask: non-mask pixels set to black (0,0,0)
        sem_arr[~mask_arr] = 0
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            Image.fromarray(sem_arr).save(tmp.name)
            tmp_path = tmp.name
        try:
            result = calculate_indicator(tmp_path)
        finally:
            try: os.unlink(tmp_path)
            except: pass
        return result
    except Exception as e:
        return {'success': False, 'value': None, 'error': f'layer-aware wrapper failed: {e}'}
