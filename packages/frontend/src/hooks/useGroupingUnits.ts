/**
 * #22 — Shared grouping-units derivation.
 *
 * Reports.tsx, the export bundle, and any future view that wants to
 * iterate "the current grouping units" (zones in zone mode, archetype
 * clusters in cluster mode) can call this instead of re-deriving the list
 * from `chartCtx.sortedDiagnostics` + `groupingMode` + a deviation-color
 * helper at every call site. Keeping the shape uniform across modes means
 * downstream UI (cards, legends, filters) doesn't need to branch on mode.
 *
 * The hook is purely derivational — it doesn't subscribe to anything. The
 * caller already holds the inputs (chartCtx, groupingMode), so this is
 * essentially a memoised mapper. It lives as a hook anyway so the call
 * site reads naturally and so future additions (e.g. selected-unit state)
 * have a home.
 */

import { useMemo } from 'react';
import type { ZoneDiagnostic } from '../types';
import type { GroupingMode } from '../types';

export interface GroupingUnit {
  /** Stable id — `cluster_<n>` in cluster mode, `zone_<n>` in zone mode. */
  id: string;
  /** Display name (zone name or "Cluster N — N points"). */
  name: string;
  /** Mean |z-score| for this unit. Drives color + ranking. */
  meanAbsZ: number;
  /** 1-indexed rank by |z| descending (matches ZoneDiagnostic.rank). */
  rank: number;
  /** Number of GPS points / images. */
  pointCount: number;
  /** Chakra color scheme key derived from |z|. */
  colorScheme: 'red' | 'orange' | 'yellow' | 'green';
  /** Chakra background token derived from |z|. */
  bg: string;
  /** Mode this unit belongs to. Mirrors the input groupingMode for callers
   * that pass units through prop drilling. */
  mode: GroupingMode;
}

function colorSchemeForZ(meanAbsZ: number): GroupingUnit['colorScheme'] {
  if (meanAbsZ >= 1.5) return 'red';
  if (meanAbsZ >= 1.0) return 'orange';
  if (meanAbsZ >= 0.5) return 'yellow';
  return 'green';
}

function bgForZ(meanAbsZ: number): string {
  if (meanAbsZ >= 1.5) return 'red.50';
  if (meanAbsZ >= 1.0) return 'orange.50';
  if (meanAbsZ >= 0.5) return 'yellow.50';
  return 'green.50';
}

/**
 * Derive the unit list. `sortedDiagnostics` should already be sorted by
 * |z| desc (ChartContext.buildChartContext guarantees this); we don't
 * resort here so callers that pass an alternative ordering aren't
 * silently overridden.
 */
export function useGroupingUnits(
  sortedDiagnostics: ZoneDiagnostic[],
  groupingMode: GroupingMode,
): GroupingUnit[] {
  return useMemo(
    () =>
      sortedDiagnostics.map((d) => {
        const meanAbsZ = d.mean_abs_z ?? 0;
        return {
          id: d.zone_id,
          name: d.zone_name,
          meanAbsZ,
          rank: d.rank ?? 0,
          pointCount: d.point_count ?? 0,
          colorScheme: colorSchemeForZ(meanAbsZ),
          bg: bgForZ(meanAbsZ),
          mode: groupingMode,
        };
      }),
    [sortedDiagnostics, groupingMode],
  );
}
