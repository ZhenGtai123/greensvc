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
