"""
Analysis Pipeline Async Tasks
Background Celery task for the full Stage 2.5 + Stage 3 pipeline.
"""

import asyncio
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from celery import shared_task

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@shared_task(bind=True)
def run_full_analysis_task(self, request_data: dict, output_path: Optional[str] = None) -> dict:
    """
    Celery task that runs the full analysis pipeline (Stage 2.5 → Stage 3).

    Args:
        request_data: Serialised FullAnalysisRequest dict.
        output_path: Optional path to save JSON results.

    Returns:
        FullAnalysisResult as dict.
    """
    from app.models.analysis import (
        FullAnalysisRequest,
        ZoneAnalysisRequest,
        DesignStrategyRequest,
    )
    from app.services.zone_analyzer import ZoneAnalyzer
    from app.services.design_engine import DesignEngine
    from app.services.knowledge_base import KnowledgeBase
    from app.services.llm_client import create_llm_client

    settings = get_settings()

    # --- Build service instances (tasks don't share FastAPI singletons) ---
    kb = KnowledgeBase(knowledge_base_dir=str(settings.knowledge_base_full_path))
    kb.load()

    # Build LLM client from settings
    provider = settings.llm_provider
    key_map = {
        "gemini": settings.google_api_key,
        "openai": settings.openai_api_key,
        "anthropic": settings.anthropic_api_key,
        "deepseek": settings.deepseek_api_key,
    }
    model_map = {
        "gemini": settings.gemini_model,
        "openai": settings.openai_model,
        "anthropic": settings.anthropic_model,
        "deepseek": settings.deepseek_model,
    }
    llm = create_llm_client(provider, key_map.get(provider, ""), model_map.get(provider, ""))
    analyzer = ZoneAnalyzer()
    engine = DesignEngine(knowledge_base=kb, llm_client=llm)

    request = FullAnalysisRequest(**request_data)

    # --- Stage 2.5 ---
    self.update_state(state="PROGRESS", meta={"stage": "2.5", "status": "Running zone analysis"})

    zone_req = ZoneAnalysisRequest(
        indicator_definitions=request.indicator_definitions,
        zone_statistics=request.zone_statistics,
        zscore_moderate=request.zscore_moderate,
        zscore_significant=request.zscore_significant,
        zscore_critical=request.zscore_critical,
    )
    zone_result = analyzer.analyze(zone_req)

    n_zones = len(zone_result.zone_diagnostics)
    self.update_state(
        state="PROGRESS",
        meta={"stage": "2.5", "status": f"Zone analysis complete ({n_zones} zones)"},
    )

    # --- Stage 3 ---
    self.update_state(state="PROGRESS", meta={"stage": "3", "status": "Running design strategy generation"})

    design_req = DesignStrategyRequest(
        zone_analysis=zone_result,
        project_context=request.project_context,
        allowed_indicator_ids=request.allowed_indicator_ids,
        use_llm=request.use_llm,
        max_ioms_per_query=request.max_ioms_per_query,
        max_strategies_per_zone=request.max_strategies_per_zone,
    )

    # DesignEngine.generate_design_strategies is async — run inside event loop
    loop = asyncio.new_event_loop()
    try:
        design_result = loop.run_until_complete(engine.generate_design_strategies(design_req))
    finally:
        loop.close()

    self.update_state(
        state="PROGRESS",
        meta={"stage": "3", "status": "Design strategies complete"},
    )

    # --- Assemble output ---
    result = {
        "zone_analysis": zone_result.model_dump(),
        "design_strategies": design_result.model_dump(),
        "computed_at": datetime.now().isoformat(),
    }

    if output_path:
        out_file = Path(output_path)
        out_file.parent.mkdir(parents=True, exist_ok=True)
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        result["output_file"] = str(out_file)

    return result
