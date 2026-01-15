"""
Metrics Library Management Service
Manages metric definitions and calculator code
"""

import os
import re
import shutil
import logging
from pathlib import Path
from typing import Optional

import pandas as pd

from app.models.metrics import CalculatorInfo

logger = logging.getLogger(__name__)


class MetricsManager:
    """Metrics Manager - manages calculator files"""

    def __init__(self, metrics_library_path: str, metrics_code_dir: str):
        self.metrics_library_path = Path(metrics_library_path)
        self.metrics_code_dir = Path(metrics_code_dir)

        # Ensure directories exist
        self.metrics_code_dir.mkdir(parents=True, exist_ok=True)

        # Legacy metrics from Excel
        self.metrics_df: Optional[pd.DataFrame] = None
        self.metrics_dict: dict = {}

        # Calculator layer cache
        self.calculators: dict[str, CalculatorInfo] = {}

        self.load_metrics()
        self.scan_calculators()

    def load_metrics(self) -> Optional[pd.DataFrame]:
        """Load metrics from Excel library"""
        try:
            if self.metrics_library_path.exists():
                self.metrics_df = pd.read_excel(self.metrics_library_path)
                logger.info(f"Loaded {len(self.metrics_df)} metrics from library")
                self._build_metrics_dict()
            else:
                logger.warning(f"Metrics library not found: {self.metrics_library_path}")
                self.metrics_df = pd.DataFrame()
            return self.metrics_df
        except Exception as e:
            logger.error(f"Failed to load metrics library: {e}")
            self.metrics_df = pd.DataFrame()
            return None

    def _build_metrics_dict(self) -> None:
        """Build metrics dictionary for quick lookup"""
        self.metrics_dict = {}
        if self.metrics_df is not None and not self.metrics_df.empty:
            for _, row in self.metrics_df.iterrows():
                metric_name = row.get('metric name', '')
                if metric_name:
                    self.metrics_dict[metric_name] = row.to_dict()

    def scan_calculators(self) -> dict[str, CalculatorInfo]:
        """Scan for calculator_layer_*.py files"""
        self.calculators = {}

        if not self.metrics_code_dir.exists():
            return self.calculators

        for filepath in self.metrics_code_dir.glob("calculator_layer_*.py"):
            info = self.parse_calculator_file(filepath)
            if info:
                self.calculators[info.id] = info

        logger.info(f"Scanned {len(self.calculators)} calculator files")
        return self.calculators

    def parse_calculator_file(self, filepath: Path) -> Optional[CalculatorInfo]:
        """Parse calculator file to extract INDICATOR definition"""
        try:
            content = filepath.read_text(encoding='utf-8')

            if 'INDICATOR' not in content:
                return None

            # Extract fields using regex
            patterns = {
                'id': r'"id"\s*:\s*"([^"]+)"',
                'name': r'"name"\s*:\s*"([^"]+)"',
                'unit': r'"unit"\s*:\s*"([^"]+)"',
                'formula': r'"formula"\s*:\s*"([^"]+)"',
                'target_direction': r'"target_direction"\s*:\s*"([^"]+)"',
                'definition': r'"definition"\s*:\s*"([^"]+)"',
                'calc_type': r'"calc_type"\s*:\s*"([^"]+)"',
                'category': r'"category"\s*:\s*"([^"]+)"',
            }

            extracted = {}
            for key, pattern in patterns.items():
                match = re.search(pattern, content)
                if match:
                    extracted[key] = match.group(1)

            # Extract target_classes list
            classes_match = re.search(r'"target_classes"\s*:\s*\[(.*?)\]', content, re.DOTALL)
            target_classes = []
            if classes_match:
                classes_str = classes_match.group(1)
                target_classes = re.findall(r'"([^"]+)"', classes_str)

            if not extracted.get('id'):
                return None

            return CalculatorInfo(
                id=extracted.get('id', ''),
                name=extracted.get('name', ''),
                unit=extracted.get('unit', ''),
                formula=extracted.get('formula', ''),
                target_direction=extracted.get('target_direction', ''),
                definition=extracted.get('definition', ''),
                category=extracted.get('category', ''),
                calc_type=extracted.get('calc_type', ''),
                target_classes=target_classes,
                filepath=str(filepath),
                filename=filepath.name,
            )

        except Exception as e:
            logger.error(f"Failed to parse calculator file {filepath}: {e}")
            return None

    def get_all_calculators(self) -> list[CalculatorInfo]:
        """Get all calculator info as list"""
        return list(self.calculators.values())

    def get_calculator(self, indicator_id: str) -> Optional[CalculatorInfo]:
        """Get calculator info by indicator ID"""
        return self.calculators.get(indicator_id)

    def get_calculator_filepath(self, indicator_id: str) -> Optional[Path]:
        """Get filepath for calculator by indicator ID"""
        calc = self.calculators.get(indicator_id)
        return Path(calc.filepath) if calc else None

    def has_calculator(self, indicator_id: str) -> bool:
        """Check if calculator exists for indicator ID"""
        return indicator_id in self.calculators

    def add_calculator(self, filepath: str) -> Optional[str]:
        """Add a calculator file to the library"""
        try:
            src_path = Path(filepath)
            filename = src_path.name

            if not filename.startswith('calculator_layer_') or not filename.endswith('.py'):
                logger.error(f"Invalid filename format: {filename}")
                return None

            # Parse to validate
            info = self.parse_calculator_file(src_path)
            if not info:
                logger.error(f"Failed to parse calculator file: {filepath}")
                return None

            # Copy to metrics_code directory
            dest_path = self.metrics_code_dir / filename
            shutil.copy2(src_path, dest_path)

            # Update cache
            info.filepath = str(dest_path)
            self.calculators[info.id] = info

            logger.info(f"Added calculator: {info.id} - {info.name}")
            return info.id

        except Exception as e:
            logger.error(f"Failed to add calculator: {e}")
            return None

    def remove_calculator(self, indicator_id: str) -> bool:
        """Remove a calculator by indicator ID"""
        try:
            calc = self.calculators.get(indicator_id)
            if not calc:
                return False

            filepath = Path(calc.filepath)
            if filepath.exists():
                filepath.unlink()

            del self.calculators[indicator_id]
            logger.info(f"Removed calculator: {indicator_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to remove calculator: {e}")
            return False

    def get_calculator_code(self, indicator_id: str) -> Optional[str]:
        """Get source code for a calculator"""
        filepath = self.get_calculator_filepath(indicator_id)
        if filepath and filepath.exists():
            return filepath.read_text(encoding='utf-8')
        return None

    def get_all_metrics(self) -> list[dict]:
        """Get all legacy metrics as list"""
        if self.metrics_df is not None and not self.metrics_df.empty:
            return self.metrics_df.to_dict('records')
        return []

    def get_metric_by_name(self, metric_name: str) -> Optional[dict]:
        """Get metric by name from legacy library"""
        return self.metrics_dict.get(metric_name)
