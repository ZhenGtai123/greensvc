import type { ReactNode } from 'react';
import {
  Box,
  Text,
  VStack,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Tooltip,
  SimpleGrid,
} from '@chakra-ui/react';
import {
  RadarProfileChart,
  ZonePriorityChart,
  CorrelationHeatmap,
  PriorityHeatmap,
  ArchetypeRadarChart,
  ClusterSizeChart,
  SilhouetteCurve,
  IndicatorDeepDive,
  CrossIndicatorSpatialMaps,
  ValueSpatialMap,
  Dendrogram,
  ClusterSpatialBeforeAfter,
  // v7.0
  ViolinGrid,
  GlobalStatsTable,
  DataQualityTable,
} from '../AnalysisCharts';
import type { ChartContext } from './ChartContext';
import { LAYER_LABELS } from './ChartContext';

export type ChartTab = 'diagnostics' | 'statistics' | 'analysis';

/**
 * Sections drive the narrative on the Analysis tab. The five-panel layout
 * (PDF #7) takes the user from setup → "where is the problem" → "why is it
 * there" → "what are the raw numbers" → optional preprocessing.
 */
export type ChartSection =
  | 'setup'      // A — folded by default; indicator metadata + data quality
  | 'zone'       // B — expanded; which zone is anomalous and how
  | 'indicator'  // C — expanded; per-indicator drill-down
  | 'reference'  // D — folded; underlying numerical tables
  | 'clustering'; // E — one-shot single-zone entry, gated by analysis_mode

export const SECTION_ORDER: ChartSection[] = [
  'setup',
  'zone',
  'indicator',
  'reference',
  'clustering',
];

export const SECTION_META: Record<
  ChartSection,
  { title: string; subtitle: string; defaultCollapsed?: boolean }
> = {
  setup: {
    title: 'Setup & Data Quality',
    subtitle: 'What was analysed and how trustworthy the underlying data is.',
    defaultCollapsed: true,
  },
  zone: {
    title: 'Zone-Level Findings',
    subtitle: 'Which zones stand out and on which indicators.',
  },
  indicator: {
    title: 'Indicator Drill-Down',
    subtitle: 'Distribution, spatial pattern, and correlations per indicator.',
  },
  reference: {
    title: 'Reference Tables',
    subtitle: 'Underlying values for citation or export.',
    defaultCollapsed: true,
  },
  clustering: {
    title: 'SVC Archetype Clustering',
    subtitle: 'One-shot preprocessing for single-zone projects.',
  },
};

export interface ChartDescriptor {
  /** Stable unique identifier, used as persistence key */
  id: string;
  /** Human-readable title shown in Card header + picker checkbox */
  title: string;
  /** Optional registry code (e.g. "M1", "Fig M1") rendered as a Badge next to
   * the title. Replaces inline "(Table M1)" suffixes per design clean-up. */
  refCode?: string;
  /** Which tab this chart renders in */
  tab: ChartTab;
  /** Narrative section — drives ordering and subheadings on the Analysis tab. */
  section: ChartSection;
  /** Short caption rendered below the Card header (also used in picker tooltip). */
  description?: string;
  /** Returns false when required data isn't available — chart is skipped */
  isAvailable: (ctx: ChartContext) => boolean;
  /** Renders the chart body (ChartHost provides the Card wrapper) */
  render: (ctx: ChartContext) => ReactNode;
  /** Whether the chart reacts to the layer selector (re-rendered on layer change) */
  layerAware?: boolean;
  /**
   * Returns a small JSON-serialisable slice of context for the LLM summary
   * (5.10.4). Keep it under ~6KB — the backend truncates anything bigger.
   * If absent, ChartHost sends a minimal placeholder.
   *
   * Convention: include `analysis_mode`, `zone_count`, and either compact
   * `rows: [...]` (≤30 entries) or `by_layer:{full,foreground,middleground,background}`
   * for layerAware charts so the LLM has enough grounding for cross-layer
   * comparison.
   */
  summaryPayload?: (ctx: ChartContext) => Record<string, unknown>;
  /**
   * 6.B(1) — when true, the chart is included in the embedded report by
   * default. Other charts can still be opted in via the Customize panel.
   */
  exportByDefault?: boolean;
  /**
   * #7-A — return tabular rows for CSV / XLSX export. Charts without an
   * `exportRows` only expose SVG and PNG export. Keep rows flat (one record
   * per row) and keep column keys stable; XLSX column auto-fit reads
   * `String(value).length` so prefer numbers and short strings over JSON
   * blobs.
   */
  exportRows?: (ctx: ChartContext) => {
    columns: { key: string; label: string }[];
    rows: Record<string, unknown>[];
  } | null;
}

// ---------------------------------------------------------------------------
// Helpers for compact summaryPayloads (≤6KB target per chart)
// ---------------------------------------------------------------------------

function compactZoneStats(ctx: ChartContext, layer: string) {
  const rows = ctx.zoneAnalysisResult?.zone_statistics
    ?.filter((s) => s.layer === layer)
    .slice(0, 60) // ~30 zone × 30 ind upper bound; trimmed below
    .map((s) => ({
      zone: s.zone_name,
      indicator: s.indicator_id,
      mean: s.mean,
      std: s.std,
      n: s.N,
    })) ?? [];
  // Keep the 30 highest-magnitude rows so the LLM sees the salient signal
  // when there are too many cells to fit.
  if (rows.length > 30) {
    rows.sort((a, b) => Math.abs(b.mean ?? 0) - Math.abs(a.mean ?? 0));
    return rows.slice(0, 30);
  }
  return rows;
}

function correlationByLayer(ctx: ChartContext) {
  const za = ctx.zoneAnalysisResult;
  if (!za?.correlation_by_layer) return {};
  const out: Record<string, { a: string; b: string; r: number }[]> = {};
  for (const layer of LAYERS_FOR_PAYLOAD) {
    const corr = za.correlation_by_layer[layer];
    if (!corr) continue;
    const inds = Object.keys(corr);
    const pairs: { a: string; b: string; r: number }[] = [];
    for (let i = 0; i < inds.length; i++) {
      for (let j = i + 1; j < inds.length; j++) {
        const r = corr[inds[i]]?.[inds[j]];
        if (r != null) pairs.push({ a: inds[i], b: inds[j], r });
      }
    }
    pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
    out[layer] = pairs.slice(0, 8);
  }
  return out;
}

const LAYERS_FOR_PAYLOAD = ['full', 'foreground', 'middleground', 'background'];

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
// Order = render order. Sections group cards under subheadings on the
// Analysis tab. The 19 → 12 consolidation merges three spatial cards into a
// single Tabs card and two radar cards into one layer-aware card.

export const CHART_REGISTRY: ChartDescriptor[] = [
  // ── Context ──────────────────────────────────────────────────────────
  {
    id: 'indicator-registry-table',
    title: 'Indicator Registry',
    refCode: 'M1',
    tab: 'analysis',
    section: 'setup',
    description: 'What indicators are we analyzing? Metadata-only list.',
    isAvailable: (ctx) => Object.keys(ctx.indicatorDefs).length > 0,
    exportRows: (ctx) => ({
      columns: [
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Full Name' },
        { key: 'unit', label: 'Unit' },
        { key: 'target_direction', label: 'Target' },
        { key: 'category', label: 'Category' },
        { key: 'n_full', label: 'N (Full)' },
      ],
      rows: Object.values(ctx.indicatorDefs).map((d) => ({
        id: d.id,
        name: d.name,
        unit: d.unit,
        target_direction: d.target_direction,
        category: d.category,
        n_full:
          ctx.globalIndicatorStats.find((s) => s.indicator_id === d.id)?.by_layer?.full?.N ?? '',
      })),
    }),
    summaryPayload: (ctx) => ({
      analysis_mode: ctx.analysisMode,
      zone_count: ctx.sortedDiagnostics.length,
      indicators: Object.values(ctx.indicatorDefs).slice(0, 30).map((d) => ({
        id: d.id,
        name: d.name,
        unit: d.unit,
        target: d.target_direction,
        category: d.category,
        n_full: ctx.globalIndicatorStats.find((s) => s.indicator_id === d.id)
          ?.by_layer?.full?.N ?? null,
      })),
    }),
    render: (ctx) => {
      const defs = Object.values(ctx.indicatorDefs);
      return (
        <Box overflowX="auto">
          <Table size="sm">
            <Thead>
              <Tr>
                <Th>ID</Th>
                <Th>Full Name</Th>
                <Th>Unit</Th>
                <Th>Target</Th>
                <Th>Category</Th>
                <Th isNumeric>N (Full)</Th>
              </Tr>
            </Thead>
            <Tbody>
              {defs.map((d) => {
                const gs = ctx.globalIndicatorStats.find((s) => s.indicator_id === d.id);
                const fullN = gs?.by_layer?.full?.N ?? '—';
                return (
                  <Tr key={d.id}>
                    <Td fontSize="xs" fontWeight="bold">{d.id}</Td>
                    <Td fontSize="xs">{d.name}</Td>
                    <Td fontSize="xs">{d.unit}</Td>
                    <Td fontSize="xs">{d.target_direction}</Td>
                    <Td fontSize="xs">{d.category}</Td>
                    <Td fontSize="xs" isNumeric>{fullN}</Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Box>
      );
    },
  },
  {
    id: 'data-quality-table',
    title: 'Data Quality Diagnostics',
    refCode: 'M4',
    tab: 'analysis',
    section: 'setup',
    description: 'Images per indicator, FMB coverage, normality, correlation method.',
    isAvailable: (ctx) => ctx.dataQuality.length > 0,
    exportRows: (ctx) => ({
      columns: [
        { key: 'indicator_id', label: 'Indicator' },
        { key: 'total_images', label: 'Total Images' },
        { key: 'fg_coverage_pct', label: 'FG %' },
        { key: 'mg_coverage_pct', label: 'MG %' },
        { key: 'bg_coverage_pct', label: 'BG %' },
        { key: 'is_normal', label: 'Normality' },
        { key: 'correlation_method', label: 'Corr. Method' },
      ],
      rows: ctx.dataQuality.map((r) => ({
        indicator_id: r.indicator_id,
        total_images: r.total_images,
        fg_coverage_pct: r.fg_coverage_pct,
        mg_coverage_pct: r.mg_coverage_pct,
        bg_coverage_pct: r.bg_coverage_pct,
        is_normal: r.is_normal,
        correlation_method: r.correlation_method,
      })),
    }),
    summaryPayload: (ctx) => ({
      analysis_mode: ctx.analysisMode,
      zone_count: ctx.sortedDiagnostics.length,
      rows: ctx.dataQuality.slice(0, 30).map((r) => ({
        indicator: r.indicator_id,
        total_images: r.total_images,
        fg_pct: r.fg_coverage_pct,
        mg_pct: r.mg_coverage_pct,
        bg_pct: r.bg_coverage_pct,
        normal: r.is_normal,
        corr_method: r.correlation_method,
      })),
    }),
    render: (ctx) => <DataQualityTable rows={ctx.dataQuality} />,
  },

  // ── Zone overview ────────────────────────────────────────────────────
  {
    id: 'zone-deviation-overview',
    title: "Each zone's overall distinctiveness",
    tab: 'analysis',
    section: 'zone',
    description:
      'Horizontal bar of each zone ranked by mean |z-score| across indicators (full layer).',
    exportByDefault: true,
    isAvailable: (ctx) => ctx.sortedDiagnostics.length > 0,
    render: (ctx) => <ZonePriorityChart diagnostics={ctx.sortedDiagnostics} />,
    exportRows: (ctx) => ({
      columns: [
        { key: 'rank', label: 'Rank' },
        { key: 'zone_name', label: 'Zone' },
        { key: 'mean_abs_z', label: 'Mean |z|' },
        { key: 'point_count', label: 'Points' },
      ],
      rows: ctx.sortedDiagnostics.map((d) => ({
        rank: d.rank,
        zone_name: d.zone_name,
        mean_abs_z: d.mean_abs_z != null ? Number(d.mean_abs_z.toFixed(3)) : '',
        point_count: d.point_count,
      })),
    }),
    summaryPayload: (ctx) => ({
      analysis_mode: ctx.analysisMode,
      zones: ctx.sortedDiagnostics.map((d) => ({
        zone: d.zone_name,
        mean_abs_z: d.mean_abs_z,
        rank: d.rank,
        points: d.point_count,
      })),
    }),
  },
  {
    id: 'priority-heatmap',
    title: "Each zone's per-indicator deviation",
    tab: 'analysis',
    section: 'zone',
    description:
      'z-score grid: rows = zones, columns = indicators (full layer). Red = above mean, blue = below.',
    isAvailable: (ctx) => ctx.sortedDiagnostics.length > 0,
    summaryPayload: (ctx) => {
      // For each zone, list the top-3 most-deviating indicators by |z| on the
      // full layer. Keeps payload bounded by 3 × zones rather than full grid.
      const fullStats = ctx.zoneAnalysisResult?.zone_statistics?.filter(
        (s) => s.layer === 'full',
      ) ?? [];
      const byZone = new Map<string, { indicator: string; z: number }[]>();
      for (const s of fullStats) {
        if (s.z_score == null) continue;
        const list = byZone.get(s.zone_name) ?? [];
        list.push({ indicator: s.indicator_id, z: s.z_score });
        byZone.set(s.zone_name, list);
      }
      const rows: { zone: string; mean_abs_z: number; top_deviations: { indicator: string; z: number }[] }[] = [];
      for (const d of ctx.sortedDiagnostics.slice(0, 12)) {
        const zScores = (byZone.get(d.zone_name) ?? [])
          .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
          .slice(0, 3);
        rows.push({ zone: d.zone_name, mean_abs_z: d.mean_abs_z, top_deviations: zScores });
      }
      return { analysis_mode: ctx.analysisMode, zone_count: ctx.sortedDiagnostics.length, rows };
    },
    render: (ctx) => (
      <PriorityHeatmap
        diagnostics={ctx.sortedDiagnostics}
        layer="full"
        colorblindMode={ctx.colorblindMode}
      />
    ),
    exportRows: (ctx) => {
      // Long-form (zone, indicator, z) — easier for re-analysis than a wide grid
      // and still maps 1:1 onto the heatmap cells.
      const indicators = new Set<string>();
      const longRows: Record<string, unknown>[] = [];
      for (const diag of ctx.sortedDiagnostics) {
        const status = diag.indicator_status || {};
        for (const [indId, layerData] of Object.entries(status)) {
          indicators.add(indId);
          const ld = (layerData as Record<string, { value?: number | null; z_score?: number }>).full;
          if (!ld) continue;
          longRows.push({
            zone_name: diag.zone_name,
            indicator: indId,
            value: ld.value ?? '',
            z_score: ld.z_score != null ? Number(ld.z_score.toFixed(3)) : '',
          });
        }
      }
      return {
        columns: [
          { key: 'zone_name', label: 'Zone' },
          { key: 'indicator', label: 'Indicator' },
          { key: 'value', label: 'Value' },
          { key: 'z_score', label: 'Z-Score' },
        ],
        rows: longRows,
      };
    },
  },

  // ── Spatial Z-Deviation (zone-level finding) ────────────────────────
  {
    id: 'spatial-z-deviation',
    title: 'Spatial Z-Deviation Map',
    tab: 'analysis',
    section: 'zone',
    exportByDefault: true,
    description:
      'Mean |z| deviation across indicators (left) and the most-distinctive indicator at each GPS point (right). Full-layer values.',
    isAvailable: (ctx) => ctx.gpsImages.length > 0 && ctx.gpsIndicatorIds.length > 0,
    summaryPayload: (ctx) => ({
      analysis_mode: ctx.analysisMode,
      zone_count: ctx.sortedDiagnostics.length,
      n_gps_points: ctx.gpsImages.length,
      indicators: ctx.gpsIndicatorIds.slice(0, 20),
    }),
    render: (ctx) => (
      <CrossIndicatorSpatialMaps
        gpsImages={ctx.gpsImages}
        indicatorIds={ctx.gpsIndicatorIds}
        colorblindMode={ctx.colorblindMode}
      />
    ),
  },

  // ── Value Heatmap 4-layer small multiples (indicator drill-down) ────
  {
    id: 'value-spatial-grid',
    title: 'Value Heatmap (Full / FG / MG / BG)',
    tab: 'analysis',
    section: 'indicator',
    exportByDefault: true,
    description:
      'Per indicator, four small maps colored by raw value across Full / Foreground / Middleground / Background layers. INCREASE indicators darken when higher; DECREASE indicators darken when lower.',
    isAvailable: (ctx) => ctx.gpsImages.length > 0 && ctx.gpsIndicatorIds.length > 0,
    summaryPayload: (ctx) => ({
      analysis_mode: ctx.analysisMode,
      zone_count: ctx.sortedDiagnostics.length,
      n_gps_points: ctx.gpsImages.length,
      indicator_ranges: ctx.gpsIndicatorIds.slice(0, 20).map((ind) => {
        const vals: number[] = [];
        for (const img of ctx.gpsImages) {
          const v = img.metrics_results?.[ind] ?? img.metrics_results?.[`${ind}__full`];
          if (typeof v === 'number') vals.push(v);
        }
        if (vals.length === 0) return { indicator: ind, n: 0 };
        return {
          indicator: ind,
          n: vals.length,
          min: Math.min(...vals),
          max: Math.max(...vals),
          mean: vals.reduce((a, b) => a + b, 0) / vals.length,
        };
      }),
    }),
    render: (ctx) => {
      const defs = ctx.zoneAnalysisResult?.indicator_definitions || {};
      return (
        <VStack align="stretch" spacing={6}>
          {ctx.gpsIndicatorIds.map((ind) => (
            <Box key={ind}>
              <Text fontSize="sm" fontWeight="bold" mb={2}>
                {defs[ind]?.name ?? ind}{' '}
                <Text as="span" color="gray.500" fontSize="xs">({ind})</Text>
              </Text>
              <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} spacing={3}>
                {LAYERS_FOR_PAYLOAD.map((layer) => (
                  <ValueSpatialMap
                    key={`${ind}-${layer}`}
                    gpsImages={ctx.gpsImages}
                    indicatorId={ind}
                    layer={layer as 'full' | 'foreground' | 'middleground' | 'background'}
                    targetDirection={defs[ind]?.target_direction}
                    colorblindMode={ctx.colorblindMode}
                  />
                ))}
              </SimpleGrid>
            </Box>
          ))}
        </VStack>
      );
    },
  },

  // ── Radar Profiles 4-layer small multiples (zone-level finding) ──────
  {
    id: 'radar-profiles',
    title: 'Radar Profiles (Full / FG / MG / BG)',
    tab: 'analysis',
    section: 'zone',
    exportByDefault: true,
    description:
      'All zones overlaid on a per-layer radar — percentile scores. Four small multiples let you compare cross-zone differences across foreground, middleground, and background simultaneously.',
    isAvailable: (ctx) => {
      const za = ctx.zoneAnalysisResult;
      if (!za) return false;
      if (za.radar_profiles_by_layer && Object.keys(za.radar_profiles_by_layer).length > 0) return true;
      return !!za.radar_profiles && Object.keys(za.radar_profiles).length > 0;
    },
    render: (ctx) => {
      const za = ctx.zoneAnalysisResult!;
      const profilesByLayer = za.radar_profiles_by_layer ?? {};
      return (
        <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} spacing={4}>
          {LAYERS_FOR_PAYLOAD.map((layer) => {
            const profiles = profilesByLayer[layer]
              ?? (layer === 'full' ? za.radar_profiles : null);
            if (!profiles || Object.keys(profiles).length === 0) {
              return (
                <Box key={layer}>
                  <Text fontSize="xs" fontWeight="bold" mb={1}>{LAYER_LABELS[layer]}</Text>
                  <Text fontSize="xs" color="gray.400">No data</Text>
                </Box>
              );
            }
            return (
              <Box key={layer}>
                <Text fontSize="xs" fontWeight="bold" mb={1} textAlign="center">
                  {LAYER_LABELS[layer]}
                </Text>
                <RadarProfileChart radarProfiles={profiles} />
              </Box>
            );
          })}
        </SimpleGrid>
      );
    },
    summaryPayload: (ctx) => {
      const za = ctx.zoneAnalysisResult;
      const byLayer: Record<string, Record<string, Record<string, number>>> = {};
      if (za?.radar_profiles_by_layer) {
        for (const layer of LAYERS_FOR_PAYLOAD) {
          if (za.radar_profiles_by_layer[layer]) {
            byLayer[layer] = za.radar_profiles_by_layer[layer];
          }
        }
      }
      if (Object.keys(byLayer).length === 0 && za?.radar_profiles) {
        byLayer.full = za.radar_profiles;
      }
      return {
        analysis_mode: ctx.analysisMode,
        zone_count: ctx.sortedDiagnostics.length,
        by_layer: byLayer,
      };
    },
  },
  {
    id: 'zone-indicator-matrix',
    title: 'Zone × Indicator Matrix',
    refCode: 'M3',
    tab: 'analysis',
    section: 'reference',
    description:
      'Absolute mean values per zone per indicator (full layer) plus a global-mean reference row.',
    isAvailable: (ctx) => ctx.filteredStats.length > 0,
    exportRows: (ctx) => ({
      columns: [
        { key: 'zone_name', label: 'Zone' },
        { key: 'indicator_id', label: 'Indicator' },
        { key: 'mean', label: 'Mean' },
        { key: 'std', label: 'Std' },
        { key: 'N', label: 'N' },
        { key: 'layer', label: 'Layer' },
      ],
      rows: ctx.filteredStats.map((s) => ({
        zone_name: s.zone_name,
        indicator_id: s.indicator_id,
        mean: s.mean != null ? Number(s.mean.toFixed(3)) : '',
        std: s.std != null ? Number(s.std.toFixed(3)) : '',
        N: s.N,
        layer: s.layer,
      })),
    }),
    summaryPayload: (ctx) => ({
      analysis_mode: ctx.analysisMode,
      zone_count: ctx.sortedDiagnostics.length,
      layer: ctx.selectedLayer,
      rows: compactZoneStats(ctx, ctx.selectedLayer),
    }),
    render: (ctx) => {
      const stats = ctx.filteredStats;
      const zones = Array.from(new Set(stats.map((s) => s.zone_name))).sort();
      const indicators = Array.from(new Set(stats.map((s) => s.indicator_id))).sort();
      const grid: Record<string, Record<string, number | null>> = {};
      for (const s of stats) {
        if (!grid[s.zone_name]) grid[s.zone_name] = {};
        grid[s.zone_name][s.indicator_id] = s.mean ?? null;
      }
      const globalMean: Record<string, number | null> = {};
      for (const ind of indicators) {
        const vals = stats
          .filter((s) => s.indicator_id === ind && s.mean != null)
          .map((s) => s.mean!);
        globalMean[ind] = vals.length > 0
          ? vals.reduce((a, b) => a + b, 0) / vals.length
          : null;
      }
      return (
        <Box overflowX="auto">
          <Table size="sm">
            <Thead>
              <Tr>
                <Th>Zone</Th>
                {indicators.map((ind) => (
                  <Th key={ind} isNumeric>
                    <Tooltip label={ind}>
                      <Text noOfLines={1} maxW="70px">{ind}</Text>
                    </Tooltip>
                  </Th>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {zones.map((zone) => (
                <Tr key={zone}>
                  <Td fontSize="xs" fontWeight="medium">{zone}</Td>
                  {indicators.map((ind) => (
                    <Td key={ind} isNumeric fontSize="xs">
                      {grid[zone]?.[ind] != null ? grid[zone][ind]!.toFixed(2) : '—'}
                    </Td>
                  ))}
                </Tr>
              ))}
              <Tr bg="gray.50" fontWeight="bold">
                <Td fontSize="xs">Global Mean</Td>
                {indicators.map((ind) => (
                  <Td key={ind} isNumeric fontSize="xs">
                    {globalMean[ind] != null ? globalMean[ind]!.toFixed(2) : '—'}
                  </Td>
                ))}
              </Tr>
            </Tbody>
          </Table>
        </Box>
      );
    },
  },

  // ── Correlation Heatmap 4-layer small multiples ─────────────────────
  {
    id: 'correlation-heatmap',
    title: 'Indicator Correlation Heatmap (Full / FG / MG / BG)',
    tab: 'analysis',
    section: 'indicator',
    exportByDefault: true,
    description:
      'Pairwise correlation between indicators across the four layers. Compare which couplings are layer-specific vs. consistent.',
    isAvailable: (ctx) => {
      const za = ctx.zoneAnalysisResult;
      if (!za?.correlation_by_layer) return false;
      return LAYERS_FOR_PAYLOAD.some(
        (l) => za.correlation_by_layer[l] && Object.keys(za.correlation_by_layer[l]).length > 0,
      );
    },
    render: (ctx) => {
      const za = ctx.zoneAnalysisResult!;
      return (
        <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} spacing={4}>
          {LAYERS_FOR_PAYLOAD.map((layer) => {
            const corr = za.correlation_by_layer?.[layer];
            const pval = za.pvalue_by_layer?.[layer];
            const indicators = corr ? Object.keys(corr) : [];
            return (
              <Box key={layer}>
                <Text fontSize="xs" fontWeight="bold" mb={1} textAlign="center">
                  {LAYER_LABELS[layer]}
                </Text>
                {indicators.length > 0 ? (
                  <CorrelationHeatmap
                    corr={corr!}
                    pval={pval}
                    indicators={indicators}
                    colorblindMode={ctx.colorblindMode}
                  />
                ) : (
                  <Text fontSize="xs" color="gray.400" textAlign="center">No data</Text>
                )}
              </Box>
            );
          })}
        </SimpleGrid>
      );
    },
    summaryPayload: (ctx) => ({
      analysis_mode: ctx.analysisMode,
      zone_count: ctx.sortedDiagnostics.length,
      // Top 8 strongest pairs per layer so the LLM can compare which layer
      // drives a given correlation.
      by_layer: correlationByLayer(ctx),
    }),
    exportRows: (ctx) => {
      const za = ctx.zoneAnalysisResult;
      const rows: Record<string, unknown>[] = [];
      if (za?.correlation_by_layer) {
        for (const layer of LAYERS_FOR_PAYLOAD) {
          const corr = za.correlation_by_layer[layer];
          const pval = za.pvalue_by_layer?.[layer];
          if (!corr) continue;
          const inds = Object.keys(corr);
          for (let i = 0; i < inds.length; i++) {
            for (let j = i + 1; j < inds.length; j++) {
              const a = inds[i];
              const b = inds[j];
              const r = corr[a]?.[b];
              if (r == null) continue;
              rows.push({
                layer,
                indicator_a: a,
                indicator_b: b,
                correlation: Number(r.toFixed(3)),
                p_value: pval?.[a]?.[b] != null ? Number(pval[a][b]!.toFixed(4)) : '',
              });
            }
          }
        }
      }
      return {
        columns: [
          { key: 'layer', label: 'Layer' },
          { key: 'indicator_a', label: 'Indicator A' },
          { key: 'indicator_b', label: 'Indicator B' },
          { key: 'correlation', label: 'Correlation (r)' },
          { key: 'p_value', label: 'p-value' },
        ],
        rows,
      };
    },
  },

  // ── Per-indicator detail ─────────────────────────────────────────────
  {
    id: 'indicator-deep-dive',
    title: 'Per-Indicator Deep Dive',
    tab: 'analysis',
    section: 'indicator',
    description:
      'For each indicator: histogram, ranking across zones, and FG/MG/BG breakdown. Layer std/CV columns reuse the global stats from Table M2.',
    isAvailable: (ctx) =>
      !!ctx.zoneAnalysisResult && ctx.zoneAnalysisResult.zone_statistics.length > 0,
    summaryPayload: (ctx) => {
      const za = ctx.zoneAnalysisResult!;
      const indIds = Array.from(new Set(za.zone_statistics.map((s) => s.indicator_id))).slice(0, 10);
      const rows = indIds.map((ind) => {
        const stats = za.zone_statistics.filter((s) => s.indicator_id === ind && s.layer === 'full');
        const ranked = stats
          .map((s) => ({ zone: s.zone_name, mean: s.mean, z: s.z_score }))
          .sort((a, b) => Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0))
          .slice(0, 5);
        const def = za.indicator_definitions[ind];
        return {
          indicator: ind,
          target_direction: def?.target_direction,
          top_zones: ranked,
        };
      });
      return { analysis_mode: ctx.analysisMode, zone_count: ctx.sortedDiagnostics.length, indicators: rows };
    },
    render: (ctx) => {
      const za = ctx.zoneAnalysisResult!;
      const indIds = Array.from(new Set(za.zone_statistics.map((s) => s.indicator_id))).sort();
      const indDefs = za.indicator_definitions || {};
      const globalStatsByInd = new Map(
        ctx.globalIndicatorStats.map((s) => [s.indicator_id, s]),
      );
      return (
        <VStack
          align="stretch"
          spacing={8}
          divider={<Box borderTopWidth="1px" borderColor="gray.200" />}
        >
          {indIds.map((ind) => {
            const def = indDefs[ind];
            return (
              <IndicatorDeepDive
                key={ind}
                stats={za.zone_statistics}
                indicatorId={ind}
                indicatorName={def?.name}
                unit={def?.unit}
                targetDirection={def?.target_direction}
                analysisMode={ctx.analysisMode}
                globalStats={globalStatsByInd.get(ind)}
              />
            );
          })}
        </VStack>
      );
    },
  },
  {
    id: 'distribution-violin',
    title: 'Distribution Shape',
    refCode: 'Fig M1',
    tab: 'analysis',
    section: 'indicator',
    description: 'Box-whisker per layer for each indicator (image-level values).',
    isAvailable: (ctx) => ctx.imageRecords.length > 0,
    summaryPayload: (ctx) => {
      // Per indicator × layer: n, min, max, mean. Capped at 10 indicators × 4
      // layers = 40 rows ≈ <2KB.
      const buckets = new Map<string, number[]>();
      for (const r of ctx.imageRecords) {
        if (typeof r.value !== 'number') continue;
        const key = `${r.indicator_id}|${r.layer}`;
        const list = buckets.get(key) ?? [];
        list.push(r.value);
        buckets.set(key, list);
      }
      const indSet = Array.from(new Set(ctx.imageRecords.map((r) => r.indicator_id))).slice(0, 10);
      const rows: { indicator: string; layer: string; n: number; min: number; max: number; mean: number }[] = [];
      for (const ind of indSet) {
        for (const layer of LAYERS_FOR_PAYLOAD) {
          const vals = buckets.get(`${ind}|${layer}`);
          if (!vals || vals.length === 0) continue;
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          rows.push({ indicator: ind, layer, n: vals.length, min, max, mean });
        }
      }
      return { analysis_mode: ctx.analysisMode, zone_count: ctx.sortedDiagnostics.length, rows };
    },
    render: (ctx) => (
      <ViolinGrid imageRecords={ctx.imageRecords} indicatorDefs={ctx.indicatorDefs} />
    ),
  },

  // ── Reference tables ────────────────────────────────────────────────
  {
    id: 'global-stats-table',
    title: 'Global Descriptive Statistics',
    refCode: 'M2',
    tab: 'analysis',
    section: 'reference',
    description: 'Per-indicator Mean ± Std by layer, CV, Shapiro-Wilk, Kruskal-Wallis.',
    isAvailable: (ctx) => ctx.globalIndicatorStats.length > 0,
    exportRows: (ctx) => {
      const cols = [
        { key: 'indicator_id', label: 'Indicator' },
        { key: 'cv_full', label: 'CV (Full)' },
        { key: 'shapiro_p', label: 'Shapiro-Wilk p' },
        { key: 'kruskal_p', label: 'Kruskal-Wallis p' },
        ...LAYERS_FOR_PAYLOAD.flatMap((layer) => [
          { key: `${layer}_n`, label: `${layer} N` },
          { key: `${layer}_mean`, label: `${layer} Mean` },
          { key: `${layer}_std`, label: `${layer} Std` },
        ]),
      ];
      const rows = ctx.globalIndicatorStats.map((s) => {
        const row: Record<string, unknown> = {
          indicator_id: s.indicator_id,
          cv_full: s.cv_full ?? '',
          shapiro_p: s.shapiro_p ?? '',
          kruskal_p: s.kruskal_p ?? '',
        };
        for (const layer of LAYERS_FOR_PAYLOAD) {
          const v = s.by_layer?.[layer];
          row[`${layer}_n`] = v?.N ?? '';
          row[`${layer}_mean`] = v?.Mean ?? '';
          row[`${layer}_std`] = v?.Std ?? '';
        }
        return row;
      });
      return { columns: cols, rows };
    },
    summaryPayload: (ctx) => ({
      analysis_mode: ctx.analysisMode,
      zone_count: ctx.sortedDiagnostics.length,
      // Per indicator × layer: trimmed to 10 indicators × 4 layers.
      rows: ctx.globalIndicatorStats.slice(0, 10).map((s) => ({
        indicator: s.indicator_id,
        cv_full: s.cv_full ?? null,
        shapiro_p: s.shapiro_p ?? null,
        kruskal_p: s.kruskal_p ?? null,
        by_layer: Object.fromEntries(
          LAYERS_FOR_PAYLOAD.map((layer) => {
            const v = s.by_layer?.[layer];
            return v
              ? [layer, { n: v.N, mean: v.Mean, std: v.Std }]
              : [layer, null];
          }).filter(([, v]) => v != null),
        ),
      })),
    }),
    render: (ctx) => <GlobalStatsTable stats={ctx.globalIndicatorStats} />,
  },

  // ── Clustering (folded inside an Accordion in Reports.tsx) ───────────
  {
    id: 'silhouette-curve',
    title: 'Silhouette Score Curve',
    tab: 'analysis',
    section: 'clustering',
    description: 'Silhouette score per K (used to pick optimal cluster count).',
    isAvailable: (ctx) =>
      !!ctx.effectiveClustering?.silhouette_scores &&
      ctx.effectiveClustering.silhouette_scores.length > 1,
    render: (ctx) => (
      <SilhouetteCurve
        scores={ctx.effectiveClustering!.silhouette_scores}
        bestK={ctx.effectiveClustering!.k}
      />
    ),
  },
  {
    id: 'dendrogram',
    title: 'Ward Hierarchical Clustering',
    tab: 'analysis',
    section: 'clustering',
    description: 'Dendrogram from Ward linkage.',
    isAvailable: (ctx) =>
      !!ctx.effectiveClustering?.dendrogram_linkage &&
      ctx.effectiveClustering.dendrogram_linkage.length > 0,
    render: (ctx) => <Dendrogram linkage={ctx.effectiveClustering!.dendrogram_linkage} />,
  },
  {
    id: 'cluster-spatial-smoothing',
    title: 'Cluster Spatial Smoothing',
    tab: 'analysis',
    section: 'clustering',
    description: 'Before/after KNN spatial smoothing comparison (needs GPS).',
    isAvailable: (ctx) =>
      !!ctx.effectiveClustering?.point_lats &&
      ctx.effectiveClustering.point_lats.length > 0 &&
      !!ctx.effectiveClustering.labels_raw &&
      ctx.effectiveClustering.labels_raw.length > 0,
    render: (ctx) => {
      const cl = ctx.effectiveClustering!;
      return (
        <ClusterSpatialBeforeAfter
          lats={cl.point_lats}
          lngs={cl.point_lngs}
          labelsRaw={cl.labels_raw}
          labelsSmoothed={cl.labels_smoothed}
          archetypeLabels={Object.fromEntries(
            cl.archetype_profiles.map((a) => [a.archetype_id, a.archetype_label]),
          )}
        />
      );
    },
  },
  {
    id: 'archetype-radar',
    title: 'Archetype Radar Profiles',
    tab: 'analysis',
    section: 'clustering',
    description: 'z-score radar for each discovered archetype.',
    isAvailable: (ctx) =>
      !!ctx.effectiveClustering && ctx.effectiveClustering.archetype_profiles.length > 0,
    render: (ctx) => (
      <ArchetypeRadarChart archetypes={ctx.effectiveClustering!.archetype_profiles} />
    ),
  },
  {
    id: 'cluster-size-distribution',
    title: 'Cluster Size Distribution',
    tab: 'analysis',
    section: 'clustering',
    description: 'Point count per archetype.',
    isAvailable: (ctx) =>
      !!ctx.effectiveClustering && ctx.effectiveClustering.archetype_profiles.length > 0,
    render: (ctx) => <ClusterSizeChart archetypes={ctx.effectiveClustering!.archetype_profiles} />,
  },
];

// Re-export so consumers can render the section heading next to chart groups.
export function getDescriptorBySection(
  section: ChartSection,
): ChartDescriptor[] {
  return CHART_REGISTRY.filter((c) => c.section === section);
}

// SectionHeading lives in ./SectionHeading.tsx — registry.tsx stays a data
// + helper module and avoids the react-refresh "mixed exports" warning.
