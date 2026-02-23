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

        # Build evidence section (limit to avoid token limits)
        evidence_text = "\n## Relevant Evidence\n"
        for idx, record in enumerate(evidence_records[:50]):  # Limit to 50 records
            indicator = record.get('indicator', {})
            performance = record.get('performance', {})
            relationship = record.get('relationship', {})
            quality = record.get('quality', {})

            evidence_text += f"""
### Evidence {idx + 1}
- Evidence ID: {record.get('evidence_id', '')}
- Indicator: {indicator.get('indicator_id', '')} - {indicator.get('name', '')}
- Performance: {performance.get('dimension_id', '')} / {performance.get('subdimension_id', '')}
- Relationship: {relationship.get('direction', {}).get('name', '')}
- Effect Size: {relationship.get('effect_size', 'N/A')}
- Confidence: {quality.get('confidence', {}).get('name', '')}
"""

        # Build indicator definitions section
        indicator_text = "\n## Available Indicators\n"
        for ind in indicator_defs[:30]:  # Limit
            indicator_text += f"- {ind.get('code', '')}: {ind.get('name', '')}\n"

        # Build the full prompt
        prompt = f"""You are an expert in urban greenspace analysis and evidence-based design.
Your task is to recommend the most relevant indicators for measuring and improving
urban greenspace based on the project context and available evidence.

{context}

{evidence_text}

{indicator_text}

## Task
Based on the project context and evidence above, recommend up to {request.max_recommendations}
indicators that are most relevant for this project.

For each indicator, provide:
1. indicator_id: The indicator code (e.g., IND_GVI)
2. indicator_name: The full name
3. relevance_score: A score from 0 to 1 indicating relevance
4. rationale: Why this indicator is relevant for this project
5. evidence_ids: List of evidence IDs that support this recommendation
6. relationship_direction: Expected direction (positive/negative)
7. confidence: Confidence level (high/medium/low)

## Output Format
Return ONLY a valid JSON array of recommendations. Example:
[
  {{
    "indicator_id": "IND_GVI",
    "indicator_name": "Green View Index",
    "relevance_score": 0.95,
    "rationale": "Highly relevant for visual quality assessment...",
    "evidence_ids": ["EVD_001", "EVD_023"],
    "relationship_direction": "positive",
    "confidence": "high"
  }}
]

Return ONLY the JSON array, no additional text.
"""
        return prompt

    def _parse_response(self, response_text: str) -> list[dict]:
        """Parse LLM response to extract JSON"""
        try:
            # Try direct JSON parse
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

        # Try to find JSON array pattern
        array_match = re.search(r'\[\s*\{[\s\S]*\}\s*\]', response_text)
        if array_match:
            try:
                return json.loads(array_match.group(0))
            except json.JSONDecodeError:
                pass

        logger.error(f"Failed to parse LLM response: {response_text[:500]}")
        return []

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

            # Convert to recommendation objects
            recommendations = []
            for item in parsed:
                try:
                    rec = IndicatorRecommendation(
                        indicator_id=item.get('indicator_id', ''),
                        indicator_name=item.get('indicator_name', ''),
                        relevance_score=float(item.get('relevance_score', 0)),
                        rationale=item.get('rationale', ''),
                        evidence_ids=item.get('evidence_ids', []),
                        relationship_direction=item.get('relationship_direction', ''),
                        confidence=item.get('confidence', ''),
                    )
                    recommendations.append(rec)
                except Exception as e:
                    logger.warning(f"Failed to parse recommendation: {e}")
                    continue

            # Get evidence count
            evidence_count = len(knowledge_base.get_evidence_for_dimensions(
                request.performance_dimensions
            ))

            return RecommendationResponse(
                success=True,
                recommendations=recommendations,
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
