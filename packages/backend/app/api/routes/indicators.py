"""Indicator recommendation endpoints"""

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_gemini_client, get_knowledge_base
from app.services.gemini_client import GeminiClient
from app.services.knowledge_base import KnowledgeBase
from app.models.indicator import (
    RecommendationRequest,
    RecommendationResponse,
    IndicatorDefinition,
)

router = APIRouter()


@router.post("/recommend", response_model=RecommendationResponse)
async def recommend_indicators(
    request: RecommendationRequest,
    gemini_client: GeminiClient = Depends(get_gemini_client),
    knowledge_base: KnowledgeBase = Depends(get_knowledge_base),
):
    """
    Get AI-powered indicator recommendations based on project context.

    Uses the knowledge base evidence and Gemini AI to recommend
    the most relevant indicators for the project.
    """
    # Check if Gemini is configured
    if not gemini_client.check_api_key():
        raise HTTPException(
            status_code=503,
            detail="Gemini API not configured. Please set GOOGLE_API_KEY."
        )

    # Get recommendations
    response = await gemini_client.recommend_indicators(request, knowledge_base)

    if not response.success:
        raise HTTPException(
            status_code=500,
            detail=response.error or "Failed to get recommendations"
        )

    return response


@router.get("/definitions", response_model=list[dict])
async def get_indicator_definitions(
    knowledge_base: KnowledgeBase = Depends(get_knowledge_base),
):
    """Get all indicator definitions from knowledge base"""
    return knowledge_base.get_indicator_definitions()


@router.get("/dimensions", response_model=list[dict])
async def get_performance_dimensions(
    knowledge_base: KnowledgeBase = Depends(get_knowledge_base),
):
    """Get all performance dimensions from knowledge base"""
    return knowledge_base.get_performance_dimensions()


@router.get("/subdimensions", response_model=list[dict])
async def get_subdimensions(
    knowledge_base: KnowledgeBase = Depends(get_knowledge_base),
):
    """Get all subdimensions from knowledge base"""
    return knowledge_base.get_subdimensions()


@router.get("/evidence/{indicator_id}")
async def get_evidence_for_indicator(
    indicator_id: str,
    knowledge_base: KnowledgeBase = Depends(get_knowledge_base),
):
    """Get evidence records for a specific indicator"""
    evidence = knowledge_base.get_evidence_for_indicator(indicator_id)
    return {
        "indicator_id": indicator_id,
        "evidence_count": len(evidence),
        "evidence": evidence,
    }


@router.get("/evidence/dimension/{dimension_id}")
async def get_evidence_for_dimension(
    dimension_id: str,
    knowledge_base: KnowledgeBase = Depends(get_knowledge_base),
):
    """Get evidence records for a specific performance dimension"""
    evidence = knowledge_base.get_evidence_for_dimension(dimension_id)
    return {
        "dimension_id": dimension_id,
        "evidence_count": len(evidence),
        "evidence": evidence,
    }


@router.get("/knowledge-base/summary")
async def get_knowledge_base_summary(
    knowledge_base: KnowledgeBase = Depends(get_knowledge_base),
):
    """Get knowledge base summary"""
    return knowledge_base.get_summary()
