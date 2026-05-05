"""
Project context prompt builder.

Extracted from design_engine.py to give Stage 3 (Agent A diagnosis, Agent B
synthesis) and any future LLM caller a single, consistent way to render the
"## Project" header that grounds the prompt with project name, climate,
setting, and design brief.

The shape mirrors what the design engine was inlining at two call sites
before #20 — keep it that way unless every consumer changes together.
"""

from __future__ import annotations

import json
from typing import Optional

from app.models.analysis import ProjectContext


def build_project_header(
    project_context: ProjectContext,
    *,
    include_target_dimensions: bool = False,
    brief_max_chars: int = 500,
) -> str:
    """Render the canonical Project section used at the top of LLM prompts.

    `include_target_dimensions` adds the "Target dimensions" row (Agent A
    needs it for direction inference; Agent B does not).
    """
    name = project_context.project.get("name", "N/A")
    climate = project_context.context.get("climate", {}).get("koppen_zone_id", "N/A")
    setting = project_context.context.get("urban_form", {}).get("space_type_id", "N/A")
    brief = (project_context.performance_query.get("design_brief", "") or "")[:brief_max_chars]

    lines = [
        "## Project",
        f"- Name: {name}",
        f"- Climate: {climate}",
        f"- Setting: {setting}",
        f"- Design brief: {brief}",
    ]
    if include_target_dimensions:
        dims = project_context.performance_query.get("dimensions", [])
        lines.append(f"- Target dimensions: {json.dumps(dims)}")
    return "\n".join(lines)
