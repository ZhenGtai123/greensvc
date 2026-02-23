"""
Design Engine Service  (Stage 3)
LLM-powered diagnosis, deterministic IOM matching, strategy generation.

Depends on KnowledgeBase (IOM + evidence + appendix) and LLMClient.
"""

import asyncio
import json
import logging
import re
from collections import defaultdict
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
        return json.loads(m.group(0))
    return {}


# ---------------------------------------------------------------------------
# DesignEngine
# ---------------------------------------------------------------------------

class DesignEngine:
    """Stage 3: diagnosis → IOM matching → strategy generation."""

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

        # Encoding lookups from appendix
        appendix = self.kb.appendix or {}
        self._spatial_tier = _build_encoding_lookup(appendix.get("G_spatial", {}))
        self._landscape_object = _build_encoding_lookup(appendix.get("H_objects", {}))
        self._action_verb = _build_encoding_lookup(appendix.get("I_actions", {}))
        self._spatial_variable = _build_encoding_lookup(
            appendix.get("F_operation_encoding", {}), name_field="term"
        )
        self._pathway_type = _build_encoding_lookup(appendix.get("G_pathways", {}))
        self._confidence_grade = _build_encoding_lookup(appendix.get("F_quality", {}))
        self._indicator_info = _build_encoding_lookup(appendix.get("A_indicators", {}))

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def generate_design_strategies(
        self, request: DesignStrategyRequest
    ) -> DesignStrategyResult:
        zone_analysis = request.zone_analysis
        allowed = set(request.allowed_indicator_ids) if request.allowed_indicator_ids else None
        use_llm = request.use_llm and self.llm.check_connection()

        zones_output: dict[str, ZoneDesignOutput] = {}

        for diag in zone_analysis.zone_diagnostics:
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

            # Sub-step 2: IOM Matching (deterministic)
            matched_ioms = self._match_ioms(iom_queries, request.max_ioms_per_query)

            # Sub-step 3: Strategy Generation
            try:
                if use_llm and matched_ioms:
                    design_out = await self._llm_strategy_generation(
                        diag, matched_ioms, request.project_context,
                        list(allowed) if allowed else [], request.max_strategies_per_zone,
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
                "diagnosis_mode": "LLM" if use_llm else "rule-based",
                "total_zones": len(zones_output),
                "total_strategies": sum(
                    len(z.design_strategies) for z in zones_output.values()
                ),
            },
        )

    # ------------------------------------------------------------------
    # Sub-step 1a: LLM Diagnosis
    # ------------------------------------------------------------------

    async def _llm_diagnosis(
        self,
        diag: ZoneDiagnostic,
        zone_analysis: ZoneAnalysisResult,
        project_context: ProjectContext,
        allowed: Optional[set[str]],
    ) -> list[dict]:
        ind_defs = zone_analysis.indicator_definitions
        indicators_summary = {}
        for ind_id, layer_data in diag.indicator_status.items():
            indicators_summary[ind_id] = layer_data

        defs = {}
        for ind_id in diag.indicator_status:
            if ind_id in ind_defs:
                d = ind_defs[ind_id]
                defs[ind_id] = {"id": d.id, "name": d.name, "definition": d.definition, "unit": d.unit}

        allowed_list = list(allowed) if allowed else list(diag.indicator_status.keys())

        prompt = f"""You are an expert landscape analyst. IMPORTANT: Respond ONLY in English.
Analyze this zone and provide diagnosis.

Project: {json.dumps(project_context.model_dump(), ensure_ascii=False)}

Zone: {diag.zone_name} (Status: {diag.status})
allowed_indicator_ids: {allowed_list}
Indicator Stats: {json.dumps(indicators_summary, ensure_ascii=False)}
Indicator Definitions: {json.dumps(defs, ensure_ascii=False)}

Return ONLY valid JSON:
{{
  "zone_id": "string",
  "integrated_diagnosis": "string",
  "iom_queries": [
    {{"indicator_id": "IND_xxx", "direction": "increase|decrease|maintain", "priority": 1, "qualitative_target": "string", "constraints": []}}
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
    # Sub-step 2: IOM Matching (deterministic)
    # ------------------------------------------------------------------

    def _match_ioms(self, iom_queries: list[dict], max_per_query: int = 6) -> list[dict]:
        all_matched: list[dict] = []

        for q in iom_queries:
            ind_id = q.get("indicator_id", "")
            direction = (q.get("direction") or "").lower()
            if direction not in ("increase", "decrease"):
                continue

            candidates = self._iom_by_indicator.get(ind_id, [])
            scored: list[tuple[float, dict]] = []

            for iom in candidates:
                dir_score = self._direction_score(direction, iom)
                txt_score = self._text_score(q.get("qualitative_target", ""), iom)
                evd_bonus = 1.05 if iom.get("linked_evidence_id") in self._evidence_by_id else 1.0
                score = dir_score * txt_score * evd_bonus
                scored.append((score, iom))

            scored.sort(key=lambda x: -x[0])

            for score, iom in scored[:max_per_query]:
                operation = iom.get("operation", {})
                encoding = operation.get("encoding", {})
                pathway = operation.get("pathway", {})
                confidence = iom.get("confidence", {})

                ind_info = _get_encoding_info(ind_id, self._indicator_info)
                all_matched.append({
                    "iom_id": iom.get("iom_id"),
                    "indicator_id": ind_id,
                    "indicator_name": ind_info.get("name", ind_id),
                    "direction": direction,
                    "score": round(score, 4),
                    "linked_evidence_id": iom.get("linked_evidence_id"),
                    "operation": {
                        "description": operation.get("description", ""),
                        "encoding_expanded": self._expand_encoding(encoding),
                        "pathway_expanded": self._expand_pathway(pathway),
                        "hierarchy": operation.get("hierarchy", {}),
                    },
                    "predicted_effect": iom.get("predicted_effect", {}),
                    "confidence_expanded": self._expand_confidence(confidence),
                    "source_indicator": iom.get("source_indicator", {}),
                })

        return all_matched

    # ------------------------------------------------------------------
    # Sub-step 3a: LLM Strategy Generation
    # ------------------------------------------------------------------

    async def _llm_strategy_generation(
        self,
        diag: ZoneDiagnostic,
        matched_ioms: list[dict],
        project_context: ProjectContext,
        allowed_ids: list[str],
        max_strategies: int = 5,
    ) -> dict:
        # Group IOMs by indicator (top 3 per)
        by_ind: dict[str, list[dict]] = defaultdict(list)
        for m in matched_ioms:
            by_ind[m["indicator_id"]].append(m)

        iom_summary = []
        for ind_id, ioms in by_ind.items():
            iom_summary.append({
                "indicator": {"id": ind_id, "name": ioms[0].get("indicator_name", ind_id)},
                "target_direction": ioms[0].get("direction", "improve"),
                "matched_operations": [
                    {
                        "iom_id": m.get("iom_id"),
                        "description": m.get("operation", {}).get("description", "")[:200],
                        "spatial_tier": _safe_get(m, ["operation", "encoding_expanded", "spatial_tier", "name"], ""),
                        "object": _safe_get(m, ["operation", "encoding_expanded", "landscape_object", "name"], ""),
                        "action": _safe_get(m, ["operation", "encoding_expanded", "action_verb", "name"], ""),
                        "variable": _safe_get(m, ["operation", "encoding_expanded", "spatial_variable", "name"], ""),
                        "confidence": _safe_get(m, ["confidence_expanded", "grade"], ""),
                        "score": m.get("score", 0),
                    }
                    for m in ioms[:3]
                ],
            })

        prompt = f"""You are an expert landscape architect. IMPORTANT: Respond ONLY in English.
Based on matched IOM entries, generate specific design strategies for this zone.

CRITICAL: You may ONLY reference indicators from: {allowed_ids}

Project Context: {json.dumps(project_context.model_dump(), indent=2, ensure_ascii=False)}

Zone: {diag.zone_name} (ID: {diag.zone_id}, Status: {diag.status}, Area: {diag.area_sqm} sqm)

Matched IOMs: {json.dumps(iom_summary, indent=2, ensure_ascii=False)}

Generate {min(max_strategies, 5)} concrete design strategies. Return ONLY valid JSON:
{{
  "overall_assessment": "string",
  "design_strategies": [
    {{
      "priority": 1,
      "strategy_name": "string",
      "target_indicators": ["IND_xxx"],
      "spatial_location": "foreground/midground/background",
      "intervention": {{"object": "...", "action": "...", "variable": "...", "specific_guidance": "..."}},
      "expected_effects": [{{"indicator": "IND_xxx", "direction": "increase", "magnitude": "moderate"}}],
      "confidence": "High/Medium/Low",
      "potential_tradeoffs": "string",
      "supporting_ioms": ["IOM_xxx"]
    }}
  ],
  "implementation_sequence": "string",
  "synergies": "string"
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

            enc = iom.get("operation", {}).get("encoding_expanded", {})
            strategies.append({
                "priority": len(strategies) + 1,
                "strategy_name": f"Improve {iom.get('indicator_name', ind_id)}",
                "target_indicators": [ind_id],
                "spatial_location": enc.get("spatial_tier", {}).get("name", "General"),
                "intervention": {
                    "object": enc.get("landscape_object", {}).get("name", "Vegetation"),
                    "action": enc.get("action_verb", {}).get("name", "Modify"),
                    "variable": enc.get("spatial_variable", {}).get("name", "Configuration"),
                    "specific_guidance": iom.get("operation", {}).get("description", "")[:200],
                },
                "expected_effects": [{
                    "indicator": ind_id,
                    "direction": iom.get("direction", "improve"),
                    "magnitude": "moderate",
                }],
                "confidence": _safe_get(iom, ["confidence_expanded", "grade"], "Medium"),
                "potential_tradeoffs": "Review site conditions before implementation",
                "supporting_ioms": [iom.get("iom_id")] if iom.get("iom_id") else [],
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
    # Scoring helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _direction_score(query_dir: str, iom: dict) -> float:
        tgt = str(_safe_get(iom, ["source_indicator", "target_value"], "")).lower()
        inc_words = {"high", "higher", "increase", "more", "maximize"}
        dec_words = {"low", "lower", "decrease", "less", "minimize"}

        if query_dir == "increase" and any(w in tgt for w in inc_words):
            return 1.0
        if query_dir == "decrease" and any(w in tgt for w in dec_words):
            return 1.0
        if query_dir == "increase" and any(w in tgt for w in dec_words):
            return 0.3
        if query_dir == "decrease" and any(w in tgt for w in inc_words):
            return 0.3
        return 0.7

    @staticmethod
    def _text_score(query_text: str, iom: dict) -> float:
        op_desc = _safe_get(iom, ["operation", "description"], "")
        qt = _tokenize(query_text)
        it = _tokenize(op_desc)
        if not qt or not it:
            return 0.6
        jaccard = len(qt & it) / len(qt | it)
        return 0.6 + 0.4 * jaccard

    # ------------------------------------------------------------------
    # Encoding expansion helpers
    # ------------------------------------------------------------------

    def _expand_encoding(self, encoding: dict) -> dict:
        tier_id = encoding.get("spatial_tier_id", "")
        obj_id = encoding.get("landscape_object_id", "")
        act_id = encoding.get("action_verb_id", "")
        var_id = encoding.get("spatial_variable_id", "")
        return {
            "spatial_tier": {"id": tier_id, "name": _get_encoding_info(tier_id, self._spatial_tier).get("name", tier_id)},
            "landscape_object": {"id": obj_id, "name": _get_encoding_info(obj_id, self._landscape_object).get("name", obj_id)},
            "action_verb": {"id": act_id, "name": _get_encoding_info(act_id, self._action_verb).get("name", act_id)},
            "spatial_variable": {"id": var_id, "name": _get_encoding_info(var_id, self._spatial_variable).get("name", var_id)},
            "object_subtype_id": encoding.get("object_subtype_id", ""),
        }

    def _expand_pathway(self, pathway: dict) -> dict:
        pth_id = pathway.get("pathway_type_id", "")
        info = _get_encoding_info(pth_id, self._pathway_type)
        return {
            "pathway_type": {"id": pth_id, "name": info.get("name", pth_id)},
            "mechanism_description": pathway.get("mechanism_description", ""),
        }

    def _expand_confidence(self, confidence: dict) -> dict:
        grade_id = confidence.get("overall_grade_id", "")
        info = _get_encoding_info(grade_id, self._confidence_grade)
        return {
            "grade_id": grade_id,
            "grade": info.get("name", grade_id),
            "description": info.get("description", ""),
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
