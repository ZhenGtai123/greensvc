"""Calculator Layer.

Indicator ID:   IND_VEG_DIV
Indicator Name: Vegetation Diversity Index (Vegetation Diversity /
Type:           TYPE B

Formula: )
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    "id": "IND_VEG_DIV",
    "name": "Vegetation Diversity Index",
    "unit": "dimensionless",
    "formula": "1 - ((Tn/GVIn)^2 + (Pn/GVIn)^2 + (Gn/GVIn)^2)",
    "target_direction": "POSITIVE",
    "definition": "Simpson-like diversity index of vegetation composition within GVI (tree/grass/plant)",
    "category": "CAT_CMP",

    "calc_type": "custom",

    "variables": {
        "Tn": "Percentage of trees",
        "Gn": "Percentage of grass",
        "Pn": "Percentage of plants",
        "GVIn": "Green View Index for the image (Tn + Pn + Gn)"
    }
}

print(f"\nCalculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f" Formula: {INDICATOR['formula']}")


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

        # Step 2: tree / grass / plant
        target_classes = ['tree', 'grass', 'plant']
        class_counts = {}

        for class_name in target_classes:
            if class_name not in semantic_colors:
                continue
            rgb = semantic_colors[class_name]
            mask = np.all(flat_pixels == rgb, axis=1)
            count = int(np.sum(mask))
            if count > 0:
                class_counts[class_name] = count

        matched_pixels = sum(class_counts.values())
        unmatched_pixels = total_pixels - matched_pixels

        if matched_pixels == 0:
            return {
                'success': True,
                'value': 0,
                'Tn': 0,
                'Pn': 0,
                'Gn': 0,
                'GVIn': 0,
                'total_pixels': int(total_pixels),
                'matched_pixels': 0,
                'unmatched_pixels': int(unmatched_pixels),
                'class_distribution': {},
                'note': 'No vegetation classes detected in image'
            }

        # Step 3: Tn/Pn/Gn
        Tn = class_counts.get('tree', 0)
        Pn = class_counts.get('plant', 0)
        Gn = class_counts.get('grass', 0)

        GVIn = Tn + Pn + Gn

        if GVIn == 0:
            return {
                'success': True,
                'value': 0,
                'Tn': 0,
                'Pn': 0,
                'Gn': 0,
                'GVIn': 0,
                'total_pixels': int(total_pixels),
                'matched_pixels': int(matched_pixels),
                'unmatched_pixels': int(unmatched_pixels),
                'class_distribution': class_counts,
                'note': 'GVIn is zero'
            }

        # Step 4: VEG_DIV = 1 - Σ(pᵢ²)
        pt = Tn / GVIn
        pp = Pn / GVIn
        pg = Gn / GVIn

        veg_div = 1 - (pt ** 2 + pp ** 2 + pg ** 2)

        # Step 5:
        return {
            'success': True,
            'value': round(float(veg_div), 3),
            'Tn': round(float(pt), 3),
            'Pn': round(float(pp), 3),
            'Gn': round(float(pg), 3),
            'GVIn': round(float(GVIn / total_pixels), 3),
            'total_pixels': int(total_pixels),
            'matched_pixels': int(matched_pixels),
            'unmatched_pixels': int(unmatched_pixels),
            'class_distribution': class_counts
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
def interpret_veg_div(value: float) -> str:
    if value < 0.2:
        return "Low diversity: dominated by one vegetation type"
    elif value < 0.4:
        return "Moderate diversity: some balance among vegetation types"
    else:
        return "High diversity: vegetation types are well balanced"


# =============================================================================
# TEST CODE
# =============================================================================
if __name__ == "__main__":
    print("\nTesting Vegetation Diversity calculator...")

    # - tree/grass/plant
    test_img = np.zeros((90, 90, 3), dtype=np.uint8)

    required = all(k in semantic_colors for k in ['tree', 'grass', 'plant'])
    if required:
        test_img[0:30, :] = semantic_colors['tree']
        test_img[30:60, :] = semantic_colors['grass']
        test_img[60:90, :] = semantic_colors['plant']

        test_path = '/tmp/test_veg_div.png'
        Image.fromarray(test_img).save(test_path)

        result = calculate_indicator(test_path)

        print(" Test: 1/3 tree + 1/3 grass + 1/3 plant")
        print(" Expected: 1 - 3*(1/3^2) = 0.667")
        print(f" Result: {result['value']}")
        print(f" Interpretation: {interpret_veg_div(result['value'])}")

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
