"""
Design Engine Service  (Stage 3 — v5.0)
Signature-based IOM matching with 4-factor scoring, enriched LLM prompts,
deterministic transferability computation.

Pipeline per unit:
  Agent A (LLM) → Spatial diagnosis → IOM queries
  Python         → Signature-based IOM matching (4-factor)
  Agent B (LLM) → Strategy synthesis with signatures

Depends on KnowledgeBase (IOM + evidence + context + appendix) and LLMClient.
"""

import asyncio
import json
import logging
import re
from collections import Counter, defaultdict
from typing import Any, Optional

from app.models.analysis import (
    DesignStrategyRequest,
    DesignStrategyResult,
    ZoneDesignOutput,
    ZoneDiagnostic,
    ZoneAnalysisResult,
    MatchedIOM,
    DesignStrategy,
    IOMQuery,
    ProjectContext,
)
from app.services.knowledge_base import KnowledgeBase
from app.services.llm_client import LLMClient
from app.services.transferability import compute_transferability

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tokenize(s: str) -> set[str]:
    s = re.sub(r"[^a-z0-9\s]", " ", (s or "").lower())
    return {t for t in s.split() if len(t) >= 3}


def _safe_get(d: dict, path: list[str], default=None):
    cur = d
    for p in path:
        if not isinstance(cur, dict) or p not in cur:
            return default
        cur = cur[p]
    return cur


def _build_encoding_lookup(section: dict, name_field: str = "name", def_field: str = "definition") -> dict:
    lookup = {}
    if not isinstance(section, dict):
        return lookup
    for code, info in section.items():
        if not isinstance(info, dict):
            continue
        lookup[code] = {
            "name": info.get(name_field, info.get("name", code)),
            "description": info.get(def_field, info.get("definition", "")),
        }
    return lookup


def _get_encoding_info(encoding_id: str, info_dict: dict) -> dict:
    return info_dict.get(encoding_id, {"name": encoding_id, "description": ""})


def _parse_json_from_text(text: str) -> dict:
    """Extract first JSON object from text, handling markdown fences."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return {}


# Transferability overall → score mapping
_XFER_SCORE = {"high": 1.0, "moderate": 0.7, "low": 0.4, "unknown": 0.3}

# Confidence grade → score mapping
_CONF_SCORE = {"GRD_A": 1.0, "GRD_B": 0.7, "GRD_C": 0.4}


# ---------------------------------------------------------------------------
# DesignEngine
# ---------------------------------------------------------------------------

class DesignEngine:
    """Stage 3: diagnosis → IOM matching → strategy generation (v5.0)."""

    def __init__(self, knowledge_base: KnowledgeBase, llm_client: LLMClient):
        self.kb = knowledge_base
        self.llm = llm_client

        # Index IOM records by source indicator
        self._iom_by_indicator: dict[str, list[dict]] = defaultdict(list)
        for rec in self.kb.iom:
            ind_id = _safe_get(rec, ["source_indicator", "indicator_id"])
            if ind_id and ind_id.startswith("IND_"):
                self._iom_by_indicator[ind_id].append(rec)

        # Index evidence by id
        self._evidence_by_id: dict[str, dict] = {
            r.get("evidence_id"): r
            for r in self.kb.evidence
            if r.get("evidence_id")
        }

        # Encoding lookups from appendix — new Z_* tables
        appendix = self.kb.appendix or {}
        self._z_operations = _build_encoding_lookup(appendix.get("Z_operation_types", {}))
        self._z_semantic = _build_encoding_lookup(appendix.get("Z_semantic_layers", {}))
        self._z_spatial = _build_encoding_lookup(appendix.get("Z_spatial_layers", {}))
        self._z_morphological = _build_encoding_lookup(appendix.get("Z_morphological_attributes", {}))

        # Additional lookups still needed
        self._pathway_type = _build_encoding_lookup(appendix.get("G_pathways", {}))
        self._confidence_grade = _build_encoding_lookup(appendix.get("F_quality", {}))
        self._indicator_info = _build_encoding_lookup(appendix.get("A_indicators", {}))
        self._scope_patterns = _build_encoding_lookup(appendix.get("Z_scope_types", {}))
        self._pattern_types = _build_encoding_lookup(appendix.get("Z_pattern_types", {}))

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def generate_design_strategies(
        self, request: DesignStrategyRequest
    ) -> DesignStrategyResult:
        zone_analysis = request.zone_analysis
        allowed = set(request.allowed_indicator_ids) if request.allowed_indicator_ids else None
        use_llm = request.use_llm and self.llm.check_connection()

        # Prefer segment_diagnostics (from clustering) over zone_diagnostics
        diagnostics = zone_analysis.zone_diagnostics
        if zone_analysis.segment_diagnostics:
            diagnostics = zone_analysis.segment_diagnostics

        zones_output: dict[str, ZoneDesignOutput] = {}

        for diag in diagnostics:
            zone_id = diag.zone_id

            # Sub-step 1: Diagnosis → IOM queries
            try:
                if use_llm:
                    iom_queries = await self._llm_diagnosis(
                        diag, zone_analysis, request.project_context, allowed
                    )
                else:
                    iom_queries = self._rule_based_diagnosis(diag, zone_analysis, allowed)
            except Exception as e:
                logger.warning("LLM diagnosis failed for %s, using fallback: %s", zone_id, e)
                iom_queries = self._rule_based_diagnosis(diag, zone_analysis, allowed)

            # Sub-step 2: IOM Matching (deterministic, 4-factor scoring)
            matched_ioms = self._match_ioms(
                iom_queries, request.max_ioms_per_query, request.project_context
            )

            # Sub-step 3: Strategy Generation
            try:
                if use_llm and matched_ioms:
                    design_out = await self._llm_strategy_generation(
                        diag, matched_ioms, request.project_context,
                        zone_analysis,
                        list(allowed) if allowed else [],
                        request.max_strategies_per_zone,
                    )
                else:
                    design_out = self._rule_based_strategies(diag, matched_ioms, allowed)
            except Exception as e:
                logger.warning("LLM strategy gen failed for %s, using fallback: %s", zone_id, e)
                design_out = self._rule_based_strategies(diag, matched_ioms, allowed)

            zones_output[zone_id] = ZoneDesignOutput(
                zone_id=zone_id,
                zone_name=diag.zone_name,
                status=diag.status,
                overall_assessment=design_out.get("overall_assessment", ""),
                matched_ioms=[MatchedIOM(**m) for m in matched_ioms],
                design_strategies=[DesignStrategy(**s) for s in design_out.get("design_strategies", [])],
                implementation_sequence=design_out.get("implementation_sequence", ""),
                synergies=design_out.get("synergies", ""),
            )

        return DesignStrategyResult(
            zones=zones_output,
            metadata={
                "version": "5.0",
                "diagnosis_mode": "LLM" if use_llm else "rule-based",
                "diagnosis_source": "segments" if zone_analysis.segment_diagnostics else "zones",
                "total_zones": len(zones_output),
                "total_strategies": sum(
                    len(z.design_strategies) for z in zones_output.values()
                ),
                "total_iom_matches": sum(
                    len(z.matched_ioms) for z in zones_output.values()
                ),
            },
        )

    # ------------------------------------------------------------------
    # Sub-step 1a: LLM Diagnosis (Agent A)
    # ------------------------------------------------------------------

    async def _llm_diagnosis(
        self,
        diag: ZoneDiagnostic,
        zone_analysis: ZoneAnalysisResult,
        project_context: ProjectContext,
        allowed: Optional[set[str]],
    ) -> list[dict]:
        ind_defs = zone_analysis.indicator_definitions
        allowed_list = list(allowed) if allowed else list(diag.indicator_status.keys())

        # Build enriched context
        ctx = self._build_diagnosis_context(diag, zone_analysis, project_context)

        # Build indicator table
        ind_lines = []
        for ind_id in allowed_list:
            layer_data = diag.indicator_status.get(ind_id, {})
            full = layer_data.get("full", layer_data) if isinstance(layer_data, dict) else {}
            defn = ind_defs.get(ind_id)
            target_dir = defn.target_direction if defn else "INCREASE"
            ind_lines.append(
                f"  {ind_id}: value={full.get('mean', full.get('value', 'N/A'))}, "
                f"z_score={full.get('z_score', 'N/A')}, "
                f"priority={full.get('priority', 'N/A')}, "
                f"status={full.get('classification', full.get('status', 'N/A'))}, "
                f"target_direction={target_dir}"
            )
        indicator_table = '\n'.join(ind_lines) if ind_lines else '(no indicator data)'

        # Build layer breakdown
        layer_lines = []
        layer_stats = zone_analysis.layer_statistics or {}
        for ind_id in allowed_list:
            ls = layer_stats.get(ind_id, {})
            if ls:
                fg = ls.get('foreground', {})
                mg = ls.get('middleground', {})
                bg = ls.get('background', {})
                layer_lines.append(
                    f"  {ind_id}: FG={fg.get('Mean', 'N/A')}, "
                    f"MG={mg.get('Mean', 'N/A')}, BG={bg.get('Mean', 'N/A')}")
        layer_table = '\n'.join(layer_lines) if layer_lines else '(no layer data)'

        # Build correlation string
        corr_lines = []
        for cp in ctx.get("significant_correlations", [])[:10]:
            corr_lines.append(
                f"  {cp['indicator_a']} <-> {cp['indicator_b']}: r={cp['correlation']}, "
                f"p={cp['p_value']} ({cp['layer']})")
        correlations = '\n'.join(corr_lines) if corr_lines else '(no significant correlations)'

        # Build clustering context
        clustering_ctx = ctx.get("clustering")
        if clustering_ctx and clustering_ctx.get("archetypes"):
            clust_lines = [f"Clustering: k={clustering_ctx['k']}, silhouette={clustering_ctx.get('silhouette_score', 'N/A')}"]
            for a in clustering_ctx["archetypes"]:
                clust_lines.append(f"  Archetype {a['id']}: \"{a['label']}\" ({a.get('point_count', '?')} points)")
            clustering_text = '\n'.join(clust_lines)
        else:
            clustering_text = '(no clustering performed)'

        # Cross-zone overview
        cross_zone = ctx.get("cross_zone_overview", [])
        if len(cross_zone) > 1:
            cz_lines = []
            for cz in cross_zone:
                marker = " <- THIS UNIT" if cz["zone_id"] == diag.zone_id else ""
                cz_lines.append(f"  {cz['zone_name']} ({cz['zone_id']}): status={cz['status']}, rank={cz['rank']}{marker}")
            overview_text = '\n'.join(cz_lines)
            relative_position = f"Rank {diag.rank}/{len(cross_zone)} by composite z-score (1=worst)"
        else:
            overview_text = f"Single-unit project: {diag.zone_name}"
            relative_position = "Only unit in project"

        prompt = f"""You are an expert landscape analyst. IMPORTANT: Respond ONLY in English.
Analyze this spatial unit's indicator data and generate IOM queries
(which indicators to change, in what direction) for the IOM matching engine.

## Project
- Name: {project_context.project.get('name', 'N/A')}
- Climate: {project_context.context.get('climate', {}).get('koppen_zone_id', 'N/A')}
- Setting: {project_context.context.get('urban_form', {}).get('space_type_id', 'N/A')}
- Design brief: {(project_context.performance_query.get('design_brief', '') or '')[:500]}
- Target dimensions: {json.dumps(project_context.performance_query.get('dimensions', []))}

## Project-Wide Overview ({len(cross_zone)} units total)
{overview_text}

## This Unit: {diag.zone_name} ({diag.zone_id})
- Status: {diag.status}
- Rank: {relative_position}

## Indicator Values (full layer)
{indicator_table}

## Layer Breakdown (FG / MG / BG)
{layer_table}

## Significant Indicator Correlations
{correlations}

## Clustering Context
{clustering_text}

## Constraints
| ID | Rule |
|----|------|
| C1 | Only use indicator IDs from this list: {json.dumps(allowed_list)} |
| C2 | Direction must be "increase" or "decrease" — based on the indicator's target_direction and current z_score |
| C3 | Priority 1-3: 3=most urgent. Base on z_score magnitude and alignment with design brief |
| C4 | Consider layer breakdown: a problem may be severe in foreground but acceptable in background |
| C5 | Consider correlations: changing one indicator may cascade to correlated indicators |
| C6 | Consider neighbours: interventions should be compatible with adjacent zones' conditions |
| C7 | Do NOT invent indicator IDs |
| C8 | Output valid JSON only, no markdown fences |

Return ONLY valid JSON:
{{
  "zone_id": "{diag.zone_id}",
  "integrated_diagnosis": "2-3 sentence diagnosis referencing specific indicator values, layer patterns, cross-indicator correlations, and the unit's relative position within the project",
  "cross_zone_notes": "If multi-zone: how this unit relates to its neighbours. If single unit: null",
  "iom_queries": [
    {{
      "indicator_id": "IND_xxx",
      "direction": "increase|decrease",
      "priority": 3,
      "target_layer": "foreground|middleground|background|all",
      "qualitative_target": "What should change and why",
      "constraints": ["heritage conservation", ...]
    }}
  ]
}}"""

        raw_text = await self._call_llm(prompt)
        data = _parse_json_from_text(raw_text)

        queries_raw = data.get("iom_queries", []) or []
        cleaned: list[dict] = []
        for q in queries_raw:
            if not isinstance(q, dict):
                continue
            ind = (q.get("indicator_id") or "").strip()
            direction = self._normalize_direction(q.get("direction"))
            if allowed and ind not in allowed:
                continue
            if direction == "maintain":
                continue
            cleaned.append({
                "indicator_id": ind,
                "direction": direction,
                "priority": int(q.get("priority", 1) or 1),
                "qualitative_target": q.get("qualitative_target", ""),
                "constraints": q.get("constraints", []),
            })

        cleaned.sort(key=lambda x: -x.get("priority", 1))
        return cleaned[:6]

    # ------------------------------------------------------------------
    # Sub-step 1b: Rule-based Diagnosis (fallback)
    # ------------------------------------------------------------------

    def _rule_based_diagnosis(
        self,
        diag: ZoneDiagnostic,
        zone_analysis: ZoneAnalysisResult,
        allowed: Optional[set[str]],
    ) -> list[dict]:
        ind_defs = zone_analysis.indicator_definitions
        queries: list[dict] = []

        for ind_id, layer_data in diag.indicator_status.items():
            if allowed and ind_id not in allowed:
                continue
            if not self._iom_by_indicator.get(ind_id):
                continue

            ind_def = ind_defs.get(ind_id)
            target_dir = (ind_def.target_direction if ind_def else "INCREASE").upper()

            if target_dir == "INCREASE":
                direction = "increase"
            elif target_dir == "DECREASE":
                direction = "decrease"
            else:
                direction = "maintain"

            if direction == "maintain":
                continue

            status_priority = {"Critical": 3, "Poor": 2, "Moderate": 1, "Good": 0}
            priority = status_priority.get(diag.status, 1)

            queries.append({
                "indicator_id": ind_id,
                "direction": direction,
                "priority": priority,
                "qualitative_target": f"{direction.capitalize()} {ind_id} (status: {diag.status})",
                "constraints": [],
            })

        queries.sort(key=lambda x: -x.get("priority", 1))
        return queries[:6]

    # ------------------------------------------------------------------
    # Sub-step 2: IOM Matching (deterministic, 4-factor scoring)
    # ------------------------------------------------------------------

    def _match_ioms(
        self,
        iom_queries: list[dict],
        max_per_query: int = 6,
        project_context: Optional[ProjectContext] = None,
    ) -> list[dict]:
        all_matched: list[dict] = []

        for q in iom_queries:
            ind_id = q.get("indicator_id", "")
            direction = (q.get("direction") or "").lower()
            if direction not in ("increase", "decrease"):
                continue

            candidates = self._iom_by_indicator.get(ind_id, [])
            scored: list[tuple[float, dict]] = []

            for iom in candidates:
                dir_s = self._direction_score(direction, iom)
                conf_s = self._confidence_score(iom)
                desc_s = 0.5 if iom.get("based_on_descriptive_evidence") else 1.0
                xfer_s, xfer_detail = self._transferability_score(iom, project_context)

                total = dir_s * conf_s * desc_s * xfer_s
                scored.append((total, iom, xfer_detail))

            scored.sort(key=lambda x: -x[0])

            for score_val, iom, xfer_detail in scored[:max_per_query]:
                operation = iom.get("operation", {})
                sigs_raw = operation.get("signatures", [])
                pathway = operation.get("pathway", {})
                confidence = iom.get("confidence", {})

                ind_info = _get_encoding_info(ind_id, self._indicator_info)

                # Expand signatures
                sigs_expanded = self._expand_signatures(sigs_raw)

                # Expand scope
                scope_data = operation.get("scope", {})
                scope_expanded = {
                    "pattern": self._expand_code(
                        scope_data.get("pattern_code", ""), self._pattern_types
                    ),
                    "signature_count": scope_data.get("signature_count", len(sigs_raw)),
                }

                # Expand pathway
                pth_id = pathway.get("pathway_type_id", "")
                pth_info = _get_encoding_info(pth_id, self._pathway_type)
                pathway_expanded = {
                    "pathway_type": {"id": pth_id, **pth_info},
                    "mechanism_description": pathway.get("mechanism_description", ""),
                }

                # Expand confidence
                grade_id = confidence.get("overall_grade_id", "")
                grade_info = _get_encoding_info(grade_id, self._confidence_grade)
                conf_expanded = {
                    "grade_id": grade_id,
                    "grade": grade_info.get("name", grade_id),
                    "description": grade_info.get("description", ""),
                }

                all_matched.append({
                    "iom_id": iom.get("iom_id"),
                    "indicator_id": ind_id,
                    "indicator_name": ind_info.get("name", ind_id),
                    "direction": direction,
                    "score": round(score_val, 4),
                    "linked_evidence_id": iom.get("linked_evidence_id"),
                    "operation": {
                        "description": operation.get("description", ""),
                        "pathway_expanded": pathway_expanded,
                    },
                    "predicted_effect": iom.get("predicted_effect", {}),
                    "confidence_expanded": conf_expanded,
                    "source_indicator": iom.get("source_indicator", {}),
                    # v5.0 new fields
                    "signatures": sigs_expanded,
                    "scope": scope_expanded,
                    "transferability": xfer_detail,
                    "is_descriptive": bool(iom.get("based_on_descriptive_evidence")),
                    "source_citation": _safe_get(iom, ["source", "citation"]),
                })

        return all_matched

    # ------------------------------------------------------------------
    # Sub-step 3a: LLM Strategy Generation (Agent B)
    # ------------------------------------------------------------------

    async def _llm_strategy_generation(
        self,
        diag: ZoneDiagnostic,
        matched_ioms: list[dict],
        project_context: ProjectContext,
        zone_analysis: ZoneAnalysisResult,
        allowed_ids: list[str],
        max_strategies: int = 5,
    ) -> dict:
        # Group IOMs by indicator (top 3 per)
        by_ind: dict[str, list[dict]] = defaultdict(list)
        for m in matched_ioms:
            by_ind[m["indicator_id"]].append(m)

        # Build IOM summary with signatures for prompt
        iom_summary = []
        for ind_id, ioms in by_ind.items():
            for m in ioms[:3]:
                iom_summary.append({
                    "iom_id": m.get("iom_id"),
                    "indicator": {"id": ind_id, "name": m.get("indicator_name", ind_id)},
                    "direction": m.get("direction", "improve"),
                    "score": m.get("score", 0),
                    "operation_description": _safe_get(m, ["operation", "description"], "")[:250],
                    "signatures": m.get("signatures", []),
                    "scope": m.get("scope", {}),
                    "pathway": _safe_get(m, ["operation", "pathway_expanded"], {}),
                    "confidence": m.get("confidence_expanded", {}),
                    "transferability": m.get("transferability", {}),
                    "is_descriptive": m.get("is_descriptive", False),
                    "predicted_effect": {
                        "indicator_change": _safe_get(m, ["predicted_effect", "indicator_effect", "change_note"], ""),
                        "performance_change": _safe_get(m, ["predicted_effect", "performance_effect", "expected_change_note"], ""),
                    },
                })

        # Build indicator profile for this unit
        ind_defs = zone_analysis.indicator_definitions
        profile_lines = []
        for ind_id in allowed_ids:
            layer_data = diag.indicator_status.get(ind_id, {})
            full = layer_data.get("full", layer_data) if isinstance(layer_data, dict) else {}
            defn = ind_defs.get(ind_id)
            if full:
                profile_lines.append(
                    f"  {ind_id} ({defn.name if defn else '?'}): "
                    f"value={full.get('mean', full.get('value', 'N/A'))}, "
                    f"z={full.get('z_score', 'N/A')}, "
                    f"status={full.get('classification', full.get('status', 'N/A'))}, "
                    f"target={defn.target_direction if defn else 'N/A'}")
        unit_indicator_profile = '\n'.join(profile_lines) if profile_lines else '(no data)'

        # Layer data
        layer_lines = []
        layer_stats = zone_analysis.layer_statistics or {}
        for ind_id in allowed_ids:
            ls = layer_stats.get(ind_id, {})
            if ls:
                parts = [f"{l}={ls.get(l, {}).get('Mean', 'N/A')}" for l in ['foreground', 'middleground', 'background']]
                layer_lines.append(f"  {ind_id}: {', '.join(parts)}")
        unit_layer_data = '\n'.join(layer_lines) if layer_lines else '(no layer data)'

        # Encoding dictionary subset
        encoding_subset = self.kb.get_codebook_subset(max_chars=20000)

        prompt = f"""You are an expert landscape architect. IMPORTANT: Respond ONLY in English.
Synthesize the matched IOM operations into 3-{min(max_strategies, 5)} concrete, actionable design
strategies for this spatial unit. Ground every strategy in the provided IOM evidence.

## Project
- Name: {project_context.project.get('name', 'N/A')}
- Climate: {project_context.context.get('climate', {}).get('koppen_zone_id', 'N/A')}
- Setting: {project_context.context.get('urban_form', {}).get('space_type_id', 'N/A')}
- Design brief: {(project_context.performance_query.get('design_brief', '') or '')[:500]}

## Spatial Unit: {diag.zone_name} ({diag.zone_id})
- Status: {diag.status}
- Area: {diag.area_sqm} sqm

## Current Indicator Profile
{unit_indicator_profile}

## Layer Breakdown
{unit_layer_data}

## Matched IOM Operations ({len(iom_summary)} matches)
Each match contains:
- indicator: the SVC indicator to modify
- direction: increase or decrease
- operation_description: what physical change to make
- signatures: 4-axis encoding (Operation x Semantic Layer x Spatial Layer x Morphological Attribute)
- pathway: the causal mechanism linking intervention to performance
- confidence: evidence grade (GRD_A > GRD_B > GRD_C)
- transferability: context match to this project (high > moderate > low)
- is_descriptive: if true, evidence is descriptive only (lower causal confidence)

```json
{json.dumps(iom_summary, ensure_ascii=False, indent=2)[:15000]}
```

## Encoding Dictionary Reference
```json
{json.dumps(encoding_subset, ensure_ascii=False, indent=2)[:12000]}
```

## Core Constraints
| ID | Rule |
|----|------|
| C1 | Only use indicator IDs from: {json.dumps(allowed_ids)} |
| C2 | Every strategy MUST cite supporting_iom_ids from the matched operations above |
| C3 | Do NOT invent IOM IDs, indicator IDs, or signature codes |
| C4 | Flag strategies based primarily on descriptive evidence (is_descriptive=true) |
| C5 | Note transferability caveats for strategies based on low-transferability IOMs |
| C6 | Use the 4-axis signature system to specify spatial interventions precisely |
| C7 | Output valid JSON only |

## Reasoning Steps
1. Group matched IOMs by indicator and spatial layer
2. Identify synergies (IOMs that reinforce each other) and conflicts (trade-offs)
3. Prioritise by: confidence grade > transferability > query priority
4. Synthesise into 3-{min(max_strategies, 5)} strategies with precise spatial-morphological specifications
5. Describe implementation sequence considering dependencies

CRITICAL: You may ONLY reference indicators from: {allowed_ids}

Generate {min(max_strategies, 5)} concrete design strategies. Return ONLY valid JSON:
{{
  "overall_assessment": "2-3 sentence summary of main issues and strategy direction",
  "design_strategies": [
    {{
      "priority": 1,
      "strategy_name": "Descriptive name",
      "target_indicators": ["IND_xxx"],
      "spatial_location": "foreground/midground/background",
      "intervention": {{"object": "...", "action": "...", "variable": "...", "specific_guidance": "..."}},
      "expected_effects": [{{"indicator": "IND_xxx", "direction": "increase", "magnitude": "moderate"}}],
      "confidence": "High/Medium/Low",
      "potential_tradeoffs": "string",
      "supporting_ioms": ["I_SVCs_xxx"],
      "signatures": [
        {{
          "operation": {{"code": "ACT_XXX", "name": "..."}},
          "semantic_layer": {{"code": "OBJ_XXX", "name": "..."}},
          "spatial_layer": {{"code": "TER_XXX", "name": "..."}},
          "morphological_attr": {{"code": "VAR_XXX", "name": "..."}}
        }}
      ],
      "pathway": {{"pathway_type": "...", "mechanism_description": "..."}},
      "boundary_effects": "string or null",
      "transferability_note": "Evidence from ... climate, compatible with project context",
      "implementation_guidance": "Specific guidance for this project context"
    }}
  ],
  "implementation_sequence": "Recommended order and phasing",
  "synergies": "How strategies interact"
}}"""

        raw_text = await self._call_llm(prompt)
        result = _parse_json_from_text(raw_text)

        # Validate: strip indicator refs not in allowed list
        allowed_set = set(allowed_ids)
        for s in result.get("design_strategies", []):
            if "target_indicators" in s:
                s["target_indicators"] = [i for i in s["target_indicators"] if i in allowed_set]
            if "expected_effects" in s:
                s["expected_effects"] = [e for e in s["expected_effects"] if e.get("indicator") in allowed_set]

        result["design_strategies"] = [
            s for s in result.get("design_strategies", []) if s.get("target_indicators")
        ]

        return result

    # ------------------------------------------------------------------
    # Sub-step 3b: Rule-based strategies (fallback)
    # ------------------------------------------------------------------

    def _rule_based_strategies(
        self,
        diag: ZoneDiagnostic,
        matched_ioms: list[dict],
        allowed: Optional[set[str]],
    ) -> dict:
        strategies: list[dict] = []
        seen_indicators: set[str] = set()

        for iom in sorted(matched_ioms, key=lambda x: -x.get("score", 0)):
            ind_id = iom.get("indicator_id", "")
            if allowed and ind_id not in allowed:
                continue
            if ind_id in seen_indicators:
                continue
            seen_indicators.add(ind_id)

            sigs = iom.get("signatures", [])
            primary_sig = sigs[0] if sigs else {}
            pathway = _safe_get(iom, ["operation", "pathway_expanded"], {})

            strategies.append({
                "priority": len(strategies) + 1,
                "strategy_name": f"Improve {iom.get('indicator_name', ind_id)}",
                "target_indicators": [ind_id],
                "spatial_location": _safe_get(primary_sig, ["spatial_layer", "name"], "General"),
                "intervention": {
                    "object": _safe_get(primary_sig, ["semantic_layer", "name"], "Vegetation"),
                    "action": _safe_get(primary_sig, ["operation", "name"], "Modify"),
                    "variable": _safe_get(primary_sig, ["morphological_layer", "name"], "Configuration"),
                    "specific_guidance": _safe_get(iom, ["operation", "description"], "")[:200],
                },
                "expected_effects": [{
                    "indicator": ind_id,
                    "direction": iom.get("direction", "improve"),
                    "magnitude": "moderate",
                }],
                "confidence": _safe_get(iom, ["confidence_expanded", "grade"], "Medium"),
                "potential_tradeoffs": "Review site conditions before implementation",
                "supporting_ioms": [iom.get("iom_id")] if iom.get("iom_id") else [],
                # v5.0 fields
                "signatures": sigs[:3],
                "pathway": pathway,
                "transferability_note": iom.get("transferability", {}).get("overall", "unknown"),
                "implementation_guidance": _safe_get(iom, ["operation", "description"], "")[:300],
            })

            if len(strategies) >= 5:
                break

        return {
            "overall_assessment": f"Zone requires attention on {len(seen_indicators)} indicator(s)",
            "design_strategies": strategies,
            "implementation_sequence": "Prioritize by strategy number",
            "synergies": "Strategies may have cumulative positive effects",
        }

    # ------------------------------------------------------------------
    # Scoring helpers (v5.0: 4-factor)
    # ------------------------------------------------------------------

    @staticmethod
    def _direction_score(query_dir: str, iom: dict) -> float:
        """Direction alignment using expected_change_id (primary) with target_value fallback."""
        # Primary: use expected_change_id from predicted_effect
        change_id = _safe_get(iom, ["predicted_effect", "indicator_effect", "expected_change_id"], "")

        if change_id and change_id not in ("DIR_NA", ""):
            if query_dir == "increase" and change_id == "DIR_POS":
                return 1.0
            if query_dir == "decrease" and change_id == "DIR_NEG":
                return 1.0
            if query_dir == "increase" and change_id == "DIR_NEG":
                return 0.2
            if query_dir == "decrease" and change_id == "DIR_POS":
                return 0.2
            return 0.5

        # Fallback: target_value text matching
        tgt = str(_safe_get(iom, ["source_indicator", "target_value"], "")).lower()
        inc_words = {"high", "higher", "increase", "more", "maximize"}
        dec_words = {"low", "lower", "decrease", "less", "minimize"}

        if query_dir == "increase" and any(w in tgt for w in inc_words):
            return 0.9
        if query_dir == "decrease" and any(w in tgt for w in dec_words):
            return 0.9
        if query_dir == "increase" and any(w in tgt for w in dec_words):
            return 0.3
        if query_dir == "decrease" and any(w in tgt for w in inc_words):
            return 0.3
        return 0.5

    @staticmethod
    def _confidence_score(iom: dict) -> float:
        """Score by confidence grade."""
        grade = _safe_get(iom, ["confidence", "overall_grade_id"], "")
        return _CONF_SCORE.get(grade, 0.5)

    def _transferability_score(
        self, iom: dict, project_context: Optional[ProjectContext] = None
    ) -> tuple[float, dict]:
        """Score by pre-computed transferability."""
        evidence_id = iom.get("linked_evidence_id", "")
        ctx_record = self.kb.context_by_evidence.get(evidence_id)

        # Build project dict from ProjectContext
        if project_context and project_context.context:
            proj = {
                "koppen_zone_id": _safe_get(project_context.context, ["climate", "koppen_zone_id"], ""),
                "lcz_type_id": _safe_get(project_context.context, ["urban_form", "lcz_type_id"], ""),
                "space_type_id": _safe_get(project_context.context, ["urban_form", "space_type_id"], ""),
                "age_group_id": _safe_get(project_context.context, ["user", "age_group_id"], ""),
            }
        else:
            proj = {}

        xfer = compute_transferability({"evidence_id": evidence_id}, ctx_record, proj)
        score = _XFER_SCORE.get(xfer.get("overall", "unknown"), 0.3)
        return score, xfer

    # ------------------------------------------------------------------
    # Signature expansion helpers (v5.0)
    # ------------------------------------------------------------------

    def _expand_signatures(self, signatures: list[dict]) -> list[dict]:
        """Expand signature codes into human-readable objects using Z_* tables."""
        expanded = []
        for sig in signatures:
            op_id = sig.get("operation_id", "")
            sem_id = sig.get("semantic_layer_id", "")
            spa_id = sig.get("spatial_layer_id", "")
            mor_id = sig.get("morphological_layer_id", "")
            expanded.append({
                "sig_id": sig.get("sig_id", ""),
                "role": sig.get("role", ""),
                "subtype": sig.get("subtype", ""),
                "mechanism": (sig.get("mechanism", "") or "")[:200],
                "operation": {"id": op_id, **_get_encoding_info(op_id, self._z_operations)},
                "semantic_layer": {"id": sem_id, **_get_encoding_info(sem_id, self._z_semantic)},
                "spatial_layer": {"id": spa_id, **_get_encoding_info(spa_id, self._z_spatial)},
                "morphological_layer": {"id": mor_id, **_get_encoding_info(mor_id, self._z_morphological)},
            })
        return expanded

    def _expand_code(self, code: str, lookup: dict) -> dict:
        """Expand a single code using a lookup table."""
        info = lookup.get(code, {"name": code, "description": ""})
        return {"code": code, "name": info.get("name", code)}

    # ------------------------------------------------------------------
    # Context builders
    # ------------------------------------------------------------------

    def _build_diagnosis_context(
        self,
        diag: ZoneDiagnostic,
        zone_analysis: ZoneAnalysisResult,
        project_context: ProjectContext,
    ) -> dict:
        """Build enriched context for Agent A diagnosis prompt."""
        # Significant correlations (|r| > 0.3)
        sig_correlations = []
        for layer, corr_matrix in (zone_analysis.correlation_by_layer or {}).items():
            pval_matrix = (zone_analysis.pvalue_by_layer or {}).get(layer, {})
            for ind_a, row in corr_matrix.items():
                for ind_b, corr_val in row.items():
                    if ind_a >= ind_b:
                        continue
                    if corr_val is not None and abs(corr_val) > 0.3:
                        pval = pval_matrix.get(ind_a, {}).get(ind_b)
                        sig_correlations.append({
                            "layer": layer,
                            "indicator_a": ind_a,
                            "indicator_b": ind_b,
                            "correlation": round(corr_val, 3),
                            "p_value": round(pval, 4) if isinstance(pval, (int, float)) else pval,
                        })
        sig_correlations.sort(key=lambda x: -abs(x["correlation"]))

        # Clustering context
        clustering_ctx = None
        if zone_analysis.clustering:
            c = zone_analysis.clustering
            clustering_ctx = {
                "k": c.k,
                "silhouette_score": c.silhouette_score,
                "archetypes": [
                    {
                        "id": a.archetype_id,
                        "label": a.archetype_label,
                        "point_count": a.point_count,
                        "centroid_z": a.centroid_z_scores,
                    }
                    for a in (c.archetype_profiles or [])
                ],
            }

        # Cross-zone overview
        all_diags = zone_analysis.zone_diagnostics or []
        if zone_analysis.segment_diagnostics:
            all_diags = zone_analysis.segment_diagnostics
        cross_zone = [
            {
                "zone_id": d.zone_id,
                "zone_name": d.zone_name,
                "status": d.status,
                "rank": d.rank,
                "composite_zscore": round(d.composite_zscore, 2) if d.composite_zscore else 0,
            }
            for d in all_diags
        ]

        return {
            "significant_correlations": sig_correlations[:20],
            "clustering": clustering_ctx,
            "cross_zone_overview": cross_zone,
        }

    # ------------------------------------------------------------------
    # LLM call helper
    # ------------------------------------------------------------------

    async def _call_llm(self, prompt: str) -> str:
        """Call current LLM provider."""
        return await self.llm.generate(prompt)

    @staticmethod
    def _normalize_direction(d: Optional[str]) -> str:
        d = (d or "").strip().lower()
        if d in ("increase", "inc", "raise", "higher", "up", "improve"):
            return "increase"
        if d in ("decrease", "dec", "reduce", "lower", "down"):
            return "decrease"
        return "maintain"
