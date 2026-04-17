"""Calculator Layer.

Indicator ID:   IND_VSG_BLK
Indicator Name: Visible Street Greenery (Block Level
Type:           TYPE D

Formula: Gn = Σ(Gi * Li * Di^α) / Σ(Li * Di^α)
"""

import numpy as np
from typing import Dict, List


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    "id": "IND_VSG_BLK",
    "name": "Visible Street Greenery (Block Level)",
    "unit": "ratio",
    "formula": "Gn = Σ(Gi * Li * Di^α) / Σ(Li * Di^α)",
    "target_direction": "POSITIVE",
    "definition": "Distance-decay weighted average of visible street greenery around a block",
    "category": "CAT_CMP",

    "calc_type": "composite",

    "components": [
        "Gi",
        "Li",
        "Di"
    ],

    "aggregation": "distance_decay_weighted_mean",

    "alpha": -1.0
}

print(f"\nCalculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f" Aggregation: {INDICATOR.get('aggregation', 'distance_decay_weighted_mean')}")
print(f" Alpha: {INDICATOR.get('alpha', -1.0)}")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(Gi: List[float], Li: List[float], Di: List[float], alpha: float = None) -> Dict:
    try:
        a = float(alpha) if alpha is not None else float(INDICATOR.get('alpha', -1.0))

        Gi_arr = np.array(Gi, dtype=float)
        Li_arr = np.array(Li, dtype=float)
        Di_arr = np.array(Di, dtype=float)

        n = len(Gi_arr)
        if n == 0 or len(Li_arr) != n or len(Di_arr) != n:
            return {
                'success': True,
                'value': 0,
                'alpha': a,
                'n_streets': int(n),
                'note': 'Input lists must have the same non-zero length'
            }

        Di_safe = np.where(Di_arr <= 0, np.nan, Di_arr)

        weights = Li_arr * (Di_safe ** a)

        valid = np.isfinite(weights) & np.isfinite(Gi_arr) & np.isfinite(Li_arr) & np.isfinite(Di_arr)
        Gi_v = Gi_arr[valid]
        Li_v = Li_arr[valid]
        Di_v = Di_arr[valid]
        w_v = weights[valid]

        denom = float(np.sum(w_v))
        if denom <= 0:
            return {
                'success': True,
                'value': 0,
                'alpha': a,
                'n_streets': int(n),
                'note': 'Sum of weights is zero'
            }

        numer = float(np.sum(Gi_v * w_v))
        Gn = numer / denom

        weighted_components = {
            'numerator': round(numer, 6),
            'denominator': round(denom, 6)
        }

        return {
            'success': True,
            'value': round(float(Gn), 3),
            'alpha': round(float(a), 3),
            'n_streets': int(len(Gi_v)),
            'weights': np.round(w_v, 6).tolist(),
            'weighted_components': weighted_components,
            'inputs_summary': {
                'Gi_mean': round(float(np.mean(Gi_v)) if len(Gi_v) > 0 else 0, 3),
                'Li_sum': round(float(np.sum(Li_v)) if len(Li_v) > 0 else 0, 3),
                'Di_mean': round(float(np.mean(Di_v)) if len(Di_v) > 0 else 0, 3)
            }
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
def interpret_vsg_blk(value: float) -> str:
    if value < 0.1:
        return "Very low visible greenery around block"
    elif value < 0.25:
        return "Low visible greenery around block"
    elif value < 0.5:
        return "Medium visible greenery around block"
    else:
        return "High visible greenery around block"


# =============================================================================
# TEST CODE
# =============================================================================
if __name__ == "__main__":
    print("\nTesting Visible Street Greenery (Block Level) calculator...")

    Gi_test = [0.30, 0.50, 0.10]
    Li_test = [120, 80, 200]
    Di_test = [30, 60, 15]
    alpha_test = -1.0

    result = calculate_indicator(Gi_test, Li_test, Di_test, alpha_test)

    print("\nTest inputs:")
    print(f" Gi: {Gi_test}")
    print(f" Li: {Li_test}")
    print(f" Di: {Di_test}")
    print(f" alpha: {alpha_test}")
    print(f" Gn: {result['value']}")
    print(f" Interpretation: {interpret_vsg_blk(result['value'])}")
