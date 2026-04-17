"""Calculator Layer.

Indicator ID:   IND_CPR
Indicator Name: Compression Ratio
Type:           TYPE C

Formula: Compression Ratio = Size_compressed / Size_original
"""

import numpy as np
from PIL import Image
from typing import Dict
import os
import tempfile


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    "id": "IND_CPR",
    "name": "Compression Ratio",
    "unit": "ratio",
    "formula": "Compression Ratio = Size_compressed / Size_original",
    "target_direction": "NEUTRAL",
    "definition": "Ratio between compressed JPEG size and original uncompressed image size as a proxy for information density",
    "category": "CAT_CMP",

    "calc_type": "custom",

    "variables": {
        "Size_{compressed}": "Size of the compressed image (JPEG)",
        "Size_{original}": "Original uncompressed image size (RGB)"
    },

    # TYPE C
    "jpeg_quality": 75  # JPEG 1-95
}

print(f"\nCalculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f" Formula: {INDICATOR['formula']}")
print(f" JPEG quality: {INDICATOR.get('jpeg_quality')}")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(image_path: str) -> Dict:
    try:
        # Step 1:
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img)

        h, w, c = pixels.shape

        # Step 2: RGB 1 byte/channel
        size_original = h * w * c  # bytes

        # Step 3: JPEG
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
            tmp_path = tmp.name

        img.save(
            tmp_path,
            format='JPEG',
            quality=INDICATOR.get('jpeg_quality', 75),
            optimize=True
        )

        # Step 4:
        size_compressed = os.path.getsize(tmp_path)

        # Step 5:
        compression_ratio = size_compressed / size_original if size_original > 0 else 0

        os.remove(tmp_path)

        return {
            'success': True,
            'value': round(float(compression_ratio), 4),
            'size_original_bytes': int(size_original),
            'size_compressed_bytes': int(size_compressed),
            'jpeg_quality': INDICATOR.get('jpeg_quality'),
            'dimensions': {'height': h, 'width': w}
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
def interpret_cpr(value: float) -> str:
    if value < 0.05:
        return "Very low ratio: highly regular or smooth image"
    elif value < 0.10:
        return "Low ratio: relatively simple visual structure"
    elif value < 0.20:
        return "Medium ratio: moderate information density"
    else:
        return "High ratio: complex texture and rich visual information"


# =============================================================================
# TEST CODE
# =============================================================================
if __name__ == "__main__":
    print("\nTesting Compression Ratio calculator...")

    simple_img = np.full((200, 200, 3), 128, dtype=np.uint8)

    complex_img = np.random.randint(0, 256, (200, 200, 3), dtype=np.uint8)

    for name, test_img in [('Simple', simple_img), ('Complex', complex_img)]:
        test_path = f'/tmp/test_cpr_{name}.png'
        Image.fromarray(test_img).save(test_path)

        result = calculate_indicator(test_path)

        print(f"\n{name}:")
        print(f" Compression Ratio: {result['value']}")
        print(f" Interpretation: {interpret_cpr(result['value'])}")

        os.remove(test_path)
