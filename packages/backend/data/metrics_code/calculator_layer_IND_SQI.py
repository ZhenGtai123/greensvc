"""Calculator Layer.

Indicator ID:   IND_SQI
Indicator Name: Street Quality Index (Composite
Type:           TYPE D

Formula: SQI = 1.507*GVI + 0.692*SVI + 0.447*EVI - 2.412*MVI - 0.011*SFI - 0.800*PCI
"""

import numpy as np
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    "id": "IND_SQI",
    "name": "Street Quality Index (Composite)",
    "unit": "score",
    "formula": "SQI = 1.507*GVI + 0.692*SVI + 0.447*EVI - 2.412*MVI - 0.011*SFI - 0.800*PCI - 0.060*VII + 1.414*ITI - 0.167*CCI + 0.208*SWI + 7.798*VEI - 6.344*IRI",
    "target_direction": "POSITIVE",
    "definition": "AHP-weighted composite index measuring overall visual spatial quality of an urban street",
    "category": "CAT_COM",

    "calc_type": "composite",

    "components": [
        "GVI",
        "SVI",
        "EVI",
        "MVI",
        "SFI",
        "PCI",
        "VII",
        "ITI",
        "CCI",
        "SWI",
        "VEI",
        "IRI"
    ],

    "aggregation": "weighted_sum",

    "weights": {
        "GVI": 1.507,
        "SVI": 0.692,
        "EVI": 0.447,
        "MVI": -2.412,
        "SFI": -0.011,
        "PCI": -0.800,
        "VII": -0.060,
        "ITI": 1.414,
        "CCI": -0.167,
        "SWI": 0.208,
        "VEI": 7.798,
        "IRI": -6.344
    }
}

print(f"\nCalculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f" Aggregation: {INDICATOR.get('aggregation', 'weighted_sum')}")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(values: Dict[str, float]) -> Dict:
    try:
        comps = INDICATOR.get('components', [])
        w = INDICATOR.get('weights', {})

        component_values = {}
        contributions = {}
        total = 0.0

        for k in comps:
            x = float(values.get(k, 0))
            wk = float(w.get(k, 0))
            component_values[k] = round(x, 3)
            contrib = wk * x
            contributions[k] = round(float(contrib), 3)
            total += contrib

        return {
            'success': True,
            'value': round(float(total), 3),
            'aggregation_method': INDICATOR.get('aggregation', 'weighted_sum'),
            'weights': {k: round(float(w.get(k, 0)), 3) for k in comps},
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
def interpret_sqi(score: float) -> str:
    if score < -1:
        return "Very low street quality"
    elif score < 0:
        return "Low street quality"
    elif score < 1:
        return "Medium street quality"
    elif score < 2:
        return "High street quality"
    else:
        return "Very high street quality"


# =============================================================================
# TEST CODE
# =============================================================================
if __name__ == "__main__":
    print("\nTesting Street Quality Index calculator...")

    test_values = {
        "GVI": 0.35,
        "SVI": 0.40,
        "EVI": 0.30,
        "MVI": 0.20,
        "SFI": 0.50,
        "PCI": 0.25,
        "VII": 0.30,
        "ITI": 0.45,
        "CCI": 0.20,
        "SWI": 0.55,
        "VEI": 0.60,
        "IRI": 0.25
    }

    result = calculate_indicator(test_values)

    print("\nTest inputs:")
    print(f" Components: {result['components']}")
    print(f" Contributions: {result['contributions']}")
    print(f" SQI: {result['value']}")
    print(f" Level: {interpret_sqi(result['value'])}")
