"""Calculator Layer.

Indicator ID:   IND_CSI
Indicator Name: Color Saturation Index
Type:           TYPE C
"""

import numpy as np
from PIL import Image
from typing import Dict
import os


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    "id": "IND_CSI",
    "name": "Color Saturation Index",
    "unit": "intensity",
    "formula": "CSI = sigma_rgyb + 0.3 * mu_rgyb",
    "target_direction": "POSITIVE",
    "definition": "Color saturation/vividness computed from RGB channels using rgyb components",
    "category": "CAT_CMP",

    "calc_type": "custom",

    "variables": {
        "sigma": "Standard deviation",
        "mu": "Mean",
        "rg": "R - G",
        "yb": "0.5*(R + G) - B",
        "sigma_rgyb": "sqrt(std(rg)^2 + std(yb)^2)",
        "mu_rgyb": "sqrt(mean(rg)^2 + mean(yb)^2)"
    },

    # TYPE C
    "use_original_image": False,
    "original_image_path": None
}

print(f"\nCalculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f" Formula: {INDICATOR['formula']}")
print(f" Use original image: {INDICATOR.get('use_original_image', False)}")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str) -> Dict:
    try:
        # Step 1:
        actual_path = image_path
        image_source = 'mask'

        if INDICATOR.get('use_original_image', False):
            original_base = INDICATOR.get('original_image_path')
            if original_base:
                if 'mask' in image_path:
                    relative = image_path.split('mask')[-1]
                    for ext in ['.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG']:
                        test_path = original_base + relative.rsplit('.', 1)[0] + ext
                        if os.path.exists(test_path):
                            actual_path = test_path
                            image_source = 'original'
                            break

        # Step 2:
        img = Image.open(actual_path).convert('RGB')
        pixels = np.array(img, dtype=np.float64)

        h, w, _ = pixels.shape
        total_pixels = h * w

        R = pixels[:, :, 0]
        G = pixels[:, :, 1]
        B = pixels[:, :, 2]

        # Step 3: rgyb
        rg = R - G
        yb = 0.5 * (R + G) - B

        # Step 4: sigma_rgyb mu_rgyb
        rg_mean = float(np.mean(rg))
        yb_mean = float(np.mean(yb))
        rg_std = float(np.std(rg))
        yb_std = float(np.std(yb))

        sigma_rgyb = float(np.sqrt(rg_std ** 2 + yb_std ** 2))
        mu_rgyb = float(np.sqrt(rg_mean ** 2 + yb_mean ** 2))

        # Step 5: CSI
        csi = sigma_rgyb + 0.3 * mu_rgyb

        return {
            'success': True,
            'value': round(float(csi), 3),
            'sigma_rgyb': round(float(sigma_rgyb), 3),
            'mu_rgyb': round(float(mu_rgyb), 3),
            'rg_stats': {
                'mean': round(rg_mean, 3),
                'std': round(rg_std, 3),
                'min': round(float(np.min(rg)), 3),
                'max': round(float(np.max(rg)), 3)
            },
            'yb_stats': {
                'mean': round(yb_mean, 3),
                'std': round(yb_std, 3),
                'min': round(float(np.min(yb)), 3),
                'max': round(float(np.max(yb)), 3)
            },
            'dimensions': {'height': h, 'width': w},
            'total_pixels': int(total_pixels),
            'image_source': image_source,
            'actual_path': actual_path
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'value': None
        }


# =============================================================================
# HELPER FUNCTIONS CSI
# =============================================================================
def interpret_csi(csi: float) -> str:
    if csi < 10:
        return "Low saturation: muted colors"
    elif csi < 25:
        return "Medium-low saturation"
    elif csi < 45:
        return "Medium saturation"
    elif csi < 70:
        return "High saturation: vivid colors"
    else:
        return "Very high saturation: extremely vivid colors"


# =============================================================================
# TEST CODE
# =============================================================================
if __name__ == "__main__":
    print("\nTesting Color Saturation Index calculator...")

    test_gray = np.full((100, 100, 3), 128, dtype=np.uint8)

    test_vivid = np.zeros((120, 120, 3), dtype=np.uint8)
    test_vivid[0:40, :, :] = [255, 0, 0]
    test_vivid[40:80, :, :] = [0, 255, 0]
    test_vivid[80:120, :, :] = [0, 0, 255]

    for name, test_img in [('Gray', test_gray), ('Vivid', test_vivid)]:
        test_path = f'/tmp/test_csi_{name}.png'
        Image.fromarray(test_img).save(test_path)

        result = calculate_indicator(test_path)

        print(f"\n{name}:")
        print(f" CSI: {result['value']}")
        print(f" sigma_rgyb: {result['sigma_rgyb']}")
        print(f" mu_rgyb: {result['mu_rgyb']}")
        print(f" Interpretation: {interpret_csi(result['value'])}")

        os.remove(test_path)
