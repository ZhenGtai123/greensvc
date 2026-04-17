"""Calculator Layer.

Indicator ID:   IND_VIS_QUA
Indicator Name: Visual Quality Index
Type:           TYPE D

Formula: VIS_QUA = Σ(Component Scores)
"""

import numpy as np
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    "id": "IND_VIS_QUA",
    "name": "Visual Quality Index",
    "unit": "score",
    "formula": "Sum(Safety, Liveliness, Beauty, Wealth, Cheerfulness, Interestingness)",
    "target_direction": "POSITIVE",
    "definition": "Composite visual environmental quality index aggregated from multiple perceptual dimensions",
    "category": "CAT_COM",

    "calc_type": "composite",

    "components": [
        "Safety",
        "Liveliness",
        "Beauty",
        "Wealth",
        "Cheerfulness",
        "Interestingness"
    ],

    "aggregation": "sum"
}

print(f"\nCalculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f" Aggregation: {INDICATOR.get('aggregation', 'sum')}")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(values: Dict[str, float]) -> Dict:
    try:
        comps = INDICATOR.get('components', [])

        component_values = {}
        contributions = {}
        total = 0.0

        for k in comps:
            v = float(values.get(k, 0))
            component_values[k] = round(v, 3)
            contributions[k] = round(v, 3)
            total += v

        return {
            'success': True,
            'value': round(float(total), 3),
            'aggregation_method': INDICATOR.get('aggregation', 'sum'),
            'components': component_values,
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
def interpret_vis_qua(score: float) -> str:
    if score < 1:
        return "Very low visual quality"
    elif score < 2:
        return "Low visual quality"
    elif score < 3:
        return "Medium visual quality"
    elif score < 4:
        return "High visual quality"
    else:
        return "Very high visual quality"


# =============================================================================
# TEST CODE
# =============================================================================
if __name__ == "__main__":
    print("\nTesting Visual Quality Index calculator...")

    test_values = {
        "Safety": 0.70,
        "Liveliness": 0.55,
        "Beauty": 0.60,
        "Wealth": 0.50,
        "Cheerfulness": 0.45,
        "Interestingness": 0.65
    }

    result = calculate_indicator(test_values)

    print("\nTest inputs:")
    print(f" Components: {result['components']}")
    print(f" VIS_QUA: {result['value']}")
    print(f" Level: {interpret_vis_qua(result['value'])}")
