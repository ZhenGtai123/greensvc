"""Calculator Layer.

Indicator ID:   IND_PLD_SHA
Indicator Name: Plant Diversity — Shannon entropy
Type:           TYPE A (ratio mode)

Description:
    Shannon entropy H' over plant-class proportions.

Formula: 

NOTE: This is a stub calculator created during V1 schema sync to align
with KB Q-stage split decision (IND_PLD → RIC/SHA/SIM). The actual
diversity-index implementation should follow standard ecological metrics:
  - RIC: Richness = count of distinct semantic classes present
  - SHA: Shannon diversity H' = -Σ p_i × ln(p_i)
  - SIM: Simpson diversity D = 1 - Σ p_i²

  where p_i = fraction of pixels belonging to class i.
"""

import numpy as np
from PIL import Image
from typing import Dict


INDICATOR = {
    "id": "IND_PLD_SHA",
    "name": "Plant Diversity — Shannon entropy",
    "unit": "nats or bits (dimensionless)",
    "formula": "",
    "target_direction": "INCREASE",
    "definition": "Shannon entropy H' over plant-class proportions.",
    "category": "",
    "calc_type": "ratio",
    "target_classes": [],
}


print(f"\nCalculator loaded: {INDICATOR['id']} - {INDICATOR['name']}")


def calculate_indicator(image_path: str) -> Dict:
    """Calculate IND_PLD_SHA for a semantic segmentation mask image.

    Args:
        image_path: Path to semantic segmentation PNG/JPG
    Returns:
        dict with 'success', 'value', and metric-specific fields.
    """
    try:
        img = Image.open(image_path).convert('RGB')
        pixels = np.array(img).reshape(-1, 3)
        total = len(pixels)
        if total == 0:
            return {'success': False, 'error': 'Empty image', 'value': None}

        # Get unique (r,g,b) classes and their counts
        unique_rgb, counts = np.unique(pixels, axis=0, return_counts=True)
        proportions = counts / total

        # Compute the appropriate diversity index based on indicator ID
        ind_id = INDICATOR['id']
        if ind_id.endswith('_RIC'):
            value = len(unique_rgb)
            metric = 'richness (class count)'
        elif ind_id.endswith('_SHA'):
            p = proportions[proportions > 0]
            value = float(-np.sum(p * np.log(p)))
            metric = 'Shannon H'
        elif ind_id.endswith('_SIM'):
            value = float(1 - np.sum(proportions ** 2))
            metric = 'Simpson 1-D'
        else:
            return {'success': False, 'error': f'Unknown variant: {ind_id}', 'value': None}

        return {
            'success': True,
            'value': round(value, 4),
            'metric': metric,
            'class_count': int(len(unique_rgb)),
            'total_pixels': int(total),
        }
    except FileNotFoundError:
        return {'success': False, 'error': f'Image not found: {image_path}', 'value': None}
    except Exception as e:
        return {'success': False, 'error': str(e), 'value': None}
