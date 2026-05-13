"""Calculator Layer.

Indicator ID:   IND_WLD
Indicator Name: Wildness
Type:           TYPE C (arctan-ratio

Formula: IND_WLD = arctan( Flora_pixels / (Grass_pixels + Non_natural_pixels) )
"""

import numpy as np
from PIL import Image
from typing import Dict

# semantic_colors input_layer.py
from input_layer import semantic_colors


# =============================================================================
# INDICATOR DEFINITION -
# =============================================================================
INDICATOR = {
    "id": "IND_WLD",
    "name": "Wildness",
    "unit": "radian",  # arctan
    "formula": "arctan(Flora / (Grass + Non_natural))",
    "target_direction": "INCREASE",
    "definition": (
        "An arctangent-transformed ratio of flora pixels to grass and "
        "non-natural elements, indicating the degree of urban wildness "
        "versus generic or artificial nature."
    ),
    "category": "CAT_CMP",

    "calc_type": "atan_ratio",

    "numerator_classes": [
        "plant;flora;plant;life",
        "bush",
        "shrub",
    ],

    "grass_classes": [
        "grass",
    ],

    "non_natural_classes": [
        "road",
        "sidewalk",
        "building",
        "wall",
        "fence",
        "car",
        "person",
    ]
}


# =============================================================================
# COLOR LOOKUP TABLE
# =============================================================================
NUM_RGB = {}
GRASS_RGB = {}
NONNAT_RGB = {}

print(f"\nBuilding color lookup for {INDICATOR['id']}:")

print(" ▶ Flora (numerator) classes:")
for class_name in INDICATOR["numerator_classes"]:
    if class_name in semantic_colors:
        NUM_RGB[semantic_colors[class_name]] = class_name
        print(f" {class_name}")
    else:
        print(f" ️ NOT FOUND: {class_name}")

print(" ▶ Grass classes:")
for class_name in INDICATOR["grass_classes"]:
    if class_name in semantic_colors:
        GRASS_RGB[semantic_colors[class_name]] = class_name
        print(f" {class_name}")
    else:
        print(f" ️ NOT FOUND: {class_name}")

print(" ▶ Non-natural classes:")
for class_name in INDICATOR["non_natural_classes"]:
    if class_name in semantic_colors:
        NONNAT_RGB[semantic_colors[class_name]] = class_name
        print(f" {class_name}")
    else:
        print(f" ️ NOT FOUND: {class_name}")

print(
    f"\nCalculator ready: {INDICATOR['id']} "
    f"(flora={len(NUM_RGB)}, grass={len(GRASS_RGB)}, non-natural={len(NONNAT_RGB)})"
)


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str) -> Dict:
    try:
        img = Image.open(image_path).convert("RGB")
        pixels = np.array(img)
        h, w, _ = pixels.shape
        flat_pixels = pixels.reshape(-1, 3)

        flora_count = 0
        grass_count = 0
        nonnat_count = 0

        class_counts = {}

        # Flora
        for rgb, name in NUM_RGB.items():
            m = np.all(flat_pixels == rgb, axis=1)
            c = int(np.sum(m))
            if c > 0:
                flora_count += c
                class_counts[name] = c

        # Grass
        for rgb, name in GRASS_RGB.items():
            m = np.all(flat_pixels == rgb, axis=1)
            c = int(np.sum(m))
            if c > 0:
                grass_count += c
                class_counts[name] = c

        # Non-natural
        for rgb, name in NONNAT_RGB.items():
            m = np.all(flat_pixels == rgb, axis=1)
            c = int(np.sum(m))
            if c > 0:
                nonnat_count += c
                class_counts[name] = c

        denom = grass_count + nonnat_count
        ratio = flora_count / denom if denom > 0 else 0.0
        value = float(np.arctan(ratio))

        return {
            "success": True,
            "value": round(value, 6),
            "flora_pixels": flora_count,
            "grass_pixels": grass_count,
            "non_natural_pixels": nonnat_count,
            "class_breakdown": class_counts
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "value": None
        }


# =============================================================================
# TEST CODE
# =============================================================================
if __name__ == "__main__":
    print("\nTesting calculator...")

    test_img = np.zeros((100, 100, 3), dtype=np.uint8)

    # 20% flora, 20% grass, 40% non-natural
    if 'plant;flora;plant;life' in semantic_colors:
        test_img[0:20, :] = semantic_colors['plant;flora;plant;life']

    if 'grass' in semantic_colors:
        test_img[20:40, :] = semantic_colors['grass']

    if 'road' in semantic_colors:
        test_img[40:80, :] = semantic_colors['road']

    test_path = '/tmp/test_wld.png'
    Image.fromarray(test_img).save(test_path)

    result = calculate_indicator(test_path)
    print(f" Result: {result}")

    import os
    os.remove(test_path)


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
