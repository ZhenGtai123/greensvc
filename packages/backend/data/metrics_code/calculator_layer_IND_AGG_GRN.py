"""Calculator Layer.

Indicator ID:   IND_AGG_GRN
Indicator Name: Aggregation of Greenery Perception (Greenery Aggregation /
Type:           TYPE B

Formula: )
"""

import numpy as np
from typing import Dict, List


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    "id": "IND_AGG_GRN",
    "name": "Aggregation of Greenery Perception",
    "unit": "dimensionless",
    "formula": "AI_g = Σ | (P_{gi} / ΣP_g) - (1/n) | / 2",
    "target_direction": "NEUTRAL",
    "definition": "Inequality of spatial distribution of perceived greenery across locations",
    "category": "CAT_CFG",

    "calc_type": "custom",

    "variables": {
        "P_{gi}": "Greenery perception value at location i",
        "P_{g}": "Total greenery perception in the area",
        "n": "Total number of locations",
        "AI_g": "Aggregation index of greenery perception"
    }
}

print(f"\nCalculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f" Formula: {INDICATOR['formula']}")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(P_gi: List[float]) -> Dict:
    try:
        values = np.array(P_gi, dtype=float)
        n = len(values)

        if n == 0:
            return {
                'success': True,
                'value': 0,
                'n_locations': 0,
                'total_greenery': 0,
                'mean_share': 0,
                'distribution': [],
                'note': 'No locations provided'
            }

        total_greenery = values.sum()

        if total_greenery <= 0:
            return {
                'success': True,
                'value': 0,
                'n_locations': n,
                'total_greenery': float(total_greenery),
                'mean_share': 1 / n,
                'distribution': values.tolist(),
                'note': 'Total greenery perception is zero'
            }

        proportions = values / total_greenery
        uniform_share = 1 / n

        agg_index = np.sum(np.abs(proportions - uniform_share)) / 2

        return {
            'success': True,
            'value': round(float(agg_index), 3),
            'n_locations': int(n),
            'total_greenery': round(float(total_greenery), 3),
            'mean_share': round(float(uniform_share), 3),
            'distribution': proportions.round(3).tolist()
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
def interpret_aggregation(value: float) -> str:
    if value < 0.1:
        return "Very low aggregation: greenery is evenly distributed"
    elif value < 0.3:
        return "Low aggregation: slight spatial concentration"
    elif value < 0.6:
        return "Moderate aggregation: noticeable clustering of greenery"
    else:
        return "High aggregation: greenery perception is highly concentrated"


# =============================================================================
# TEST CODE
# =============================================================================
if __name__ == "__main__":
    print("\nTesting Greenery Aggregation calculator...")

    # Case 1:
    test_uniform = [10, 10, 10, 10]
    res1 = calculate_indicator(test_uniform)
    print(" Test 1: Uniform distribution")
    print(" Value:", res1['value'])
    print(" Interpretation:", interpret_aggregation(res1['value']))

    # Case 2:
    test_agg = [35, 5, 5, 5]
    res2 = calculate_indicator(test_agg)
    print(" Test 2: Aggregated distribution")
    print(" Value:", res2['value'])
    print(" Interpretation:", interpret_aggregation(res2['value']))
