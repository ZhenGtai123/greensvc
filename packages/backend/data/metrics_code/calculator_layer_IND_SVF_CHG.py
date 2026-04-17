"""Calculator Layer.

Indicator ID:   IND_SVF_CHG
Indicator Name: Sky View Factor Change (SVF
Type:           TYPE D

Formula: SVF_CHG = |SVF_t - SVF_{t-1}|
"""

import numpy as np
from PIL import Image
from typing import Dict


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    "id": "IND_SVF_CHG",
    "name": "Sky View Factor Change",
    "unit": "ratio",
    "formula": "|SVF_t - SVF_{t-1}|",
    "target_direction": "NEUTRAL",
    "definition": "Absolute change in Sky View Factor between two adjacent points",
    "category": "CAT_CFG",

    "calc_type": "composite",

    "component_sources": {
        "current": "SVF_t",
        "previous": "SVF_{t-1}"
    },

    "aggregation": "absolute_difference"
}

print(f"\nCalculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f" Aggregation: {INDICATOR.get('aggregation', 'absolute_difference')}")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(SVF_t: float, SVF_t_minus_1: float) -> Dict:
    try:
        svf_current = float(SVF_t)
        svf_prev = float(SVF_t_minus_1)

        value = abs(svf_current - svf_prev)

        change_level = interpret_svf_change(value)

        return {
            'success': True,
            'value': round(float(value), 3),
            'aggregation_method': INDICATOR.get('aggregation', 'absolute_difference'),
            'SVF_t': round(svf_current, 3),
            'SVF_{t-1}': round(svf_prev, 3),
            'change_level': change_level
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
def interpret_svf_change(change: float) -> str:
    if change < 0.05:
        return "Very stable: minimal SVF change"
    elif change < 0.15:
        return "Stable: small SVF change"
    elif change < 0.30:
        return "Moderate change: noticeable SVF variation"
    else:
        return "High change: strong SVF variation"


# =============================================================================
# TEST CODE
# =============================================================================
if __name__ == "__main__":
    print("\nTesting SVF Change calculator...")

    tests = [
        ("Very small change", 0.62, 0.60),
        ("Moderate change", 0.62, 0.40),
        ("High change", 0.85, 0.20),
    ]

    for name, svf_t, svf_prev in tests:
        result = calculate_indicator(svf_t, svf_prev)

        print(f"\n{name}:")
        print(f" SVF_t: {result['SVF_t']}")
        print(f" SVF_{'{t-1}'}: {result['SVF_{t-1}']}")
        print(f" SVF_CHG: {result['value']}")
        print(f" Level: {result['change_level']}")
