import type {
  ZoneAnalysisResult,
  ProjectPipelineResult,
  ClusteringResponse,
  ClusteringResult,
  Project,
  ZoneDiagnostic,
  EnrichedZoneStat,
  UploadedImage,
  ImageRecord,
  GlobalIndicatorStats,
  DataQualityRow,
  IndicatorDefinitionInput,
} from '../../types';

/**
 * Unified data bundle passed to every chart descriptor's `isAvailable` and
 * `render` functions. Centralises all derived state so descriptors stay
 * declarative.
 */
export interface ChartContext {
  // Raw state
  zoneAnalysisResult: ZoneAnalysisResult | null;
  pipelineResult: ProjectPipelineResult | null;
  clusteringResult: ClusteringResponse | null;
  currentProject: Project | null;

  // Layer selector (for Statistics tab)
  selectedLayer: string;

  // Derived
  sortedDiagnostics: ZoneDiagnostic[];
  filteredStats: EnrichedZoneStat[]; // stats restricted to selectedLayer
  correlationData: {
    indicators: string[];
    corr: Record<string, Record<string, number>>;
    pval?: Record<string, Record<string, number>>;
  } | null;
  gpsImages: UploadedImage[];
  gpsIndicatorIds: string[];
  effectiveClustering: ClusteringResult | null;

  // v7.0
  imageRecords: ImageRecord[];
  globalIndicatorStats: GlobalIndicatorStats[];
  dataQuality: DataQualityRow[];
  indicatorDefs: Record<string, IndicatorDefinitionInput>;
  analysisMode: 'zone_level' | 'image_level';
  zoneSource: 'user' | 'cluster' | null;

  // Reading preferences (5.10.4 / 5.10.8)
  colorblindMode: boolean;
}

export const LAYERS = ['full', 'foreground', 'middleground', 'background'];
export const LAYER_LABELS: Record<string, string> = {
  full: 'Full',
  foreground: 'FG',
  middleground: 'MG',
  background: 'BG',
};

function rebuildImageRecords(project: Project | null): ImageRecord[] {
  if (!project) return [];
  const zoneLookup = new Map(project.spatial_zones.map(z => [z.zone_id, z]));
  const records: ImageRecord[] = [];
  for (const img of project.uploaded_images) {
    if (!img.zone_id) continue;
    const zone = zoneLookup.get(img.zone_id);
    if (!zone) continue;
    if (!img.metrics_results) continue;
    for (const [key, value] of Object.entries(img.metrics_results)) {
      if (value == null) continue;
      const sep = key.indexOf('__');
      const indicator_id = sep >= 0 ? key.slice(0, sep) : key;
      const layer = sep >= 0 ? key.slice(sep + 2) : 'full';
      records.push({
        image_id: img.image_id,
        zone_id: img.zone_id,
        zone_name: zone.zone_name,
        indicator_id,
        layer,
        value,
        lat: img.latitude,
        lng: img.longitude,
      });
    }
  }
  return records;
}

interface BuildArgs {
  zoneAnalysisResult: ZoneAnalysisResult | null;
  pipelineResult: ProjectPipelineResult | null;
  clusteringResult: ClusteringResponse | null;
  currentProject: Project | null;
  selectedLayer: string;
  colorblindMode?: boolean;
}

/**
 * Compute all derived chart-context values once from raw state. Cheap enough
 * to recompute on every relevant state change.
 */
export function buildChartContext(args: BuildArgs): ChartContext {
  const {
    zoneAnalysisResult,
    pipelineResult,
    clusteringResult,
    currentProject,
    selectedLayer,
    colorblindMode = false,
  } = args;

  const sortedDiagnostics = zoneAnalysisResult
    ? [...zoneAnalysisResult.zone_diagnostics].sort((a, b) => b.mean_abs_z - a.mean_abs_z)
    : [];

  const filteredStats = zoneAnalysisResult
    ? zoneAnalysisResult.zone_statistics.filter(s => s.layer === selectedLayer)
    : [];

  const correlationData = (() => {
    if (!zoneAnalysisResult) return null;
    const corr = zoneAnalysisResult.correlation_by_layer?.[selectedLayer];
    const pval = zoneAnalysisResult.pvalue_by_layer?.[selectedLayer];
    if (!corr) return null;
    return { indicators: Object.keys(corr), corr, pval };
  })();

  const gpsImages = currentProject
    ? currentProject.uploaded_images.filter(
        img => img.has_gps && img.latitude != null && img.longitude != null,
      )
    : [];

  const gpsIndicatorIds = Array.from(
    new Set(
      gpsImages.flatMap(img =>
        Object.keys(img.metrics_results)
          .filter(k => img.metrics_results[k] != null)
          .map(k => k.split('__')[0]),
      ),
    ),
  ).sort();

  const effectiveClustering =
    clusteringResult?.clustering ?? zoneAnalysisResult?.clustering ?? null;

  // v7.0 data
  // image_records are stripped from the SSE pipeline result to keep the payload small
  // (1 row per image × indicator × layer can be 5–10 MB for a 1000+ image project, and
  // gets serialised into a single SSE event that intermediate proxies may truncate).
  // Rebuild on the client from `project.uploaded_images[].metrics_results`, which has
  // the same source data the backend used.
  const imageRecords: ImageRecord[] =
    zoneAnalysisResult?.image_records?.length
      ? zoneAnalysisResult.image_records
      : rebuildImageRecords(currentProject);
  const globalIndicatorStats = zoneAnalysisResult?.global_indicator_stats ?? [];
  const dataQuality = zoneAnalysisResult?.data_quality ?? [];
  const indicatorDefs = zoneAnalysisResult?.indicator_definitions ?? {};
  const analysisMode = zoneAnalysisResult?.analysis_mode ?? 'zone_level';
  const zoneSource = zoneAnalysisResult?.zone_source ?? null;

  return {
    zoneAnalysisResult,
    pipelineResult,
    clusteringResult,
    currentProject,
    selectedLayer,
    sortedDiagnostics,
    filteredStats,
    correlationData,
    gpsImages,
    gpsIndicatorIds,
    effectiveClustering,
    imageRecords,
    globalIndicatorStats,
    dataQuality,
    indicatorDefs,
    analysisMode,
    zoneSource,
    colorblindMode,
  };
}
