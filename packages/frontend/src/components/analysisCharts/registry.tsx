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
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from '@chakra-ui/react';
import {
  RadarProfileChart,
  ZonePriorityChart,
  CorrelationHeatmap,
  PriorityHeatmap,
  ArchetypeRadarChart,
  ClusterSizeChart,
  SpatialScatterByLayer,
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
 * Sections drive the narrative ordering on the Analysis tab. Order below
 * matches the rendered order; descriptors carry their section so Reports.tsx
 * can group them under sub-headings without reading the registry order
 * directly.
 */
export type ChartSection =
  | 'context'
  | 'overview'
  | 'spatial'
  | 'comparison'
  | 'correlation'
  | 'detail'
  | 'tables'
  | 'clustering';

export const SECTION_ORDER: ChartSection[] = [
  'context',
  'overview',
  'spatial',
  'comparison',
  'correlation',
  'detail',
  'tables',
  'clustering',
];

export const SECTION_META: Record<
  ChartSection,
  { title: string; subtitle: string }
> = {
  context: {
    title: 'Context',
    subtitle: 'What we are analysing — indicator registry and data quality.',
  },
  overview: {
    title: 'Zone Overview',
    subtitle: "Where each zone sits on the deviation spectrum.",
  },
  spatial: {
    title: 'Spatial',
    subtitle: 'Where indicators land on the site map.',
  },
  comparison: {
    title: 'Cross-Zone Comparison',
    subtitle: 'How zones differ on the selected layer.',
  },
  correlation: {
    title: 'Correlations',
    subtitle: 'Which indicators co-vary.',
  },
  detail: {
    title: 'Per-Indicator Detail',
    subtitle: 'Drill into one indicator at a time.',
  },
  tables: {
    title: 'Reference Tables',
    subtitle: 'Numbers behind the figures.',
  },
  clustering: {
    title: 'SVC Archetype Clustering',
    subtitle: 'Optional: discover sub-zone archetypes.',
  },
};

export interface ChartDescriptor {
  /** Stable unique identifier, used as persistence key */
  id: string;
  /** Human-readable title shown in Card header + picker checkbox */
  title: string;
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
   */
  summaryPayload?: (ctx: ChartContext) => Record<string, unknown>;
  /**
   * 6.B(1) — when true, the chart is included in the embedded report by
   * default. Other charts can still be opted in via the Customize panel.
   */
  exportByDefault?: boolean;
}

// ---------------------------------------------------------------------------
// Helper: resolve radar_profiles for the currently-selected layer
// ---------------------------------------------------------------------------
function resolveRadarProfiles(
  ctx: ChartContext,
): Record<string, Record<string, number>> | null {
  const za = ctx.zoneAnalysisResult;
  if (!za) return null;
  if (ctx.selectedLayer === 'full' || !za.radar_profiles_by_layer) {
    return za.radar_profiles ?? null;
  }
  const byLayer = za.radar_profiles_by_layer[ctx.selectedLayer];
  if (byLayer && Object.keys(byLayer).length > 0) return byLayer;
  return za.radar_profiles ?? null;
}

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
    title: 'Indicator Registry (Table M1)',
    tab: 'analysis',
    section: 'context',
    description: 'What indicators are we analyzing? Metadata-only list.',
    isAvailable: (ctx) => Object.keys(ctx.indicatorDefs).length > 0,
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
    title: 'Data Quality Diagnostics (Table M4)',
    tab: 'analysis',
    section: 'context',
    description: 'Images per indicator, FMB coverage, normality, correlation method.',
    isAvailable: (ctx) => ctx.dataQuality.length > 0,
    render: (ctx) => <DataQualityTable rows={ctx.dataQuality} />,
  },

  // ── Zone overview ────────────────────────────────────────────────────
  {
    id: 'zone-deviation-overview',
    title: "Each zone's overall distinctiveness",
    tab: 'analysis',
    section: 'overview',
    description:
      'Horizontal bar of each zone ranked by mean |z-score| across indicators (full layer).',
    exportByDefault: true,
    isAvailable: (ctx) => ctx.sortedDiagnostics.length > 0,
    render: (ctx) => <ZonePriorityChart diagnostics={ctx.sortedDiagnostics} />,
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
    section: 'overview',
    description:
      'z-score grid: rows = zones, columns = indicators (full layer). Red = above mean, blue = below.',
    isAvailable: (ctx) => ctx.sortedDiagnostics.length > 0,
    render: (ctx) => (
      <PriorityHeatmap
        diagnostics={ctx.sortedDiagnostics}
        layer="full"
        colorblindMode={ctx.colorblindMode}
      />
    ),
  },

  // ── Spatial (3-tab combo replacing former 3 separate cards) ──────────
  {
    id: 'spatial-overview',
    title: 'Indicator Spatial Maps (coverage · value · deviation)',
    tab: 'analysis',
    section: 'spatial',
    layerAware: true,
    exportByDefault: true,
    description:
      'Three views of the GPS scatter: Layer Coverage shows where each FMB layer has data; Value Heatmap colors points by raw indicator value; Z-Deviation highlights the most distinctive indicator at each point.',
    isAvailable: (ctx) => ctx.gpsImages.length > 0 && ctx.gpsIndicatorIds.length > 0,
    render: (ctx) => {
      const defs = ctx.zoneAnalysisResult?.indicator_definitions || {};
      const layerLabel = LAYER_LABELS[ctx.selectedLayer] ?? ctx.selectedLayer;
      return (
        <Tabs colorScheme="blue" variant="soft-rounded" size="sm">
          <TabList>
            <Tab>Layer Coverage</Tab>
            <Tab>Value Heatmap ({layerLabel})</Tab>
            <Tab>Z-Deviation</Tab>
          </TabList>
          <TabPanels>
            <TabPanel px={0}>
              <Text fontSize="xs" color="gray.500" mb={3}>
                Per indicator, four small maps (Full/FG/MG/BG). Color encodes the layer the point came
                from, NOT the indicator value — see the Value Heatmap tab for value-based coloring.
              </Text>
              <VStack align="stretch" spacing={6}>
                {ctx.gpsIndicatorIds.map((ind) => (
                  <SpatialScatterByLayer
                    key={ind}
                    gpsImages={ctx.gpsImages}
                    indicatorId={ind}
                  />
                ))}
              </VStack>
            </TabPanel>
            <TabPanel px={0}>
              <Text fontSize="xs" color="gray.500" mb={3}>
                Points colored by raw indicator value on the {layerLabel} layer.
                INCREASE indicators darken when higher; DECREASE indicators darken when lower.
              </Text>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                {ctx.gpsIndicatorIds.map((ind) => (
                  <ValueSpatialMap
                    key={ind}
                    gpsImages={ctx.gpsImages}
                    indicatorId={ind}
                    layer={ctx.selectedLayer as 'full' | 'foreground' | 'middleground' | 'background'}
                    targetDirection={defs[ind]?.target_direction}
                    colorblindMode={ctx.colorblindMode}
                  />
                ))}
              </SimpleGrid>
            </TabPanel>
            <TabPanel px={0}>
              <Text fontSize="xs" color="gray.500" mb={3}>
                Mean |z| deviation across indicators (left) and the most-distinctive indicator at
                each GPS point (right). Full-layer values.
              </Text>
              <CrossIndicatorSpatialMaps
                gpsImages={ctx.gpsImages}
                indicatorIds={ctx.gpsIndicatorIds}
                colorblindMode={ctx.colorblindMode}
              />
            </TabPanel>
          </TabPanels>
        </Tabs>
      );
    },
  },

  // ── Cross-zone comparison ────────────────────────────────────────────
  {
    id: 'radar-profiles',
    title: 'Radar Profiles (Cross-Zone)',
    tab: 'analysis',
    section: 'comparison',
    layerAware: true,
    exportByDefault: true,
    description:
      "All zones overlaid on one radar — percentile scores. Use the Layer toggle at the top of this tab to switch between Full / FG / MG / BG views.",
    isAvailable: (ctx) => {
      const profiles = resolveRadarProfiles(ctx);
      return !!profiles && Object.keys(profiles).length > 0;
    },
    render: (ctx) => {
      const profiles = resolveRadarProfiles(ctx);
      if (!profiles) return null;
      const layerLabel = LAYER_LABELS[ctx.selectedLayer] ?? ctx.selectedLayer;
      return (
        <Box>
          <Text fontSize="xs" color="gray.500" mb={2}>
            Showing zone-level percentiles on the <b>{layerLabel}</b> layer.
          </Text>
          <RadarProfileChart radarProfiles={profiles} />
        </Box>
      );
    },
    summaryPayload: (ctx) => ({
      layer: ctx.selectedLayer,
      analysis_mode: ctx.analysisMode,
      profiles: resolveRadarProfiles(ctx) ?? {},
    }),
  },
  {
    id: 'zone-indicator-matrix',
    title: 'Zone × Indicator Matrix (Table M3)',
    tab: 'analysis',
    section: 'comparison',
    description:
      'Absolute mean values per zone per indicator (full layer) plus a global-mean reference row.',
    isAvailable: (ctx) => ctx.filteredStats.length > 0,
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

  // ── Correlations ─────────────────────────────────────────────────────
  {
    id: 'correlation-heatmap',
    title: 'Indicator Correlation Heatmap',
    tab: 'analysis',
    section: 'correlation',
    layerAware: true,
    exportByDefault: true,
    description:
      'Pairwise correlation between indicators on the selected layer. Single-zone projects fall back to image-level correlations.',
    isAvailable: (ctx) => !!ctx.correlationData && ctx.correlationData.indicators.length > 0,
    render: (ctx) => {
      const cd = ctx.correlationData!;
      return (
        <CorrelationHeatmap
          corr={cd.corr}
          pval={cd.pval}
          indicators={cd.indicators}
          colorblindMode={ctx.colorblindMode}
        />
      );
    },
    summaryPayload: (ctx) => {
      const cd = ctx.correlationData;
      if (!cd) return { layer: ctx.selectedLayer, pairs: [] };
      const pairs: { a: string; b: string; r: number }[] = [];
      for (let i = 0; i < cd.indicators.length; i++) {
        for (let j = i + 1; j < cd.indicators.length; j++) {
          const a = cd.indicators[i];
          const b = cd.indicators[j];
          const r = cd.corr[a]?.[b];
          if (r != null) pairs.push({ a, b, r });
        }
      }
      // Send the strongest 12 pairs by |r| — keeps payload small.
      pairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
      return {
        layer: ctx.selectedLayer,
        analysis_mode: ctx.analysisMode,
        strongest_pairs: pairs.slice(0, 12),
      };
    },
  },

  // ── Per-indicator detail ─────────────────────────────────────────────
  {
    id: 'indicator-deep-dive',
    title: 'Per-Indicator Deep Dive',
    tab: 'analysis',
    section: 'detail',
    description:
      'For each indicator: histogram, ranking across zones, and FG/MG/BG breakdown. Layer std/CV columns reuse the global stats from Table M2.',
    isAvailable: (ctx) =>
      !!ctx.zoneAnalysisResult && ctx.zoneAnalysisResult.zone_statistics.length > 0,
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
    title: 'Distribution Shape (Fig M1)',
    tab: 'analysis',
    section: 'detail',
    description: 'Box-whisker per layer for each indicator (image-level values).',
    isAvailable: (ctx) => ctx.imageRecords.length > 0,
    render: (ctx) => (
      <ViolinGrid imageRecords={ctx.imageRecords} indicatorDefs={ctx.indicatorDefs} />
    ),
  },

  // ── Reference tables ────────────────────────────────────────────────
  {
    id: 'global-stats-table',
    title: 'Global Descriptive Statistics (Table M2)',
    tab: 'analysis',
    section: 'tables',
    description: 'Per-indicator Mean ± Std by layer, CV, Shapiro-Wilk, Kruskal-Wallis.',
    isAvailable: (ctx) => ctx.globalIndicatorStats.length > 0,
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
