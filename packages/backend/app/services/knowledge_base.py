"""
Knowledge Base Service
Manages evidence-based indicator matching data
"""

import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class KnowledgeBase:
    """Knowledge base for evidence-based indicator recommendation"""

    def __init__(self, knowledge_base_dir: str):
        self.knowledge_base_dir = Path(knowledge_base_dir)

        # Data stores
        self.evidence: list[dict] = []
        self.appendix: dict = {}
        self.context: dict = {}
        self.iom: list[dict] = []  # Intervention-Outcome Mapping

        # Indexes for fast lookup
        self._evidence_by_indicator: dict[str, list[dict]] = {}
        self._evidence_by_dimension: dict[str, list[dict]] = {}

        self.loaded = False

    def load(self) -> bool:
        """Load all knowledge base files"""
        try:
            if not self.knowledge_base_dir.exists():
                logger.warning(f"Knowledge base directory not found: {self.knowledge_base_dir}")
                return False

            # Load evidence
            evidence_path = self.knowledge_base_dir / "Evidence_final_v5_2_fixed.json"
            if evidence_path.exists():
                with open(evidence_path, 'r', encoding='utf-8') as f:
                    self.evidence = json.load(f)
                logger.info(f"Loaded {len(self.evidence)} evidence records")

            # Load appendix (codebook)
            appendix_path = self.knowledge_base_dir / "Appendix_final_v5_2_fixed.json"
            if appendix_path.exists():
                with open(appendix_path, 'r', encoding='utf-8') as f:
                    self.appendix = json.load(f)
                logger.info(f"Loaded appendix with {len(self.appendix)} sections")

            # Load context
            context_path = self.knowledge_base_dir / "Context_final_v5_2_fixed.json"
            if context_path.exists():
                with open(context_path, 'r', encoding='utf-8') as f:
                    self.context = json.load(f)
                logger.info("Loaded context data")

            # Load IOM
            iom_path = self.knowledge_base_dir / "IOM_final_v5_2_fixed.json"
            if iom_path.exists():
                with open(iom_path, 'r', encoding='utf-8') as f:
                    self.iom = json.load(f)
                logger.info(f"Loaded {len(self.iom)} IOM records")

            # Build indexes
            self._build_indexes()
            self.loaded = True
            return True

        except Exception as e:
            logger.error(f"Failed to load knowledge base: {e}")
            return False

    def _build_indexes(self) -> None:
        """Build indexes for fast lookup"""
        self._evidence_by_indicator = {}
        self._evidence_by_dimension = {}

        for record in self.evidence:
            # Index by indicator
            indicator = record.get('indicator', {})
            indicator_id = indicator.get('indicator_id', '')
            if indicator_id:
                if indicator_id not in self._evidence_by_indicator:
                    self._evidence_by_indicator[indicator_id] = []
                self._evidence_by_indicator[indicator_id].append(record)

            # Index by performance dimension
            performance = record.get('performance', {})
            dimension_id = performance.get('dimension_id', '')
            if dimension_id:
                if dimension_id not in self._evidence_by_dimension:
                    self._evidence_by_dimension[dimension_id] = []
                self._evidence_by_dimension[dimension_id].append(record)

    def get_evidence_for_indicator(self, indicator_id: str) -> list[dict]:
        """Get all evidence records for an indicator"""
        return self._evidence_by_indicator.get(indicator_id, [])

    def get_evidence_for_dimension(self, dimension_id: str) -> list[dict]:
        """Get all evidence records for a performance dimension"""
        return self._evidence_by_dimension.get(dimension_id, [])

    def get_evidence_for_dimensions(self, dimension_ids: list[str]) -> list[dict]:
        """Get evidence records for multiple dimensions"""
        results = []
        seen_ids = set()
        for dim_id in dimension_ids:
            for record in self._evidence_by_dimension.get(dim_id, []):
                evidence_id = record.get('evidence_id', '')
                if evidence_id and evidence_id not in seen_ids:
                    results.append(record)
                    seen_ids.add(evidence_id)
        return results

    def get_codebook_section(self, section: str) -> Optional[list[dict]]:
        """Get a section from the codebook/appendix"""
        return self.appendix.get(section)

    def get_indicator_definitions(self) -> list[dict]:
        """Get indicator definitions from codebook"""
        return self.appendix.get('A_indicators', [])

    def get_performance_dimensions(self) -> list[dict]:
        """Get performance dimensions from codebook"""
        return self.appendix.get('C_performance', [])

    def get_subdimensions(self) -> list[dict]:
        """Get subdimensions from codebook"""
        return self.appendix.get('C_subdimensions', [])

    def query_evidence(
        self,
        dimension_ids: list[str] = None,
        subdimension_ids: list[str] = None,
        indicator_ids: list[str] = None,
        country_id: str = None,
        space_type_id: str = None,
        min_confidence: str = None,
    ) -> list[dict]:
        """Query evidence with multiple filters"""
        results = self.evidence

        if dimension_ids:
            results = [
                r for r in results
                if r.get('performance', {}).get('dimension_id', '') in dimension_ids
            ]

        if subdimension_ids:
            results = [
                r for r in results
                if r.get('performance', {}).get('subdimension_id', '') in subdimension_ids
            ]

        if indicator_ids:
            results = [
                r for r in results
                if r.get('indicator', {}).get('indicator_id', '') in indicator_ids
            ]

        if country_id:
            results = [
                r for r in results
                if r.get('study', {}).get('country', {}).get('code', '') == country_id
            ]

        if space_type_id:
            results = [
                r for r in results
                if r.get('study', {}).get('setting', {}).get('code', '') == space_type_id
            ]

        if min_confidence:
            confidence_order = ['CON_LOW', 'CON_MED', 'CON_HIGH']
            if min_confidence in confidence_order:
                min_idx = confidence_order.index(min_confidence)
                results = [
                    r for r in results
                    if confidence_order.index(
                        r.get('quality', {}).get('confidence', {}).get('code', 'CON_LOW')
                    ) >= min_idx
                ]

        return results

    def get_summary(self) -> dict:
        """Get knowledge base summary"""
        return {
            'loaded': self.loaded,
            'total_evidence': len(self.evidence),
            'indicators_with_evidence': len(self._evidence_by_indicator),
            'dimensions_with_evidence': len(self._evidence_by_dimension),
            'appendix_sections': list(self.appendix.keys()) if self.appendix else [],
            'iom_records': len(self.iom),
        }
