"""
Metrics Aggregator Service
Groups per-image calculator results by zone x indicator, computes statistics.
"""

import logging
from collections import defaultdict

import numpy as np

from app.models.analysis import IndicatorDefinitionInput, IndicatorLayerValue
from app.models.project import UploadedImage, SpatialZone
from app.models.metrics import CalculatorInfo

logger = logging.getLogger(__name__)


class MetricsAggregator:
    """Aggregates per-image metrics results into zone-level statistics."""

    @staticmethod
    def aggregate(
        images: list[UploadedImage],
        zones: list[SpatialZone],
        indicator_ids: list[str],
        calculator_infos: dict[str, CalculatorInfo],
    ) -> tuple[list[IndicatorLayerValue], dict[str, IndicatorDefinitionInput]]:
        """
        Aggregate per-image metrics_results into zone-level statistics.

        Returns:
            (zone_statistics, indicator_definitions)
        """
        # Build zone lookup
        zone_lookup: dict[str, SpatialZone] = {z.zone_id: z for z in zones}

        # Group values: (zone_id, indicator_id) -> list[float]
        grouped: dict[tuple[str, str], list[float]] = defaultdict(list)

        for img in images:
            if not img.zone_id or img.zone_id not in zone_lookup:
                continue
            for ind_id in indicator_ids:
                val = img.metrics_results.get(ind_id)
                if val is not None:
                    grouped[(img.zone_id, ind_id)].append(val)

        # Build zone statistics
        zone_statistics: list[IndicatorLayerValue] = []
        for (zone_id, ind_id), values in grouped.items():
            zone = zone_lookup[zone_id]
            arr = np.array(values, dtype=float)
            n = len(values)

            stat = IndicatorLayerValue(
                zone_id=zone_id,
                zone_name=zone.zone_name,
                indicator_id=ind_id,
                layer="full",
                n_images=n,
                mean=float(np.mean(arr)),
                std=float(np.std(arr, ddof=1)) if n > 1 else 0.0,
                min=float(np.min(arr)),
                max=float(np.max(arr)),
                unit=calculator_infos[ind_id].unit if ind_id in calculator_infos else "",
                area_sqm=zone.area or 0,
            )
            zone_statistics.append(stat)

        # Build indicator definitions from CalculatorInfo
        indicator_definitions: dict[str, IndicatorDefinitionInput] = {}
        for ind_id in indicator_ids:
            info = calculator_infos.get(ind_id)
            if info:
                indicator_definitions[ind_id] = IndicatorDefinitionInput(
                    id=ind_id,
                    name=info.name,
                    unit=info.unit,
                    target_direction=info.target_direction or "INCREASE",
                    definition=info.definition,
                    category=info.category,
                )

        logger.info(
            "Aggregated %d zone-stat records from %d images across %d indicators",
            len(zone_statistics),
            len([i for i in images if i.zone_id]),
            len(indicator_ids),
        )

        return zone_statistics, indicator_definitions
