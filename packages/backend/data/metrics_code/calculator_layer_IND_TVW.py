"""Calculator Layer.

Indicator ID:   IND_TVW
Indicator Name: Type of Visual Walkability
Type:           of Visual Walkability
"""

import numpy as np
from typing import Dict
import os
import pickle


# =============================================================================
# INDICATOR DEFINITION
# =============================================================================
INDICATOR = {
    "id": "IND_TVW",
    "name": "Type of Visual Walkability",
    "unit": "category",
    "formula": "K-means Clustering(Gi, Si, Di, Ni)",
    "target_direction": "NEUTRAL",
    "definition": "Categorical classification of street segments via K-means clustering of visual walkability indicators",
    "category": "CAT_COM",

    "calc_type": "deep_learning",

    "model_config": {
        "model_type": "KMeans",
        "model_path": "./models/tvw_kmeans.pkl",
        "n_clusters": 5,
        "feature_order": ["Gi", "Si", "Di", "Ni"], # greenery, openness, pavement, crowdedness
        "standardize": True,                       # StandardScaler
        "scaler_path": "./models/tvw_scaler.pkl"   # StandardScaler
    },

    "output_type": "classification",

    # PLACEHOLDER MODE
    "use_placeholder": True
}

print(f"\nCalculator ready: {INDICATOR['id']} - {INDICATOR['name']}")
print(f" Mode: {'Placeholder (rule-based)' if INDICATOR.get('use_placeholder', True) else 'K-means'}")


# =============================================================================
# sklearn
# =============================================================================
SKLEARN_AVAILABLE = False
try:
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import StandardScaler
    SKLEARN_AVAILABLE = True
    print(f" scikit-learn: Available")
except ImportError:
    print(f" scikit-learn: Not installed")
    print(f" To enable full K-means mode: pip install scikit-learn")


# =============================================================================
# CALCULATION FUNCTION
# =============================================================================
def calculate_indicator(values: Dict[str, float]) -> Dict:
    use_placeholder = INDICATOR.get('use_placeholder', True)

    if use_placeholder or not SKLEARN_AVAILABLE:
        return calculate_placeholder(values)
    else:
        return calculate_kmeans(values)


def calculate_placeholder(values: Dict[str, float]) -> Dict:
    try:
        Gi = float(values.get("Gi", 0))
        Si = float(values.get("Si", 0))
        Di = float(values.get("Di", 0))
        Ni = float(values.get("Ni", 0))

        if (Gi >= 0.5) and (Si >= 0.5) and (Di >= 0.5) and (Ni <= 0.3):
            cluster = 1
            label = "High walkability (green-open-paved, low crowdedness)"
        elif (Gi <= 0.3) and (Si <= 0.3) and (Ni >= 0.6):
            cluster = 2
            label = "Low walkability (low green-open, high crowdedness)"
        else:
            cluster = 0
            label = "Mixed walkability"

        return {
            'success': True,
            'value': cluster,
            'cluster': int(cluster),
            'method': 'placeholder_rule_based',
            'features_used': {
                'Gi': round(Gi, 3),
                'Si': round(Si, 3),
                'Di': round(Di, 3),
                'Ni': round(Ni, 3)
            },
            'label': label,
            'note': 'This is a placeholder rule-based classification, not K-means clustering'
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'value': None,
            'method': 'placeholder_rule_based'
        }


def calculate_kmeans(values: Dict[str, float]) -> Dict:
    try:
        cfg = INDICATOR.get('model_config', {})
        model_path = cfg.get('model_path', '')
        scaler_path = cfg.get('scaler_path', None)
        feature_order = cfg.get('feature_order', ["Gi", "Si", "Di", "Ni"])
        use_scaler = bool(cfg.get('standardize', True))

        if not os.path.exists(model_path):
            return {
                'success': False,
                'error': f'Model file not found: {model_path}',
                'value': None,
                'method': 'kmeans',
                'fallback': 'Run with use_placeholder=True or provide kmeans model file'
            }

        with open(model_path, "rb") as f:
            kmeans = pickle.load(f)

        x = np.array([[float(values.get(k, 0)) for k in feature_order]], dtype=float)

        scaler = None
        if use_scaler and scaler_path and os.path.exists(scaler_path):
            with open(scaler_path, "rb") as f:
                scaler = pickle.load(f)
            x_in = scaler.transform(x)
        else:
            x_in = x

        cluster = int(kmeans.predict(x_in)[0])

        if hasattr(kmeans, "transform"):
            dists = kmeans.transform(x_in).reshape(-1).tolist()
            dists = [round(float(d), 6) for d in dists]
        else:
            dists = None

        return {
            'success': True,
            'value': cluster,
            'cluster': cluster,
            'method': 'kmeans',
            'features_used': {k: round(float(values.get(k, 0)), 3) for k in feature_order},
            'distance_to_centroids': dists
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'value': None,
            'method': 'kmeans'
        }


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================
def interpret_tvw(cluster: int) -> str:
    mapping = {
        0: "Mixed/Transitional walkability type",
        1: "High walkability type",
        2: "Low walkability type",
        3: "Crowded but active walkability type",
        4: "Open but low greenery walkability type"
    }
    return mapping.get(int(cluster), "Unknown walkability type")


# =============================================================================
# TEST CODE
# =============================================================================
if __name__ == "__main__":
    print("\nTesting Type of Visual Walkability calculator...")

    tests = [
        ("High walkability", {"Gi": 0.7, "Si": 0.6, "Di": 0.8, "Ni": 0.2}),
        ("Low walkability", {"Gi": 0.2, "Si": 0.2, "Di": 0.5, "Ni": 0.8}),
        ("Mixed", {"Gi": 0.4, "Si": 0.5, "Di": 0.3, "Ni": 0.4})
    ]

    for name, vals in tests:
        result = calculate_indicator(vals)
        print(f"\n{name}:")
        print(f" Cluster: {result.get('value')}")
        print(f" Method: {result.get('method')}")
        print(f" Interpretation: {interpret_tvw(int(result.get('value') or 0))}")
