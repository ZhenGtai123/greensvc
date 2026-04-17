"""Calculator Layer.

Indicator ID:   IND_HPS
Indicator Name: Human Perception Score
Type:           TYPE D

Formula: HPS = Σ (w_k × x_k)
"""

import numpy as np
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    "id": "IND_HPS",
    "name": "Human Perception Score",
    "unit": "score",
    "formula": "HPS = Σ (w_k × x_k)",
    "target_direction": "POSITIVE",
    "definition": "Composite score of human perception dimensions using entropy-derived weights",
    "category": "CAT_COM",

    "calc_type": "composite",

    "components": [
        "Greenness",
        "Openness",
        "Enclosure",
        "Walkability",
        "Imageability"
    ],

    "aggregation": "weighted_sum",

    "weights": {
        "Greenness": 0.2,
        "Openness": 0.2,
        "Enclosure": 0.2,
        "Walkability": 0.2,
        "Imageability": 0.2
    }
}

print(f"\nCalculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f" Aggregation: {INDICATOR.get('aggregation', 'weighted_sum')}")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(values: Dict[str, float], weights: Dict[str, float] = None) -> Dict:
    try:
        comps = INDICATOR.get('components', [])
        w = weights if weights is not None else INDICATOR.get('weights', {})

        # Step 1:
        x = {}
        for k in comps:
            x[k] = float(values.get(k, 0))

        # Step 2: Σw≠1
        w_vec = np.array([float(w.get(k, 0)) for k in comps], dtype=float)
        w_sum = float(np.sum(w_vec))
        if w_sum > 0:
            w_vec = w_vec / w_sum
        else:
            w_vec = np.ones(len(comps), dtype=float) / len(comps)

        w_norm = {k: round(float(w_vec[i]), 3) for i, k in enumerate(comps)}

        # Step 3:
        contributions = {}
        total = 0.0
        for i, k in enumerate(comps):
            c = float(w_vec[i] * x[k])
            contributions[k] = round(c, 3)
            total += c

        return {
            'success': True,
            'value': round(float(total), 3),
            'aggregation_method': INDICATOR.get('aggregation', 'weighted_sum'),
            'weights': w_norm,
            'components': {k: round(float(x[k]), 3) for k in comps},
            'contributions': contributions
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
def interpret_hps(score: float) -> str:
    if score < 0.2:
        return "Very low perceived quality"
    elif score < 0.4:
        return "Low perceived quality"
    elif score < 0.6:
        return "Medium perceived quality"
    elif score < 0.8:
        return "High perceived quality"
    else:
        return "Very high perceived quality"


# =============================================================================
# TEST CODE
# =============================================================================
if __name__ == "__main__":
    print("\nTesting Human Perception Score calculator...")

    test_values = {
        "Greenness": 0.70,
        "Openness": 0.55,
        "Enclosure": 0.40,
        "Walkability": 0.60,
        "Imageability": 0.50
    }

    test_weights = {
        "Greenness": 0.25,
        "Openness": 0.20,
        "Enclosure": 0.15,
        "Walkability": 0.25,
        "Imageability": 0.15
    }

    result = calculate_indicator(test_values, test_weights)

    print("\nTest inputs:")
    print(f" Values: {result['components']}")
    print(f" Weights: {result['weights']}")
    print(f" Contributions: {result['contributions']}")
    print(f" HPS: {result['value']}")
    print(f" Level: {interpret_hps(result['value'])}")
