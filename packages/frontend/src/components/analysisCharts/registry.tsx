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
  RadarProfileByLayer,
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

export type ChartTab = 'diagnostics' | 'statistics' | 'analysis';
export type ChartSection = 'zone' | 'clustering' | 'tables' | 'distributions';

export interface ChartDescriptor {
  /** Stable unique identifier, used as persistence key */
  id: string;
  /** Human-readable title shown in Card header + picker checkbox */
  title: string;
  /** Which tab this chart renders in */
  tab: ChartTab;
  /** Subsection within a tab (diagnostics charts split into 'zone' and
   * 'clustering' so the Clustering control card can sit between them). */
  section?: ChartSection;
  /** Short tooltip/description shown in the picker */
  description?: string;
  /** Returns false when required data isn't available — chart is skipped */
  isAvailable: (ctx: ChartContext) => boolean;
  /** Renders the chart body (ChartHost provides the Card wrapper) */
  render: (ctx: ChartContext) => ReactNode;
  /** Whether the chart reacts to the layer selector (re-rendered on layer change) */
  layerAware?: boolean;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
// Order here = render order in each tab. Add new charts by appending a
// descriptor. Remove a chart by deleting / commenting out its entry.

export const CHART_REGISTRY: ChartDescriptor[] = [
  // ════════════════════════════════════════════════════════════════════════
  // Unified "Analysis" tab  (merged from former Diagnostics + Statistics)
  //
  // Sections:  zone → tables → distributions → clustering
  // ════════════════════════════════════════════════════════════════════════

  // ── Zone overview ──────────────────────────────────────────────────────
  {
    id: 'zone-deviation-overview',
    title: 'Zone Deviation Overview',
    tab: 'analysis',
    section: 'zone',
    description: 'Horizontal bar of each zone ranked by mean |z-score|',
    isAvailable: (ctx) => ctx.sortedDiagnostics.length > 0,
    render: (ctx) => <ZonePriorityChart diagnostics={ctx.sortedDiagnostics} />,
  },
  {
    id: 'priority-heatmap',
    title: 'Zone × Indicator Z-Score Grid',
    tab: 'analysis',
    section: 'zone',
    description: 'Descriptive z-score grid per zone × indicator (full layer)',
    isAvailable: (ctx) => ctx.sortedDiagnostics.length > 0,
    render: (ctx) => <PriorityHeatmap diagnostics={ctx.sortedDiagnostics} layer="full" />,
  },
  {
    id: 'spatial-distribution-by-layer',
    title: 'Layer Coverage Map per Indicator',
    tab: 'analysis',
    section: 'zone',
    description:
      'Per indicator, four small maps (Full/FG/MG/BG) showing where each layer has data. Color encodes the layer, NOT the indicator value — see Value Heatmap for value-based coloring.',
    isAvailable: (ctx) => ctx.gpsImages.length > 0 && ctx.gpsIndicatorIds.length > 0,
    render: (ctx) => (
      <VStack align="stretch" spacing={6}>
        {ctx.gpsIndicatorIds.map((ind) => (
          <SpatialScatterByLayer key={ind} gpsImages={ctx.gpsImages} indicatorId={ind} />
        ))}
      </VStack>
    ),
  },
  {
    id: 'value-spatial-distribution',
    title: 'Value Heatmap per Indicator',
    tab: 'analysis',
    section: 'zone',
    description:
      'Per indicator, GPS points colored by the raw indicator value (full layer). Direction-aware gradient: INCREASE indicators darken when higher, DECREASE indicators darken when lower.',
    isAvailable: (ctx) => ctx.gpsImages.length > 0 && ctx.gpsIndicatorIds.length > 0,
    render: (ctx) => {
      const defs = ctx.zoneAnalysisResult?.indicator_definitions || {};
      return (
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          {ctx.gpsIndicatorIds.map((ind) => (
            <ValueSpatialMap
              key={ind}
              gpsImages={ctx.gpsImages}
              indicatorId={ind}
              layer="full"
              targetDirection={defs[ind]?.target_direction}
            />
          ))}
        </SimpleGrid>
      );
    },
  },
  {
    id: 'cross-indicator-spatial-maps',
    title: 'Cross-Indicator Spatial Maps (Fig 8)',
    tab: 'analysis',
    section: 'zone',
    description: 'Mean |z| deviation + most-distinctive indicator per GPS point (full layer)',
    isAvailable: (ctx) => ctx.gpsImages.length > 0 && ctx.gpsIndicatorIds.length > 0,
    render: (ctx) => (
      <CrossIndicatorSpatialMaps gpsImages={ctx.gpsImages} indicatorIds={ctx.gpsIndicatorIds} />
    ),
  },
  {
    id: 'radar-profiles',
    title: 'Radar Profiles (Zone Comparison, Full Layer)',
    tab: 'analysis',
    section: 'zone',
    description: 'All zones overlaid on one radar — percentile scores, full layer',
    isAvailable: (ctx) =>
      !!ctx.zoneAnalysisResult?.radar_profiles &&
      Object.keys(ctx.zoneAnalysisResult.radar_profiles).length > 0,
    render: (ctx) => <RadarProfileChart radarProfiles={ctx.zoneAnalysisResult!.radar_profiles} />,
  },
  {
    id: 'radar-profiles-by-layer',
    title: 'Radar Profiles by Layer (Per Zone)',
    tab: 'analysis',
    section: 'zone',
    description: 'Per-zone radar with FG/MG/BG/Full polygons overlaid (matches notebook Fig 4)',
    isAvailable: (ctx) =>
      !!ctx.zoneAnalysisResult?.radar_profiles_by_layer &&
      Object.keys(ctx.zoneAnalysisResult.radar_profiles_by_layer).length > 0,
    render: (ctx) => (
      <RadarProfileByLayer
        radarProfilesByLayer={ctx.zoneAnalysisResult!.radar_profiles_by_layer!}
      />
    ),
  },

  // ── Clustering (still in Diagnostics tab, rendered after the control card)
  {
    id: 'silhouette-curve',
    title: 'Silhouette Score Curve',
    tab: 'analysis',
    section: 'clustering',
    description: 'Silhouette score per K (optimal K selection)',
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
    description: 'Dendrogram from Ward linkage',
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
    description: 'Before/after KNN spatial smoothing comparison (needs GPS)',
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
    description: 'Z-score radar for each discovered archetype',
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
    description: 'Point count per archetype',
    isAvailable: (ctx) =>
      !!ctx.effectiveClustering && ctx.effectiveClustering.archetype_profiles.length > 0,
    render: (ctx) => <ClusterSizeChart archetypes={ctx.effectiveClustering!.archetype_profiles} />,
  },

  // ── Correlations + tables ────────────────────────────────────────────────
  {
    id: 'correlation-heatmap',
    title: 'Correlation Heatmap',
    tab: 'analysis',
    layerAware: true,
    isAvailable: (ctx) => !!ctx.correlationData && ctx.correlationData.indicators.length > 0,
    render: (ctx) => {
      const cd = ctx.correlationData!;
      return <CorrelationHeatmap corr={cd.corr} pval={cd.pval} indicators={cd.indicators} />;
    },
  },
  // ── Per-indicator drill-down ─────────────────────────────────────────────
  {
    id: 'indicator-deep-dive',
    title: 'Per-Indicator Deep Dive',
    tab: 'analysis',
    description: 'Per-indicator histogram, ranking, FG/MG/BG breakdown',
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

  // ────────────────────────────────────────────────────────────────────────
  // v7.0 — New Tables & Figures (Stage 2 Figure & Table Plan)
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'indicator-registry-table',
    title: 'Indicator Registry (Table M1)',
    tab: 'analysis',
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
                const gs = ctx.globalIndicatorStats.find(
                  (s) => s.indicator_id === d.id,
                );
                const fullN = gs?.by_layer?.full?.N ?? '-';
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
    id: 'global-stats-table',
    title: 'Global Descriptive Statistics (Table M2)',
    tab: 'analysis',
    description: 'Per-indicator Mean±Std by layer, CV, Shapiro-Wilk, Kruskal-Wallis',
    isAvailable: (ctx) => ctx.globalIndicatorStats.length > 0,
    render: (ctx) => <GlobalStatsTable stats={ctx.globalIndicatorStats} />,
  },
  {
    id: 'zone-indicator-matrix',
    title: 'Zone × Indicator Matrix (Table M3)',
    tab: 'analysis',
    description: 'Absolute mean values per zone per indicator (full layer) + global mean row',
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
      // Global mean row
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
                      {grid[zone]?.[ind] != null
                        ? grid[zone][ind]!.toFixed(2)
                        : '-'}
                    </Td>
                  ))}
                </Tr>
              ))}
              {/* Global mean row */}
              <Tr bg="gray.50" fontWeight="bold">
                <Td fontSize="xs">Global Mean</Td>
                {indicators.map((ind) => (
                  <Td key={ind} isNumeric fontSize="xs">
                    {globalMean[ind] != null ? globalMean[ind]!.toFixed(2) : '-'}
                  </Td>
                ))}
              </Tr>
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
    description: 'Images per indicator, FMB coverage, normality, correlation method',
    isAvailable: (ctx) => ctx.dataQuality.length > 0,
    render: (ctx) => <DataQualityTable rows={ctx.dataQuality} />,
  },
  {
    id: 'distribution-violin',
    title: 'Distribution Shape (Fig M1)',
    tab: 'analysis',
    description: 'Box-whisker per layer for each indicator (image-level values)',
    isAvailable: (ctx) => ctx.imageRecords.length > 0,
    render: (ctx) => (
      <ViolinGrid
        imageRecords={ctx.imageRecords}
        indicatorDefs={ctx.indicatorDefs}
      />
    ),
  },
];
