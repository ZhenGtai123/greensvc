"""
Recommendation Service (formerly Gemini Client)
Handles AI-powered indicator recommendations using any LLM provider.
"""

import json
import logging
import re

from app.models.indicator import (
    RecommendationRequest,
    RecommendationResponse,
    IndicatorRecommendation,
    EvidenceCitation,
    IndicatorRelationship,
    RecommendationSummary,
)
from app.services.knowledge_base import KnowledgeBase
from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)


class RecommendationService:
    """LLM-powered indicator recommendation service."""

    def __init__(self, llm: LLMClient):
        self.llm = llm

    @property
    def model(self) -> str:
        return self.llm.model

    def check_api_key(self) -> bool:
        return self.llm.check_connection()

    def _build_prompt(
        self,
        request: RecommendationRequest,
        knowledge_base: KnowledgeBase,
    ) -> str:
        """Build the recommendation prompt with evidence context"""
        # Get relevant evidence
        evidence_records = knowledge_base.get_evidence_for_dimensions(
            request.performance_dimensions
        )

        # Additionally filter by subdimension when provided
        if request.subdimensions:
            subdim_set = set(request.subdimensions)
            evidence_records = [
                r for r in evidence_records
                if r.get('performance', {}).get('subdimension_id', '') in subdim_set
            ] or evidence_records  # fallback to unfiltered if no matches

        # Get codebook info
        indicator_defs = knowledge_base.get_indicator_definitions()
        dimension_defs = knowledge_base.get_performance_dimensions()

        # Build context section
        context = f"""
## Project Context
- Project Name: {request.project_name}
- Location: {request.project_location}
- Space Type: {request.space_type_id}
- Climate Zone: {request.koppen_zone_id}
- Performance Goals: {', '.join(request.performance_dimensions)}
- Subdimensions: {', '.join(request.subdimensions)}
- Design Brief: {request.design_brief}
"""

        # Build evidence section (expanded cap)
        evidence_text = "\n## Relevant Evidence\n"
        for idx, record in enumerate(evidence_records[:100]):
            indicator = record.get('indicator', {})
            performance = record.get('performance', {})
            relationship = record.get('relationship', {})
            quality = record.get('quality', {})
            source = record.get('source', {})

            direction_val = relationship.get('direction', '')
            if isinstance(direction_val, dict):
                direction_val = direction_val.get('name', '')
            confidence_val = quality.get('confidence', '')
            if isinstance(confidence_val, dict):
                confidence_val = confidence_val.get('name', '')

            evidence_text += f"""
### Evidence {idx + 1}
- Evidence ID: {record.get('evidence_id', '')}
- Indicator: {indicator.get('indicator_id', '')} - {indicator.get('name', '')}
- Performance: {performance.get('dimension_id', '')} / {performance.get('subdimension_id', '')}
- Relationship: {direction_val}
- Effect Size: {relationship.get('effect_size', 'N/A')}
- Confidence: {confidence_val}
- Citation: {source.get('citation', '')}
- DOI: {source.get('doi', '')}
- Year: {source.get('year', '')}
- Study Setting: {record.get('study', {}).get('setting', {}).get('name', '') if isinstance(record.get('study', {}).get('setting'), dict) else record.get('study', {}).get('setting', '')}
"""

        # Build indicator definitions section (no cap — include all with codebook details)
        indicator_text = "\n## Available Indicators\n"
        if isinstance(indicator_defs, dict):
            for ind_id, ind in indicator_defs.items():
                indicator_text += f"- {ind_id}: {ind.get('name', '')} | {ind.get('definition', '')} | formula: {ind.get('formula', '')} | category: {ind.get('category', '')}\n"
        else:
            for ind in indicator_defs:
                indicator_text += f"- {ind.get('code', '')}: {ind.get('name', '')} | {ind.get('definition', '')} | formula: {ind.get('formula', '')} | category: {ind.get('category', '')}\n"

        # Build the full prompt
        prompt = f"""You are an expert in urban greenspace analysis and evidence-based design.
Your task is to recommend the most relevant indicators for measuring and improving
urban greenspace based on the project context and available evidence.

{context}

{evidence_text}

{indicator_text}

## Task
Based on the project context and evidence above, recommend up to {request.max_recommendations}
indicators that are most relevant for this project. Rank them by relevance (rank 1 = most relevant).

For each indicator, provide:
1. indicator_id: The indicator code (e.g., IND_GVI)
2. indicator_name: The full name
3. rank: Numeric rank (1 = most relevant)
4. relevance_score: A score from 0 to 1 indicating relevance
5. rationale: Why this indicator is relevant for this project
6. evidence_ids: List of evidence IDs that support this recommendation
7. evidence_citations: For each key evidence, include an object with evidence_id, citation, year, doi, direction, effect_size, confidence
8. relationship_direction: Expected direction (positive/negative)
9. confidence: Confidence level (high/medium/low)

Also provide:
- indicator_relationships: Pairs of recommended indicators and how they relate (synergistic/inverse/independent)
- summary: An object with key_findings (list of strings) and evidence_gaps (list of strings)

## Output Format
Return ONLY a valid JSON object. Example:
{{
  "recommended_indicators": [
    {{
      "indicator_id": "IND_GVI",
      "indicator_name": "Green View Index",
      "rank": 1,
      "relevance_score": 0.95,
      "rationale": "Highly relevant for visual quality assessment...",
      "evidence_ids": ["EVD_001", "EVD_023"],
      "evidence_citations": [
        {{"evidence_id": "EVD_001", "citation": "Lu et al. (2018)...", "year": 2018, "doi": "10.xxx", "direction": "positive", "effect_size": "0.45", "confidence": "high"}}
      ],
      "relationship_direction": "positive",
      "confidence": "high"
    }}
  ],
  "indicator_relationships": [
    {{"indicator_a": "IND_GVI", "indicator_b": "IND_SVF", "relationship_type": "synergistic", "explanation": "Both measure visual greenspace exposure..."}}
  ],
  "summary": {{
    "key_findings": ["Finding 1"],
    "evidence_gaps": ["Gap 1"]
  }}
}}

Return ONLY the JSON object, no additional text.
"""
        return prompt

    def _parse_response(self, response_text: str) -> dict | list:
        """Parse LLM response to extract JSON (object or array)."""
        try:
            return json.loads(response_text)
        except json.JSONDecodeError:
            pass

        # Try to extract JSON from markdown code blocks
        json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', response_text)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        # Try to find JSON object pattern (new format)
        obj_match = re.search(r'\{\s*"recommended_indicators"[\s\S]*\}', response_text)
        if obj_match:
            try:
                return json.loads(obj_match.group(0))
            except json.JSONDecodeError:
                pass

        # Fallback: try to find JSON array pattern (legacy)
        array_match = re.search(r'\[\s*\{[\s\S]*\}\s*\]', response_text)
        if array_match:
            try:
                return json.loads(array_match.group(0))
            except json.JSONDecodeError:
                pass

        logger.error(f"Failed to parse LLM response: {response_text[:500]}")
        return []

    @staticmethod
    def _backfill_citation(citation: EvidenceCitation, knowledge_base: KnowledgeBase) -> EvidenceCitation:
        """Enrich a citation with data from the knowledge base when LLM only provided evidence_id."""
        record = knowledge_base.get_evidence_by_id(citation.evidence_id)
        if not record:
            return citation
        source = record.get('source', {})
        relationship = record.get('relationship', {})
        quality = record.get('quality', {})
        direction_val = relationship.get('direction', '')
        if isinstance(direction_val, dict):
            direction_val = direction_val.get('name', '')
        confidence_val = quality.get('confidence', '')
        if isinstance(confidence_val, dict):
            confidence_val = confidence_val.get('name', '')
        return EvidenceCitation(
            evidence_id=citation.evidence_id,
            citation=citation.citation or source.get('citation', ''),
            year=citation.year or source.get('year'),
            doi=citation.doi or source.get('doi', ''),
            direction=citation.direction or direction_val,
            effect_size=citation.effect_size or str(relationship.get('effect_size', '')),
            confidence=citation.confidence or confidence_val,
        )

    async def recommend_indicators(
        self,
        request: RecommendationRequest,
        knowledge_base: KnowledgeBase,
    ) -> RecommendationResponse:
        """Get indicator recommendations from LLM"""
        try:
            if not self.llm.check_connection():
                return RecommendationResponse(
                    success=False,
                    error=f"LLM provider ({self.llm.provider}) not configured"
                )

            if not knowledge_base.loaded:
                knowledge_base.load()

            # Build prompt
            prompt = self._build_prompt(request, knowledge_base)

            # Call LLM
            response_text = await self.llm.generate(prompt)

            if not response_text:
                return RecommendationResponse(
                    success=False,
                    error="Empty response from LLM"
                )

            # Parse response
            parsed = self._parse_response(response_text)

            if not parsed:
                return RecommendationResponse(
                    success=False,
                    error="Failed to parse LLM response"
                )

            # Normalise: new format returns dict with recommended_indicators key;
            # legacy format returns a bare list.
            if isinstance(parsed, dict):
                indicator_items = parsed.get('recommended_indicators', [])
                raw_relationships = parsed.get('indicator_relationships', [])
                raw_summary = parsed.get('summary')
            else:
                indicator_items = parsed
                raw_relationships = []
                raw_summary = None

            # Convert to recommendation objects
            recommendations: list[IndicatorRecommendation] = []
            for idx, item in enumerate(indicator_items):
                try:
                    # Parse evidence_citations from LLM response
                    raw_citations = item.get('evidence_citations', [])
                    citations = []
                    for rc in raw_citations:
                        cit = EvidenceCitation(
                            evidence_id=rc.get('evidence_id', ''),
                            citation=rc.get('citation', ''),
                            year=rc.get('year'),
                            doi=rc.get('doi', ''),
                            direction=rc.get('direction', ''),
                            effect_size=str(rc.get('effect_size', '')),
                            confidence=rc.get('confidence', ''),
                        )
                        # Backfill missing fields from KB
                        cit = self._backfill_citation(cit, knowledge_base)
                        citations.append(cit)

                    rec = IndicatorRecommendation(
                        indicator_id=item.get('indicator_id', ''),
                        indicator_name=item.get('indicator_name', ''),
                        relevance_score=float(item.get('relevance_score', 0)),
                        rationale=item.get('rationale', ''),
                        evidence_ids=item.get('evidence_ids', []),
                        evidence_citations=citations,
                        rank=item.get('rank', idx + 1),
                        relationship_direction=item.get('relationship_direction', ''),
                        confidence=item.get('confidence', ''),
                    )
                    recommendations.append(rec)
                except Exception as e:
                    logger.warning(f"Failed to parse recommendation: {e}")
                    continue

            # Parse indicator relationships
            relationships: list[IndicatorRelationship] = []
            for rr in raw_relationships:
                try:
                    relationships.append(IndicatorRelationship(
                        indicator_a=rr.get('indicator_a', ''),
                        indicator_b=rr.get('indicator_b', ''),
                        relationship_type=rr.get('relationship_type', ''),
                        explanation=rr.get('explanation', ''),
                    ))
                except Exception as e:
                    logger.warning(f"Failed to parse relationship: {e}")

            # Parse summary
            summary: RecommendationSummary | None = None
            if raw_summary and isinstance(raw_summary, dict):
                summary = RecommendationSummary(
                    key_findings=raw_summary.get('key_findings', []),
                    evidence_gaps=raw_summary.get('evidence_gaps', []),
                )

            # Get evidence count
            evidence_count = len(knowledge_base.get_evidence_for_dimensions(
                request.performance_dimensions
            ))

            return RecommendationResponse(
                success=True,
                recommendations=recommendations,
                indicator_relationships=relationships,
                summary=summary,
                total_evidence_reviewed=evidence_count,
                model_used=self.llm.model,
            )

        except Exception as e:
            logger.error(f"Recommendation error: {e}", exc_info=True)
            return RecommendationResponse(
                success=False,
                error=str(e)
            )


# Backward-compatible alias
GeminiClient = RecommendationService
