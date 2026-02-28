"""
Zone Analyzer Service  (Stage 2.5)
Stateless, pure numpy/pandas/scipy — no LLM, no I/O.

Consumes flat zone_statistics records and returns:
  - Enriched records with Z-scores, percentiles, priority, classification
  - Zone diagnostics (status, problems by layer)
  - Correlation / p-value matrices by layer
"""

import logging
from collections import defaultdict
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats
from sklearn.preprocessing import StandardScaler

from app.models.analysis import (
    ZoneAnalysisRequest,
    ZoneAnalysisResult,
    EnrichedZoneStat,
    ZoneDiagnostic,
    ZoneProblem,
    ComputationMetadata,
)

logger = logging.getLogger(__name__)

LAYERS = ["full", "foreground", "middleground", "background"]


class ZoneAnalyzer:
    """Stateless Stage 2.5 analysis service."""

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------
    def analyze(self, request: ZoneAnalysisRequest) -> ZoneAnalysisResult:
        ind_defs = request.indicator_definitions
        thresholds = (request.zscore_moderate, request.zscore_significant, request.zscore_critical)

        # 1) Pivot flat records into per-layer DataFrames of mean values
        raw_by_layer, meta_by_layer = self._build_dataframes(request.zone_statistics)

        if not raw_by_layer:
            return ZoneAnalysisResult(
                computation_metadata=ComputationMetadata(n_indicators=0, n_zones=0),
            )

        # Derive zone/indicator lists from pivoted data
        sample_layer = next(iter(raw_by_layer.values()))
        zone_names: list[str] = list(sample_layer.index)
        ind_ids: list[str] = list(sample_layer.columns)

        # 2) Z-scores per layer
        zscore_by_layer: dict[str, pd.DataFrame] = {}
        for layer, df_raw in raw_by_layer.items():
            scaler = StandardScaler()
            filled = df_raw.fillna(df_raw.mean()).infer_objects(copy=False)
            scaled = scaler.fit_transform(filled)
            zscore_by_layer[layer] = pd.DataFrame(scaled, index=df_raw.index, columns=df_raw.columns)

        # 3) Percentiles per layer
        pct_by_layer: dict[str, pd.DataFrame] = {
            layer: df.rank(pct=True) * 100 for layer, df in raw_by_layer.items()
        }

        # 4) Classification / priority per layer
        priority_by_layer: dict[str, pd.DataFrame] = {}
        classification_by_layer: dict[str, pd.DataFrame] = {}
        for layer in raw_by_layer:
            pr_data: dict[str, dict[str, int]] = {}
            cl_data: dict[str, dict[str, str]] = {}
            for zone in zone_names:
                pr_data[zone] = {}
                cl_data[zone] = {}
                for ind_id in ind_ids:
                    z = zscore_by_layer[layer].loc[zone, ind_id]
                    direction = ind_defs[ind_id].target_direction.upper() if ind_id in ind_defs else "INCREASE"
                    label, pri = _classify(z, direction, thresholds)
                    pr_data[zone][ind_id] = pri
                    cl_data[zone][ind_id] = label
            priority_by_layer[layer] = pd.DataFrame(pr_data).T
            classification_by_layer[layer] = pd.DataFrame(cl_data).T

        # 5) Enriched flat records
        enriched: list[EnrichedZoneStat] = []
        for rec in request.zone_statistics:
            layer = rec.layer
            if layer not in zscore_by_layer:
                continue
            z_df = zscore_by_layer[layer]
            p_df = pct_by_layer[layer]
            zone = rec.zone_name
            ind = rec.indicator_id
            if zone not in z_df.index or ind not in z_df.columns:
                continue
            z_val = float(z_df.loc[zone, ind])
            pct_val = float(p_df.loc[zone, ind]) if not pd.isna(p_df.loc[zone, ind]) else None
            pri = int(priority_by_layer[layer].loc[zone, ind])
            cl = str(classification_by_layer[layer].loc[zone, ind])
            enriched.append(EnrichedZoneStat(
                zone_id=rec.zone_id,
                zone_name=rec.zone_name,
                indicator_id=rec.indicator_id,
                layer=rec.layer,
                unit=rec.unit,
                n_images=rec.n_images,
                mean=rec.mean,
                std=rec.std,
                min=rec.min,
                max=rec.max,
                area_sqm=rec.area_sqm,
                z_score=round(z_val, 4),
                percentile=round(pct_val, 2) if pct_val is not None else None,
                priority=pri,
                classification=cl,
            ))

        # 6) Correlations per layer
        corr_out: dict[str, dict] = {}
        pval_out: dict[str, dict] = {}
        for layer, z_df in zscore_by_layer.items():
            corr_m, pval_m = _calc_corr_pval(z_df)
            corr_out[layer] = {
                c1: {c2: round(float(corr_m.loc[c1, c2]), 4) for c2 in corr_m.columns}
                for c1 in corr_m.index
            }
            pval_out[layer] = {
                c1: {c2: round(float(pval_m.loc[c1, c2]), 6) for c2 in pval_m.columns}
                for c1 in pval_m.index
            }

        # 7) Zone diagnostics (with composite z-score + rank)
        diagnostics = self._build_diagnostics(
            zone_names, ind_ids, ind_defs,
            priority_by_layer, classification_by_layer,
            zscore_by_layer, raw_by_layer, meta_by_layer,
        )

        # 8) Layer-level statistics (mean/std/N across zones, per indicator)
        layer_statistics = self._compute_layer_statistics(raw_by_layer, meta_by_layer)

        # 9) Radar profiles from full-layer percentiles
        radar_profiles: dict[str, dict[str, float]] = {}
        if "full" in pct_by_layer:
            pct_full = pct_by_layer["full"]
            for zone in zone_names:
                if zone in pct_full.index:
                    radar_profiles[zone] = {
                        ind_id: round(float(pct_full.loc[zone, ind_id]), 2)
                        for ind_id in ind_ids
                        if not pd.isna(pct_full.loc[zone, ind_id])
                    }

        return ZoneAnalysisResult(
            zone_statistics=enriched,
            zone_diagnostics=diagnostics,
            correlation_by_layer=corr_out,
            pvalue_by_layer=pval_out,
            indicator_definitions=ind_defs,
            layer_statistics=layer_statistics,
            radar_profiles=radar_profiles,
            computation_metadata=ComputationMetadata(
                n_indicators=len(ind_ids),
                n_zones=len(zone_names),
            ),
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_dataframes(
        records: list,
    ) -> tuple[dict[str, pd.DataFrame], dict[str, dict]]:
        """Pivot flat records into {layer: DataFrame(zones x indicators)} of mean values.

        Also returns a meta dict keyed by (zone_name, indicator_id, layer) for
        auxiliary fields (std, min, max, n_images, area_sqm, unit).
        """
        by_layer: dict[str, dict[str, dict[str, float | None]]] = defaultdict(lambda: defaultdict(dict))
        meta: dict[str, dict] = {}

        for rec in records:
            layer = rec.layer
            if layer not in LAYERS:
                continue
            by_layer[layer][rec.zone_name][rec.indicator_id] = rec.mean
            meta[(rec.zone_name, rec.indicator_id, layer)] = {
                "std": rec.std,
                "min": rec.min,
                "max": rec.max,
                "n_images": rec.n_images,
                "area_sqm": rec.area_sqm,
                "unit": rec.unit,
                "zone_id": rec.zone_id,
            }

        result: dict[str, pd.DataFrame] = {}
        for layer, zone_dict in by_layer.items():
            df = pd.DataFrame(zone_dict).T
            df = df.sort_index()
            df = df.reindex(columns=sorted(df.columns))
            result[layer] = df

        return result, meta

    @staticmethod
    def _build_diagnostics(
        zone_names, ind_ids, ind_defs,
        priority_by_layer, classification_by_layer,
        zscore_by_layer, raw_by_layer, meta_by_layer,
    ) -> list[ZoneDiagnostic]:
        diagnostics: list[ZoneDiagnostic] = []

        for zone in zone_names:
            layer_priorities: dict[str, int] = {}
            problems_by_layer: dict[str, list[ZoneProblem]] = {}
            indicator_status: dict[str, dict[str, Any]] = {}

            for layer in LAYERS:
                if layer not in priority_by_layer:
                    continue
                pr_df = priority_by_layer[layer]
                if zone not in pr_df.index:
                    continue
                layer_priorities[layer] = int(pr_df.loc[zone].sum())

                problems: list[ZoneProblem] = []
                for ind_id in ind_ids:
                    if ind_id not in pr_df.columns:
                        continue
                    pri = int(pr_df.loc[zone, ind_id])
                    if pri >= 4:
                        m = meta_by_layer.get((zone, ind_id, layer), {})
                        ind_def = ind_defs.get(ind_id)
                        problems.append(ZoneProblem(
                            indicator_id=ind_id,
                            indicator_name=ind_def.name if ind_def else ind_id,
                            layer=layer,
                            value=float(raw_by_layer[layer].loc[zone, ind_id])
                                if not pd.isna(raw_by_layer[layer].loc[zone, ind_id]) else None,
                            unit=m.get("unit", ""),
                            z_score=round(float(zscore_by_layer[layer].loc[zone, ind_id]), 3),
                            priority=pri,
                            classification=str(classification_by_layer[layer].loc[zone, ind_id]),
                            target_direction=ind_def.target_direction if ind_def else "",
                        ))
                problems.sort(key=lambda p: p.priority, reverse=True)
                problems_by_layer[layer] = problems

            # Build per-indicator status (full layer as summary)
            for ind_id in ind_ids:
                layer_data: dict[str, dict] = {}
                for layer in LAYERS:
                    if layer not in zscore_by_layer or zone not in zscore_by_layer[layer].index:
                        continue
                    z = float(zscore_by_layer[layer].loc[zone, ind_id])
                    pri = int(priority_by_layer[layer].loc[zone, ind_id])
                    cl = str(classification_by_layer[layer].loc[zone, ind_id])
                    val = raw_by_layer[layer].loc[zone, ind_id]
                    layer_data[layer] = {
                        "value": round(float(val), 4) if not pd.isna(val) else None,
                        "z_score": round(z, 3),
                        "priority": pri,
                        "classification": cl,
                    }
                indicator_status[ind_id] = layer_data

            total_priority = layer_priorities.get("full", 0)
            if total_priority >= 15:
                status = "Critical"
            elif total_priority >= 12:
                status = "Poor"
            elif total_priority >= 8:
                status = "Moderate"
            else:
                status = "Good"

            # Get zone_id and area_sqm from meta
            zone_id = zone
            area_sqm = 0.0
            for ind_id in ind_ids:
                for lyr in LAYERS:
                    m = meta_by_layer.get((zone, ind_id, lyr), {})
                    if m.get("zone_id"):
                        zone_id = m["zone_id"]
                    if m.get("area_sqm"):
                        area_sqm = m["area_sqm"]
                    if zone_id != zone:
                        break
                if zone_id != zone:
                    break

            # Composite z-score: mean of abs(z_score) across all indicators in full layer
            composite_zscore = 0.0
            if "full" in zscore_by_layer and zone in zscore_by_layer["full"].index:
                full_z = zscore_by_layer["full"].loc[zone]
                abs_z = full_z.abs().dropna()
                if len(abs_z) > 0:
                    composite_zscore = round(float(abs_z.mean()), 4)

            diagnostics.append(ZoneDiagnostic(
                zone_id=zone_id,
                zone_name=zone,
                area_sqm=area_sqm,
                status=status,
                total_priority=total_priority,
                composite_zscore=composite_zscore,
                priority_by_layer=layer_priorities,
                problems_by_layer=problems_by_layer,
                indicator_status=indicator_status,
            ))

        diagnostics.sort(key=lambda d: d.composite_zscore, reverse=True)
        # Assign rank: 1 = highest composite z-score (worst)
        for rank_idx, diag in enumerate(diagnostics, start=1):
            diag.rank = rank_idx
        return diagnostics

    @staticmethod
    def _compute_layer_statistics(
        raw_by_layer: dict[str, pd.DataFrame],
        meta_by_layer: dict,
    ) -> dict[str, dict]:
        """Compute per-indicator per-layer aggregate statistics."""
        result: dict[str, dict] = {}
        for layer, df in raw_by_layer.items():
            for ind_id in df.columns:
                col = df[ind_id].dropna()
                if ind_id not in result:
                    result[ind_id] = {}
                result[ind_id][layer] = {
                    "N": int(len(col)),
                    "Mean": round(float(col.mean()), 4) if len(col) > 0 else None,
                    "Std": round(float(col.std()), 4) if len(col) > 1 else None,
                    "Min": round(float(col.min()), 4) if len(col) > 0 else None,
                    "Max": round(float(col.max()), 4) if len(col) > 0 else None,
                }
        return result


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------

def _classify(
    z: float,
    direction: str,
    thresholds: tuple[float, float, float] = (0.5, 1.0, 1.5),
) -> tuple[str, int]:
    """Classify a Z-score into a label + priority (0=Excellent … 5=Critical)."""
    moderate, significant, critical = thresholds

    if direction == "INCREASE":
        if z <= -critical:
            return "Critical", 5
        if z <= -significant:
            return "Needs Attention", 4
        if z <= -moderate:
            return "Moderate", 3
        if z <= moderate:
            return "Acceptable", 2
        if z <= significant:
            return "Good", 1
        return "Excellent", 0
    else:  # DECREASE or NEUTRAL
        if z >= critical:
            return "Critical", 5
        if z >= significant:
            return "Needs Attention", 4
        if z >= moderate:
            return "Moderate", 3
        if z >= -moderate:
            return "Acceptable", 2
        if z >= -significant:
            return "Good", 1
        return "Excellent", 0


def _calc_corr_pval(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Pearson correlation + p-value matrices (min 3 data points)."""
    cols = list(df.columns)
    n = len(cols)
    corr_m = pd.DataFrame(np.zeros((n, n)), index=cols, columns=cols)
    pval_m = pd.DataFrame(np.ones((n, n)), index=cols, columns=cols)

    for i, c1 in enumerate(cols):
        for j, c2 in enumerate(cols):
            if i == j:
                corr_m.loc[c1, c2] = 1.0
                pval_m.loc[c1, c2] = 0.0
            elif j > i:
                mask = df[c1].notna() & df[c2].notna()
                if mask.sum() >= 3:
                    r, p = scipy_stats.pearsonr(df.loc[mask, c1], df.loc[mask, c2])
                    corr_m.loc[c1, c2] = r
                    corr_m.loc[c2, c1] = r
                    pval_m.loc[c1, c2] = p
                    pval_m.loc[c2, c1] = p

    return corr_m, pval_m
