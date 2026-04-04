"""
SVC Archetype Clustering Service (v6.0 Descriptive)
KMeans clustering on geo-located image points to discover data-driven
spatial archetypes.  Optional KNN smoothing reduces salt-and-pepper noise.

Pipeline:
  1. Build point x indicator matrix from per-image metrics
  2. Standardise (z-scores)
  3. Find optimal K via silhouette analysis (K=2..max_k)
  4. KMeans fit -> initial labels
  5. KNN spatial smoothing (majority vote among k-nearest neighbours)
  6. Profile archetypes (centroid values + z-scores)
  7. Name archetypes (top features)
  8. Generate segment diagnostics (descriptive, zone_diagnostics-compatible)

v6.0 Change: Removed all evaluative logic (classify, priority, status,
problems).  Segment diagnostics are now purely descriptive.
"""

import logging
from typing import Any

import numpy as np
import pandas as pd
from scipy.cluster.hierarchy import linkage
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

from app.models.analysis import (
    ArchetypeProfile,
    ClusteringResult,
    SpatialSegment,
    ZoneDiagnostic,
    IndicatorDefinitionInput,
)

logger = logging.getLogger(__name__)

MIN_POINTS = 20
DEFAULT_MAX_K = 10
DEFAULT_KNN_K = 7


class ClusteringService:
    """Stateless SVC archetype clustering service (v6.0 descriptive)."""

    def cluster(
        self,
        point_metrics: list[dict],
        indicator_definitions: dict[str, IndicatorDefinitionInput],
        layer: str = "full",
        max_k: int = DEFAULT_MAX_K,
        knn_k: int = DEFAULT_KNN_K,
    ) -> ClusteringResult | None:
        """Run the full clustering pipeline.

        Args:
            point_metrics: List of dicts, each with at least:
                - point_id (str): unique image/point identifier
                - lat, lng (float): coordinates (optional, needed for spatial smoothing)
                - {indicator_id}: float value per indicator
            indicator_definitions: {ind_id: IndicatorDefinitionInput}
            layer: which layer's values to use (default "full")
            max_k: maximum number of clusters to try
            knn_k: k for KNN spatial smoothing

        Returns:
            ClusteringResult or None if insufficient data.
        """
        ind_ids = sorted(indicator_definitions.keys())
        if not ind_ids or len(point_metrics) < MIN_POINTS:
            logger.info(
                "Clustering skipped: %d points, %d indicators (need >= %d points)",
                len(point_metrics), len(ind_ids), MIN_POINTS,
            )
            return None

        # 1. Build point x indicator matrix
        df, coords, point_ids = self._build_matrix(point_metrics, ind_ids)
        if len(df) < MIN_POINTS:
            return None

        # 2. Standardise
        scaler = StandardScaler()
        X = scaler.fit_transform(df.values)

        # 3. Optimal K via silhouette
        best_k, best_score, labels, silhouette_scores = self._find_optimal_k(X, max_k)
        logger.info("Optimal K=%d (silhouette=%.3f)", best_k, best_score)

        # 3b. Ward hierarchical linkage (for dendrogram). Cheap enough to always compute.
        try:
            Z_linkage = linkage(X, method="ward", metric="euclidean").tolist()
        except Exception as e:
            logger.warning("Ward linkage failed: %s", e)
            Z_linkage = []

        # 4. KNN spatial smoothing (if coordinates available)
        has_coords = coords is not None and len(coords) == len(labels)
        labels_raw = labels.copy()
        if has_coords and knn_k > 0 and len(labels) > knn_k:
            labels = self._knn_smooth(coords, labels, knn_k)
            logger.info("KNN smoothing applied (k=%d)", knn_k)

        # 5. Profile archetypes
        archetypes = self._profile_archetypes(df, X, labels, ind_ids, indicator_definitions)

        # 6. Build spatial segments
        segments = self._build_segments(
            df, labels, point_ids, coords, archetypes, ind_ids,
        )

        # 7. Segment diagnostics (descriptive)
        segment_diagnostics = self._build_segment_diagnostics(
            df, X, labels, ind_ids, indicator_definitions,
            archetypes, coords, point_ids,
        )

        point_lats = coords[:, 0].tolist() if has_coords else []
        point_lngs = coords[:, 1].tolist() if has_coords else []

        return ClusteringResult(
            method="KMeans + KNN spatial smoothing" if has_coords else "KMeans",
            k=best_k,
            silhouette_score=round(best_score, 4),
            silhouette_scores=silhouette_scores,
            spatial_smooth_k=knn_k if has_coords else 0,
            layer_used=layer,
            archetype_profiles=archetypes,
            spatial_segments=segments,
            point_ids_ordered=list(point_ids),
            point_lats=point_lats,
            point_lngs=point_lngs,
            labels_raw=[int(x) for x in labels_raw.tolist()],
            labels_smoothed=[int(x) for x in labels.tolist()],
            dendrogram_linkage=Z_linkage,
        ), segment_diagnostics

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_matrix(
        point_metrics: list[dict],
        ind_ids: list[str],
    ) -> tuple[pd.DataFrame, np.ndarray | None, list[str]]:
        """Build a (points x indicators) DataFrame + optional coordinate array."""
        rows = []
        coords_list = []
        point_ids = []
        for pm in point_metrics:
            row = {}
            has_any = False
            for ind_id in ind_ids:
                v = pm.get(ind_id)
                if v is not None:
                    row[ind_id] = float(v)
                    has_any = True
            if not has_any:
                continue
            rows.append(row)
            point_ids.append(pm.get("point_id", f"pt_{len(point_ids)}"))
            lat = pm.get("lat")
            lng = pm.get("lng")
            if lat is not None and lng is not None:
                coords_list.append([float(lat), float(lng)])

        df = pd.DataFrame(rows, columns=ind_ids).dropna(how="all")
        df = df.fillna(df.mean())

        coords = None
        if len(coords_list) == len(df):
            coords = np.array(coords_list)

        return df, coords, point_ids[:len(df)]

    @staticmethod
    def _find_optimal_k(
        X: np.ndarray,
        max_k: int,
    ) -> tuple[int, float, np.ndarray, list[dict]]:
        """Try K=2..max_k, pick best silhouette score. Returns all scores."""
        n = len(X)
        upper = min(max_k, n - 1, 15)
        best_k, best_score, best_labels = 2, -1.0, np.zeros(n, dtype=int)
        all_scores: list[dict] = []

        for k in range(2, upper + 1):
            km = KMeans(n_clusters=k, n_init=10, random_state=42)
            lbl = km.fit_predict(X)
            sc = silhouette_score(X, lbl)
            all_scores.append({"k": k, "silhouette": round(float(sc), 4)})
            if sc > best_score:
                best_k, best_score, best_labels = k, sc, lbl

        return best_k, best_score, best_labels, all_scores

    @staticmethod
    def _knn_smooth(
        coords: np.ndarray,
        labels: np.ndarray,
        k: int,
    ) -> np.ndarray:
        """Relabel each point to the majority class among its k nearest neighbours."""
        nn = NearestNeighbors(n_neighbors=min(k, len(coords)), metric="euclidean")
        nn.fit(coords)
        _, indices = nn.kneighbors(coords)
        smoothed = np.empty_like(labels)
        for i, neighbours in enumerate(indices):
            neighbour_labels = labels[neighbours]
            counts = np.bincount(neighbour_labels)
            smoothed[i] = int(np.argmax(counts))
        return smoothed

    @staticmethod
    def _profile_archetypes(
        df: pd.DataFrame,
        X_scaled: np.ndarray,
        labels: np.ndarray,
        ind_ids: list[str],
        ind_defs: dict[str, IndicatorDefinitionInput],
    ) -> list[ArchetypeProfile]:
        """Compute centroid values and z-scores per cluster, generate label."""
        profiles = []
        for cid in sorted(set(labels)):
            mask = labels == cid
            centroid_raw = df.loc[mask].mean()
            centroid_z = pd.Series(X_scaled[mask].mean(axis=0), index=ind_ids)

            label = _name_archetype(centroid_z, ind_defs)

            profiles.append(ArchetypeProfile(
                archetype_id=int(cid),
                archetype_label=label,
                point_count=int(mask.sum()),
                centroid_values={k: round(float(v), 4) for k, v in centroid_raw.items()},
                centroid_z_scores={k: round(float(v), 4) for k, v in centroid_z.items()},
            ))
        return profiles

    @staticmethod
    def _build_segments(
        df: pd.DataFrame,
        labels: np.ndarray,
        point_ids: list[str],
        coords: np.ndarray | None,
        archetypes: list[ArchetypeProfile],
        ind_ids: list[str],
    ) -> list[SpatialSegment]:
        """Build one SpatialSegment per cluster."""
        arch_map = {a.archetype_id: a for a in archetypes}
        segments = []
        for cid in sorted(set(labels)):
            mask = labels == cid
            arch = arch_map.get(int(cid))
            pids = [point_ids[i] for i in range(len(labels)) if mask[i]]

            lat_range, lng_range = [], []
            if coords is not None:
                c = coords[mask]
                lat_range = [round(float(c[:, 0].min()), 6), round(float(c[:, 0].max()), 6)]
                lng_range = [round(float(c[:, 1].min()), 6), round(float(c[:, 1].max()), 6)]

            segments.append(SpatialSegment(
                segment_id=f"seg_{cid}",
                archetype_id=int(cid),
                archetype_label=arch.archetype_label if arch else "",
                point_count=int(mask.sum()),
                point_ids=pids,
                lat_range=lat_range,
                lng_range=lng_range,
                centroid_indicators=arch.centroid_values if arch else {},
                centroid_z_scores=arch.centroid_z_scores if arch else {},
            ))
        return segments

    @staticmethod
    def _build_segment_diagnostics(
        df: pd.DataFrame,
        X_scaled: np.ndarray,
        labels: np.ndarray,
        ind_ids: list[str],
        ind_defs: dict[str, IndicatorDefinitionInput],
        archetypes: list[ArchetypeProfile],
        coords: np.ndarray | None,
        point_ids: list[str],
    ) -> list[ZoneDiagnostic]:
        """Generate descriptive zone_diagnostics-compatible records for each cluster (v6.0)."""
        arch_map = {a.archetype_id: a for a in archetypes}
        diagnostics: list[ZoneDiagnostic] = []

        for cid in sorted(set(labels)):
            mask = labels == cid
            arch = arch_map.get(int(cid))
            centroid_z = pd.Series(X_scaled[mask].mean(axis=0), index=ind_ids)
            centroid_raw = df.loc[mask].mean()

            # Build descriptive indicator_status (value + z_score + target_direction only)
            indicator_status: dict[str, dict] = {}
            for ind_id in ind_ids:
                z = float(centroid_z[ind_id])
                val = float(centroid_raw[ind_id]) if ind_id in centroid_raw else None
                defn = ind_defs.get(ind_id)
                indicator_status[ind_id] = {
                    "full": {
                        "value": round(val, 4) if val is not None else None,
                        "z_score": round(z, 3),
                        "target_direction": defn.target_direction if defn else "INCREASE",
                    }
                }

            mean_abs_z = round(float(centroid_z.abs().mean()), 4)

            diagnostics.append(ZoneDiagnostic(
                zone_id=f"seg_{cid}",
                zone_name=arch.archetype_label if arch else f"Segment {cid}",
                area_sqm=0,
                mean_abs_z=mean_abs_z,
                point_count=int(mask.sum()),
                indicator_status=indicator_status,
            ))

        diagnostics.sort(key=lambda d: d.mean_abs_z, reverse=True)
        for rank, d in enumerate(diagnostics, 1):
            d.rank = rank
        return diagnostics


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------

def _name_archetype(
    centroid_z: pd.Series,
    ind_defs: dict[str, IndicatorDefinitionInput],
) -> str:
    """Generate a human-readable label from top 3 z-score features."""
    sorted_z = centroid_z.abs().sort_values(ascending=False)
    parts = []
    for ind_id in sorted_z.index[:3]:
        z = centroid_z[ind_id]
        short_name = ind_defs[ind_id].name if ind_id in ind_defs else ind_id
        # Abbreviate to first meaningful word
        short = short_name.split()[0] if short_name else ind_id
        prefix = "High" if z > 0 else "Low"
        parts.append(f"{prefix}-{short}")
    return " / ".join(parts)
