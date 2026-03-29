"""
Recommendation Service — Two-Agent Architecture
Agent 1 (Evidence Assessor): per-indicator assessment cards
Agent 2 (Ranker & Selector): rank, select top indicators, output final JSON

Transferability is pre-computed in Python — never delegated to LLM.
"""

import json
import logging
import re
from collections import defaultdict, Counter

from app.models.indicator import (
    RecommendationRequest,
    RecommendationResponse,
    IndicatorRecommendation,
    EvidenceCitation,
    EvidenceSummary,
    TransferabilitySummary,
    IndicatorRelationship,
    RecommendationSummary,
)
from app.services.knowledge_base import KnowledgeBase
from app.services.llm_client import LLMClient
from app.services.transferability import enrich_evidence

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

AGENT1_PROMPT = """\
# SceneRx-AI Stage 1 — Agent 1: Evidence Assessor

## Task
You receive grouped evidence records organized by indicator. Each evidence
record already has a pre-computed `_transferability` field — do NOT recompute
it; simply count the values per indicator.

For each indicator group, produce an "assessment card" summarizing evidence
strength and transferability.

## Project Profile
- Climate: {project_climate}
- LCZ: {project_lcz}
- Setting: {project_setting}
- User groups: {project_users}
- Target dimensions: {target_dims}
- Target subdimensions: {target_subdims}

## Transferability
Each evidence record already contains a `_transferability` field with:
- climate_match, lcz_match, setting_match, user_group_match
- overall: "high" | "moderate" | "low" | "unknown"

Simply count the `overall` values per indicator for your assessment card.
Do NOT recompute transferability — it was computed deterministically upstream.

## Evidence Strength Criteria (priority order)
1. evidence_tier_id: TIR_T1 > TIR_T2 > TIR_T3
2. is_descriptive_statistic: false (inferential) > true (descriptive)
3. framework_mapping_basis: "direct" > any proxy
4. significance_id: SIG_001 > SIG_01 > SIG_05 > SIG_NS
5. relationship.type_id: REL_REG/REL_MED (causal-leaning) > REL_COR > REL_DES

## Strength Score Definition
- **A**: >=2 inferential records, best tier TIR_T1 or TIR_T2, significance >= SIG_01,
  at least one with framework_mapping_basis = "direct"
- **B**: >=1 inferential record, best tier TIR_T2+, significance >= SIG_05
- **C**: descriptive-only, or all evidence is TIR_T3, or no significance >= SIG_05

## Input Data

### Indicator Groups ({n_indicators} indicators, {n_evidence} total records)
```json
{indicator_data}
```

## Output
Output a JSON array. One object per indicator:
```json
[
  {{
    "indicator_id": "IND_XXX",
    "evidence_count": 5,
    "inferential_count": 4,
    "descriptive_count": 1,
    "dominant_direction": "DIR_POS | DIR_NEG | DIR_MIX",
    "strongest_tier": "TIR_T1 | TIR_T2 | TIR_T3",
    "best_significance": "SIG_001 | SIG_01 | SIG_05 | SIG_NS",
    "has_direct_mapping": true,
    "transferability_summary": {{
      "high_count": 2,
      "moderate_count": 1,
      "low_count": 0,
      "unknown_count": 2
    }},
    "dimensions_covered": ["PRF_AES"],
    "subdimensions_covered": ["PRS_AES_ATTR"],
    "strength_score": "A | B | C",
    "key_evidence_ids": ["SVCs_P_XXX", "SVCs_P_YYY"],
    "assessment_note": "Brief 1-2 sentence summary"
  }}
]
```

Output valid JSON only. No markdown fences, no commentary.
"""

AGENT2_PROMPT = """\
# SceneRx-AI Stage 1 — Agent 2: Indicator Ranker & Selector

## Task
You receive assessment cards from Agent 1, plus the Encoding Dictionary and
the project profile. Select the top {max_recommendations} indicators and produce
the final structured JSON output.

## Project Profile
- Name: {project_name}
- Climate: {project_climate}
- LCZ: {project_lcz}
- Setting: {project_setting}
- User groups: {project_users}
- Design brief: {design_brief}
- Target dimensions: {target_dims}
- Target subdimensions: {target_subdims}

## Encoding Dictionary ({cb_table_count} tables)
Use this to expand every code to {{code, name, definition}}.
```json
{codebook}
```

## Assessment Cards ({n_cards} indicators)
```json
{cards}
```

## Core Constraints
| ID | Constraint |
|----|-----------|
| C1 | Every recommended indicator MUST reference evidence_ids from the assessment cards. Do NOT invent. |
| C2 | Expand ALL codes to {{code, name, definition}} via the Encoding Dictionary. No bare codes. |
| C3 | Do NOT output numerical target values — only INCREASE / DECREASE. |
| C4 | Indicators with strength_score "C" should NOT be recommended unless no better alternatives exist. |
| C5 | Output valid JSON only. No markdown fences, no commentary outside the JSON. |
| C6 | Only use dimension/subdimension codes that exist in the Encoding Dictionary (C_performance, C_subdimensions). Do NOT invent codes. |

## Selection Rules
1. **Rank by**: (a) strength_score A > B > C, (b) transferability high > moderate > low > unknown,
   (c) subdimension relevance to target.
2. **Coverage**: at least one indicator per target dimension (where evidence exists).
3. **Diversity**: include both compositional (CAT_CMP) and configurational (CAT_CFG/CAT_CCG)
   if evidence supports them.
4. **Quality floor**: exclude indicators supported only by descriptive evidence (inferential_count = 0).
5. **Conflict flag**: if dominant_direction = DIR_MIX, note this in rationale.

## Output Schema
```json
{{
  "recommended_indicators": [
    {{
      "rank": 1,
      "indicator_id": "IND_XXX",
      "indicator_name": "Full name",
      "relevance_score": 0.95,
      "dimension_id": "PRF_XXX",
      "subdimension_id": "PRS_XXX",
      "evidence_summary": {{
        "evidence_ids": ["SVCs_P_XXX"],
        "inferential_count": 4,
        "descriptive_count": 1,
        "strength_score": "A",
        "strongest_tier": "TIR_T1",
        "best_significance": "SIG_001",
        "dominant_direction": "DIR_POS"
      }},
      "transferability_summary": {{
        "high_count": 2,
        "moderate_count": 1,
        "low_count": 0,
        "unknown_count": 2
      }},
      "relationship_direction": "INCREASE | DECREASE",
      "confidence": "high | medium | low",
      "rationale": "2-3 sentences"
    }}
  ],
  "indicator_relationships": [
    {{
      "indicator_a": "IND_A",
      "indicator_b": "IND_B",
      "relationship_type": "SYNERGISTIC | TRADE_OFF | INDEPENDENT",
      "explanation": "How they interact"
    }}
  ],
  "summary": {{
    "key_findings": ["Finding 1"],
    "evidence_gaps": ["Gap 1"],
    "transferability_caveats": ["Caveat 1"],
    "dimension_coverage": [
      {{"dimension_id": "PRF_XXX", "indicator_count": 0, "evidence_count": 0}}
    ]
  }}
}}
```

Output valid JSON only.
"""


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class RecommendationService:
    """Two-agent indicator recommendation service."""

    def __init__(self, llm: LLMClient):
        self.llm = llm

    @property
    def model(self) -> str:
        return self.llm.model

    def check_api_key(self) -> bool:
        return self.llm.check_connection()

    # -- JSON parsing -------------------------------------------------------

    @staticmethod
    def _parse_json(text: str):
        """Extract JSON from LLM response with auto-repair."""
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Auto-repair truncated JSON
        repaired = text.rstrip().rstrip(',: \n\t"\'')
        repaired += "]" * max(0, text.count("[") - text.count("]"))
        repaired += "}" * max(0, text.count("{") - text.count("}"))
        try:
            result = json.loads(repaired)
            logger.warning("JSON auto-repaired (truncation)")
            return result
        except json.JSONDecodeError:
            pass

        # Fallback: regex extract
        obj_match = re.search(r'\{\s*"recommended_indicators"[\s\S]*\}', text)
        if obj_match:
            try:
                return json.loads(obj_match.group(0))
            except json.JSONDecodeError:
                pass

        arr_match = re.search(r'\[\s*\{[\s\S]*\}\s*\]', text)
        if arr_match:
            try:
                return json.loads(arr_match.group(0))
            except json.JSONDecodeError:
                pass

        logger.error("Failed to parse LLM response: %s", text[:500])
        return None

    # -- Agent calls --------------------------------------------------------

    async def _call_agent(self, prompt: str, tag: str):
        """Send prompt to LLM, return parsed JSON."""
        logger.info("%s — sending ~%d tokens", tag, len(prompt) // 4)
        raw = await self.llm.generate(prompt)
        if not raw:
            logger.error("%s — empty response", tag)
            return None
        logger.info("%s — received %d chars", tag, len(raw))
        return self._parse_json(raw)

    # -- Main pipeline ------------------------------------------------------

    async def recommend_indicators(
        self,
        request: RecommendationRequest,
        knowledge_base: KnowledgeBase,
    ) -> RecommendationResponse:
        """Two-agent recommendation pipeline."""
        try:
            if not self.llm.check_connection():
                return RecommendationResponse(
                    success=False,
                    error=f"LLM provider ({self.llm.provider}) not configured",
                )

            if not knowledge_base.loaded:
                knowledge_base.load()

            # ── 1. Retrieve evidence ──
            matched = knowledge_base.retrieve_evidence(
                request.performance_dimensions,
                request.subdimensions or None,
            )
            if not matched:
                return RecommendationResponse(
                    success=False,
                    error="No evidence found for the selected dimensions",
                )

            # ── 2. Pre-compute transferability (Python, NOT LLM) ──
            project_ctx = {
                "koppen_zone_id": request.koppen_zone_id,
                "lcz_type_id": request.lcz_type_id,
                "space_type_id": request.space_type_id,
                "age_group_id": request.age_group_id,
            }
            matched = enrich_evidence(
                matched,
                knowledge_base.context_by_evidence,
                project_ctx,
            )

            # ── 3. Group by indicator ──
            indicator_groups: dict[str, list[dict]] = defaultdict(list)
            for e in matched:
                indicator_groups[e["indicator"]["indicator_id"]].append(e)

            logger.info(
                "Retrieved %d evidence → %d indicators",
                len(matched), len(indicator_groups),
            )

            # ── 4. Agent 1: Evidence Assessor ──
            # Limit evidence per indicator to keep prompt manageable
            MAX_EVIDENCE_PER_INDICATOR = 5
            indicator_data = []
            for ind_id, evds in indicator_groups.items():
                evds_clean = [
                    {k: v for k, v in e.items() if k != "_ctx"}
                    for e in evds
                ]
                # Prioritise: high-transferability first, then by quality tier
                evds_sorted = sorted(
                    evds_clean,
                    key=lambda e: (
                        {"high": 0, "moderate": 1, "low": 2, "unknown": 3}.get(
                            e.get("_transferability", {}).get("overall", "unknown"), 3
                        ),
                        {"TIR_T1": 0, "TIR_T2": 1, "TIR_T3": 2}.get(
                            e.get("quality", {}).get("evidence_tier_id", ""), 2
                        ),
                    ),
                )
                indicator_data.append({
                    "indicator_id": ind_id,
                    "evidence_count": len(evds_clean),
                    "evidence": evds_sorted[:MAX_EVIDENCE_PER_INDICATOR],
                })

            agent1_prompt = AGENT1_PROMPT.format(
                project_climate=request.koppen_zone_id or "N/A",
                project_lcz=request.lcz_type_id or "N/A",
                project_setting=request.space_type_id or "N/A",
                project_users=request.age_group_id or "N/A",
                target_dims=json.dumps(request.performance_dimensions),
                target_subdims=json.dumps(request.subdimensions),
                n_indicators=len(indicator_data),
                n_evidence=len(matched),
                indicator_data=json.dumps(indicator_data, ensure_ascii=False),
            )

            assessment_cards = await self._call_agent(agent1_prompt, "Agent 1: Assessor")
            if not isinstance(assessment_cards, list):
                logger.warning("Agent 1 returned non-list: %s", type(assessment_cards))
                return RecommendationResponse(
                    success=False,
                    error="Agent 1 (Evidence Assessor) failed to produce valid output",
                )

            logger.info("Agent 1 produced %d assessment cards", len(assessment_cards))

            # ── 5. Agent 2: Ranker & Selector ──
            cb_subset = knowledge_base.get_codebook_subset()

            agent2_prompt = AGENT2_PROMPT.format(
                project_name=request.project_name or "N/A",
                project_climate=request.koppen_zone_id or "N/A",
                project_lcz=request.lcz_type_id or "N/A",
                project_setting=request.space_type_id or "N/A",
                project_users=request.age_group_id or "N/A",
                design_brief=request.design_brief or "N/A",
                target_dims=json.dumps(request.performance_dimensions),
                target_subdims=json.dumps(request.subdimensions),
                codebook=json.dumps(cb_subset, ensure_ascii=False),
                cb_table_count=len(cb_subset),
                n_cards=len(assessment_cards),
                cards=json.dumps(assessment_cards, ensure_ascii=False),
                max_recommendations=request.max_recommendations,
            )

            result = await self._call_agent(agent2_prompt, "Agent 2: Ranker")
            if not isinstance(result, dict) or "recommended_indicators" not in result:
                logger.warning("Agent 2 returned unexpected format")
                return RecommendationResponse(
                    success=False,
                    error="Agent 2 (Ranker) failed to produce valid output",
                )

            # ── 6. Parse into response models ──
            return self._build_response(result, len(matched))

        except Exception as e:
            logger.error("Recommendation error: %s", e, exc_info=True)
            return RecommendationResponse(success=False, error=str(e))

    # -- Response building --------------------------------------------------

    @staticmethod
    def _as_str(val) -> str:
        """Normalize LLM output: accept both 'CODE' and {'code': 'CODE', ...}."""
        if isinstance(val, dict):
            return val.get("code", val.get("id", str(val)))
        return str(val) if val is not None else ""

    def _build_response(self, result: dict, evidence_count: int) -> RecommendationResponse:
        raw_recs = result.get("recommended_indicators", [])
        logger.info("_build_response: %d raw recommended_indicators", len(raw_recs))

        _s = self._as_str

        recommendations: list[IndicatorRecommendation] = []
        for item in raw_recs:
            try:
                es_raw = item.get("evidence_summary", {})
                ts_raw = item.get("transferability_summary", {})

                rec = IndicatorRecommendation(
                    indicator_id=_s(item.get("indicator_id", "")),
                    indicator_name=_s(item.get("indicator_name", "")),
                    relevance_score=float(item.get("relevance_score", 0)),
                    rationale=_s(item.get("rationale", "")),
                    evidence_ids=es_raw.get("evidence_ids", []),
                    rank=item.get("rank", 0),
                    relationship_direction=_s(item.get("relationship_direction", "")),
                    confidence=_s(item.get("confidence", "")),
                    strength_score=_s(es_raw.get("strength_score", "")),
                    dimension_id=_s(item.get("dimension_id", "")),
                    subdimension_id=_s(item.get("subdimension_id", "")),
                    evidence_summary=EvidenceSummary(
                        evidence_ids=es_raw.get("evidence_ids", []),
                        inferential_count=es_raw.get("inferential_count", 0),
                        descriptive_count=es_raw.get("descriptive_count", 0),
                        strength_score=_s(es_raw.get("strength_score", "")),
                        strongest_tier=_s(es_raw.get("strongest_tier", "")),
                        best_significance=_s(es_raw.get("best_significance", "")),
                        dominant_direction=_s(es_raw.get("dominant_direction", "")),
                    ) if es_raw else None,
                    transferability_summary=TransferabilitySummary(
                        high_count=ts_raw.get("high_count", 0),
                        moderate_count=ts_raw.get("moderate_count", 0),
                        low_count=ts_raw.get("low_count", 0),
                        unknown_count=ts_raw.get("unknown_count", 0),
                    ) if ts_raw else None,
                )
                recommendations.append(rec)
            except Exception as e:
                logger.warning("Failed to parse recommendation item: %s | item=%s", e, json.dumps(item, ensure_ascii=False)[:300])

        relationships: list[IndicatorRelationship] = []
        for rr in result.get("indicator_relationships", []):
            try:
                relationships.append(IndicatorRelationship(
                    indicator_a=_s(rr.get("indicator_a", "")),
                    indicator_b=_s(rr.get("indicator_b", "")),
                    relationship_type=_s(rr.get("relationship_type", "")),
                    explanation=_s(rr.get("explanation", "")),
                ))
            except Exception as e:
                logger.warning("Failed to parse relationship: %s", e)

        summary: RecommendationSummary | None = None
        raw_summary = result.get("summary")
        if raw_summary and isinstance(raw_summary, dict):
            summary = RecommendationSummary(
                key_findings=raw_summary.get("key_findings", []),
                evidence_gaps=raw_summary.get("evidence_gaps", []),
                transferability_caveats=raw_summary.get("transferability_caveats", []),
                dimension_coverage=raw_summary.get("dimension_coverage", []),
            )

        return RecommendationResponse(
            success=True,
            recommendations=recommendations,
            indicator_relationships=relationships,
            summary=summary,
            total_evidence_reviewed=evidence_count,
            model_used=self.llm.model,
        )


# Backward-compatible alias
GeminiClient = RecommendationService
