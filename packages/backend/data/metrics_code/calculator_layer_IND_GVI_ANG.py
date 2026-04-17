"""Calculator Layer.

Indicator ID:   IND_GVI_ANG
Indicator Name: Green View Index by Vertical Angle
Type:           TYPE A (ratio /

Formula: IND_GVI_ANG(zone) = (Sum(Veg Pixels in zone) / Sum(Total Pixels in zone)) × 100
"""

import numpy as np
from PIL import Image
from typing import Dict, List, Tuple

# semantic_colors input_layer.py
from input_layer import semantic_colors


# =============================================================================
# INDICATOR DEFINITION -
# =============================================================================
INDICATOR = {
    "id": "IND_GVI_ANG",
    "name": "Green View Index by Vertical Angle",
    "unit": "%",
    "formula": "GVI(zone) = (Sum(Veg Pixels in zone) / Sum(Total Pixels in zone)) × 100",
    "target_direction": "INCREASE",  # INCREASE / DECREASE / NEUTRAL
    "definition": "Proportion of vegetation pixels within specific vertical angular (latitudinal) zones of a fisheye-projected sky map centered on zenith.",
    "category": "CAT_CMP",

    "projection": "Orthographic (Fisheye)",
    "zones_deg": [0.0, 22.5, 45.0, 67.5, 90.0],  # 4 0-22.5, 22.5-45, 45-67.5, 67.5-90

    # - Excel Name
    "target_classes": [
        "grass",
        "tree",
        "plant;flora;plant;life",
    ]
}


# =============================================================================
# COLOR LOOKUP TABLE ( input_layer.py semantic_colors )
# =============================================================================
TARGET_RGB = {}

print(f"\nBuilding color lookup for {INDICATOR['id']}:")
for class_name in INDICATOR.get('target_classes', []):
    if class_name in semantic_colors:
        rgb = semantic_colors[class_name]
        TARGET_RGB[rgb] = class_name
        print(f" {class_name}: RGB{rgb}")
    else:
        print(f" ️ NOT FOUND: {class_name}")
        for name in semantic_colors.keys():
            if class_name.split(';')[0] in name or name.split(';')[0] in class_name:
                print(f" Did you mean: '{name}'?")
                break

print(f"\nCalculator ready: {INDICATOR['id']} ({len(TARGET_RGB)} classes matched)")


# =============================================================================
# Orthographic projection
# =============================================================================
def _build_zone_pairs(z_edges: List[float]) -> List[Tuple[float, float]]:
    pairs = []
    for i in range(len(z_edges) - 1):
        pairs.append((float(z_edges[i]), float(z_edges[i + 1])))
    return pairs


def _compute_zenith_angles_deg(h: int, w: int) -> np.ndarray:
    cy = (h - 1) / 2.0
    cx = (w - 1) / 2.0
    R = min(cx, cy)

    yy, xx = np.indices((h, w))
    dx = xx - cx
    dy = yy - cy
    r = np.sqrt(dx * dx + dy * dy)

    inside = r <= R
    theta = np.full((h, w), np.nan, dtype=np.float32)

    # r/R > 1
    rr = np.clip(r[inside] / R, 0.0, 1.0)
    theta[inside] = np.degrees(np.arcsin(rr)).astype(np.float32)
    return theta


def _zone_label(z0: float, z1: float) -> str:
    return f"{z0:g}-{z1:g}"


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str) -> Dict:
    try:
        # Step 1:
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)
        h, w, _ = pixels.shape

        # Step 2: theta deg
        theta_deg = _compute_zenith_angles_deg(h, w)
        zone_pairs = _build_zone_pairs(INDICATOR["zones_deg"])

        # Step 3: RGB
        flat_pixels = pixels.reshape(-1, 3)
        veg_mask_flat = np.zeros(flat_pixels.shape[0], dtype=bool)

        class_counts = {}
        for rgb, class_name in TARGET_RGB.items():
            m = np.all(flat_pixels == rgb, axis=1)
            c = int(np.sum(m))
            if c > 0:
                class_counts[class_name] = c
                veg_mask_flat |= m

        veg_mask = veg_mask_flat.reshape(h, w)

        # Step 4:
        zone_values = {}
        zone_pixels = {}
        zone_target_pixels = {}
        zone_class_breakdown = {}

        # mask
        class_masks = {}
        for rgb, class_name in TARGET_RGB.items():
            class_masks[class_name] = np.all(pixels == rgb, axis=-1)

        for z0, z1 in zone_pairs:
            label = _zone_label(z0, z1)

            if z1 >= 90.0:
                in_zone = (theta_deg >= z0) & (theta_deg <= z1)
            else:
                in_zone = (theta_deg >= z0) & (theta_deg < z1)

            # theta NaN False
            total_in_zone = int(np.sum(in_zone))
            veg_in_zone = int(np.sum(veg_mask & in_zone))

            zone_pixels[label] = total_in_zone
            zone_target_pixels[label] = veg_in_zone

            val = (veg_in_zone / total_in_zone) * 100 if total_in_zone > 0 else 0.0
            zone_values[label] = round(float(val), 3)

            zcb = {}
            for cls, cmask in class_masks.items():
                cnt = int(np.sum(cmask & in_zone))
                if cnt > 0:
                    zcb[cls] = cnt
            zone_class_breakdown[label] = zcb

        return {
            'success': True,
            'value': zone_values,
            'zone_pixels': zone_pixels,
            'zone_target_pixels': zone_target_pixels,
            'class_breakdown': class_counts,
            'zone_class_breakdown': zone_class_breakdown,
            'meta': {
                'projection': INDICATOR.get('projection'),
                'zones_deg': INDICATOR.get('zones_deg')
            }
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'value': None
        }


# =============================================================================
# TEST CODE
# =============================================================================
if __name__ == "__main__":
    print("\nTesting calculator...")

    h, w = 300, 300
    test_img = np.zeros((h, w, 3), dtype=np.uint8)

    cy = (h - 1) / 2.0
    cx = (w - 1) / 2.0
    R = min(cx, cy)

    yy, xx = np.indices((h, w))
    r = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    inside = r <= R

    # tree grass
    if 'tree' in semantic_colors:
        test_img[inside] = semantic_colors['tree']

    if 'grass' in semantic_colors:
        center = r <= (0.35 * R)
        test_img[center] = semantic_colors['grass']

    test_path = '/tmp/test_gvi_ang.png'
    Image.fromarray(test_img).save(test_path)

    result = calculate_indicator(test_path)
    print(f" Result: {result}")

    import os
    os.remove(test_path)
