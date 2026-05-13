/**
 * Excel export — multi-sheet workbook with all analysis data.
 * XLSX is loaded lazily (dynamic import) so it doesn't bloat the main bundle.
 *
 * Sheets:
 *  1. Image Metrics   — one row per image, all indicator×layer columns
 *  2. Zone Statistics  — EnrichedZoneStat rows (zone × indicator × layer)
 *  3. Zone Diagnostics — per-zone summary (mean_abs_z, rank, point_count)
 *  4. Correlations     — long-format: layer, indicator_a, indicator_b, r, p
 *  5. Global Stats     — Table M2 data (per-indicator by-layer stats + tests)
 */

import type {
  UploadedImage,
  EnrichedZoneStat,
  ZoneDiagnostic,
  GlobalIndicatorStats,
} from '../types';

// ---------------------------------------------------------------------------
// Row builders (pure data — no XLSX dependency)
// ---------------------------------------------------------------------------

function buildImageMetricsRows(images: UploadedImage[]) {
  const keySet = new Set<string>();
  for (const img of images) {
    for (const k of Object.keys(img.metrics_results)) {
      if (img.metrics_results[k] != null) keySet.add(k);
    }
  }
  const metricKeys = Array.from(keySet).sort();

  return images.map(img => {
    // v4 polish — put `filename` (the human-readable upload name) FIRST so
    // users opening the .xlsx can identify each image at a glance instead
    // of having to map the UUID-style image_id back to their source. The
    // image_id column is preserved as a stable internal ID for cross-
    // referencing with raw JSON exports.
    const row: Record<string, unknown> = {
      filename: img.filename,
      image_id: img.image_id,
      zone_id: img.zone_id ?? '',
      has_gps: img.has_gps,
      latitude: img.latitude,
      longitude: img.longitude,
    };
    for (const k of metricKeys) row[k] = img.metrics_results[k] ?? null;
    return row;
  });
}

function buildZoneStatsRows(
  stats: EnrichedZoneStat[],
  diagnostics: ZoneDiagnostic[],
) {
  const zoneDeviation: Record<string, number> = {};
  for (const d of diagnostics) zoneDeviation[d.zone_id] = d.mean_abs_z;

  return stats.map(s => ({
    zone_id: s.zone_id,
    zone_name: s.zone_name,
    indicator_id: s.indicator_id,
    layer: s.layer,
    n_images: s.n_images ?? null,
    mean: s.mean ?? null,
    std: s.std ?? null,
    min: s.min ?? null,
    max: s.max ?? null,
    z_score: s.z_score ?? null,
    percentile: s.percentile ?? null,
    unit: s.unit ?? '',
    zone_mean_abs_z: zoneDeviation[s.zone_id] ?? null,
  }));
}

function buildDiagnosticsRows(diagnostics: ZoneDiagnostic[]) {
  return diagnostics.map(d => ({
    zone_id: d.zone_id,
    zone_name: d.zone_name,
    rank: d.rank,
    mean_abs_z: d.mean_abs_z,
    point_count: d.point_count,
    area_sqm: d.area_sqm,
  }));
}

function buildCorrelationsRows(
  correlationByLayer: Record<string, Record<string, Record<string, number>>>,
  pvalueByLayer: Record<string, Record<string, Record<string, number>>> | null,
) {
  const rows: Record<string, unknown>[] = [];
  for (const layer of Object.keys(correlationByLayer).sort()) {
    const corrMatrix = correlationByLayer[layer];
    const pvalMatrix = pvalueByLayer?.[layer];
    const indicators = Object.keys(corrMatrix).sort();
    for (const a of indicators) {
      for (const b of indicators) {
        rows.push({
          layer,
          indicator_a: a,
          indicator_b: b,
          correlation: corrMatrix[a]?.[b] ?? null,
          p_value: pvalMatrix?.[a]?.[b] ?? null,
        });
      }
    }
  }
  return rows;
}

function buildGlobalStatsRows(stats: GlobalIndicatorStats[]) {
  const rows: Record<string, unknown>[] = [];
  for (const s of stats) {
    for (const [layer, vals] of Object.entries(s.by_layer)) {
      rows.push({
        indicator_id: s.indicator_id,
        indicator_name: s.indicator_name,
        unit: s.unit,
        target_direction: s.target_direction,
        layer,
        N: vals.N,
        Mean: vals.Mean,
        Std: vals.Std,
        Min: vals.Min,
        Max: vals.Max,
        cv_full: layer === 'full' ? s.cv_full : null,
        shapiro_p: layer === 'full' ? s.shapiro_p : null,
        kruskal_p: layer === 'full' ? s.kruskal_p : null,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Main export function (async — lazy-loads xlsx)
// ---------------------------------------------------------------------------

export interface ExcelExportData {
  projectName: string;
  images: UploadedImage[];
  zoneStats: EnrichedZoneStat[];
  diagnostics: ZoneDiagnostic[];
  correlationByLayer: Record<string, Record<string, Record<string, number>>> | null;
  pvalueByLayer: Record<string, Record<string, Record<string, number>>> | null;
  globalStats: GlobalIndicatorStats[];
}

export async function exportAnalysisExcel(data: ExcelExportData) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  if (data.images.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildImageMetricsRows(data.images)), 'Image Metrics');
  }
  if (data.zoneStats.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildZoneStatsRows(data.zoneStats, data.diagnostics)), 'Zone Statistics');
  }
  if (data.diagnostics.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildDiagnosticsRows(data.diagnostics)), 'Zone Diagnostics');
  }
  if (data.correlationByLayer && Object.keys(data.correlationByLayer).length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildCorrelationsRows(data.correlationByLayer, data.pvalueByLayer)), 'Correlations');
  }
  if (data.globalStats.length > 0) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(buildGlobalStatsRows(data.globalStats)), 'Global Stats');
  }

  XLSX.writeFile(wb, `${data.projectName.replace(/\s+/g, '_')}_analysis.xlsx`);
}
