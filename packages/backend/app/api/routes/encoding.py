"""Encoding dictionary endpoints.

Exposes selected sections of the knowledge-base Encoding_Dictionary.json so the
frontend wizard can render dropdown labels, definitions, and supporting paper
citations directly from the canonical source instead of duplicating constants.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_knowledge_base
from app.services.knowledge_base import KnowledgeBase

router = APIRouter()

# Sections the wizard needs. Order is preserved in the response.
WIZARD_SECTIONS: tuple[str, ...] = (
    "K_climate",
    "E_countries",
    "E_settings",
    "L_lcz",
    "M_age_groups",
    "C_performance",
    "C_subdimensions",
)


def _serialize_section(table: dict) -> list[dict]:
    """Flatten a codebook table into a list of {code, name, definition, supporting_papers}.

    Filters _NA placeholder codes and preserves natural ordering.
    """
    out: list[dict] = []
    for code, entry in table.items():
        if not isinstance(entry, dict):
            continue
        if code.endswith("_NA"):
            continue
        out.append({
            "code": code,
            "name": entry.get("name", code),
            "definition": entry.get("definition", "") or "",
            "supporting_papers": entry.get("supporting_papers", []) or [],
            # Only populated for C_subdimensions; None elsewhere.
            "parent_dim": entry.get("parent_dim"),
            "evidence_count": entry.get("evidence_count"),
        })
    return out


@router.get("/sections")
def get_encoding_sections(
    knowledge_base: KnowledgeBase = Depends(get_knowledge_base),
) -> dict:
    """Return the wizard-relevant codebook sections in one payload.

    Shape: { "K_climate": [{code, name, definition, supporting_papers}, ...], ... }
    """
    if not knowledge_base.loaded:
        raise HTTPException(status_code=503, detail="Knowledge base not loaded")

    out: dict[str, list[dict]] = {}
    for section in WIZARD_SECTIONS:
        table = knowledge_base.appendix.get(section)
        if isinstance(table, dict):
            out[section] = _serialize_section(table)
        else:
            out[section] = []
    return out


@router.get("/sections/{section}")
def get_encoding_section(
    section: str,
    knowledge_base: KnowledgeBase = Depends(get_knowledge_base),
) -> list[dict]:
    """Return a single codebook section by name (e.g. K_climate)."""
    if not knowledge_base.loaded:
        raise HTTPException(status_code=503, detail="Knowledge base not loaded")

    table = knowledge_base.appendix.get(section)
    if not isinstance(table, dict):
        raise HTTPException(status_code=404, detail=f"Section '{section}' not found")
    return _serialize_section(table)
