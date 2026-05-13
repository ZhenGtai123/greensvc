import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project, IndicatorRecommendation, IndicatorRelationship, RecommendationSummary, ZoneAnalysisResult, DesignStrategyResult, ProjectPipelineResult, ProjectPipelineStreamEvent, GroupingMode } from '../types';
import api from '../api';
import { extractErrorMessage } from '../utils/errorMessage';

export interface VisionMaskResult {
  imageId: string;
  maskPaths: Record<string, string>;
}

export interface PipelineRunState {
  isRunning: boolean;
  projectId: string | null;
  projectName: string | null;
  startedAt: number | null;
  steps: Array<{ step: string; status: string; detail: string }>;
  imageProgress: {
    current: number; total: number; filename: string;
    succeeded: number; failed: number; cached: number;
  } | null;
  errorMessage: string | null;
  // toast hook is provided by the caller because zustand store has no React context
}

const initialPipelineRun: PipelineRunState = {
  isRunning: false,
  projectId: null,
  projectName: null,
  startedAt: null,
  steps: [],
  imageProgress: null,
  errorMessage: null,
};

// Module-level abort controller — kept outside React state so it never causes a
// re-render and never gets persisted (an AbortController can't survive a reload
// anyway). The store treats `isRunning` as the authoritative "is there a pipeline
// in flight" signal; this controller is just the cancellation handle.
let activeAbortController: AbortController | null = null;

export interface StartPipelineArgs {
  projectId: string;
  projectName: string;
  indicatorIds: string[];
  useLlm: boolean;
  onComplete?: (result: ProjectPipelineResult) => void;
  onError?: (message: string) => void;
}

interface AppState {
  // Current project
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;

  // Selected indicators
  selectedIndicators: IndicatorRecommendation[];
  setSelectedIndicators: (indicators: IndicatorRecommendation[]) => void;
  addSelectedIndicator: (indicator: IndicatorRecommendation) => void;
  removeSelectedIndicator: (indicatorId: string) => void;
  clearSelectedIndicators: () => void;

  // Vision results (persist across page navigation)
  visionMaskResults: VisionMaskResult[];
  setVisionMaskResults: (results: VisionMaskResult[]) => void;
  visionStatistics: Record<string, unknown> | null;
  setVisionStatistics: (stats: Record<string, unknown> | null) => void;

  // Pipeline results (persist across page navigation)
  recommendations: IndicatorRecommendation[];
  setRecommendations: (recs: IndicatorRecommendation[]) => void;
  indicatorRelationships: IndicatorRelationship[];
  setIndicatorRelationships: (rels: IndicatorRelationship[]) => void;
  recommendationSummary: RecommendationSummary | null;
  setRecommendationSummary: (s: RecommendationSummary | null) => void;
  zoneAnalysisResult: ZoneAnalysisResult | null;
  setZoneAnalysisResult: (r: ZoneAnalysisResult | null) => void;
  /** Active-display design strategy result for the active view. Treated as
   *  a derived view of `designStrategyResultsByViewId[activeViewId]`.
   *  Kept as a flat field for backward compat with existing Reports.tsx
   *  consumers. */
  designStrategyResult: DesignStrategyResult | null;
  setDesignStrategyResult: (r: DesignStrategyResult | null) => void;
  /** v4 / Module 14 + Phase B — per-view design strategies, keyed by an
   *  arbitrary view id (string). Standard keys:
   *    'zones', 'clusters'                      (single-zone Single/Dual View)
   *    'parent_zones', 'all_sub_clusters'       (multi-zone within-zone overview)
   *    'within_zone:<zone_id>'                  (multi-zone within-zone drill-down)
   *  Each view caches its own strategy generation independently; toggling
   *  doesn't lose work. */
  designStrategyResultsByViewId: Record<string, DesignStrategyResult | null>;
  /** Write to a specific view slot. Also mirrors into the active-display
   *  field when the requested viewId matches `activeViewId`, so the
   *  Strategies tab refreshes immediately. */
  setDesignStrategyResultForViewId: (
    viewId: string,
    result: DesignStrategyResult | null,
  ) => void;
  pipelineResult: ProjectPipelineResult | null;
  setPipelineResult: (r: ProjectPipelineResult | null) => void;

  // AI report
  /** Active-display AI report for the active view. Kept as a flat field
   *  for backward compat; treated as a derived view of
   *  `aiReportsByViewId[activeViewId]`. */
  aiReport: string | null;
  setAiReport: (r: string | null) => void;
  aiReportMeta: Record<string, unknown> | null;
  setAiReportMeta: (m: Record<string, unknown> | null) => void;
  /** v4 / Module 12 + Phase B — per-view AI reports + metas, keyed by
   *  arbitrary view id (same key space as designStrategyResultsByViewId). */
  aiReportsByViewId: Record<string, string | null>;
  aiReportMetasByViewId: Record<string, Record<string, unknown> | null>;
  /** Write to a specific view slot. Also mirrors into the active-display
   *  fields when the requested viewId matches `activeViewId`, so the
   *  Report card refreshes immediately. */
  setAiReportForViewId: (
    viewId: string,
    report: string | null,
    meta: Record<string, unknown> | null,
  ) => void;
  /** v4 / Phase B — analysis_views from the within-zone clustering response.
   *  Map of viewId → ZoneAnalysisResult so the segmented control can swap
   *  the active analysis without round-trips. Empty for projects that
   *  haven't run within-zone clustering. */
  analysisViewsByViewId: Record<string, ZoneAnalysisResult | null>;
  setAnalysisViewsByViewId: (views: Record<string, ZoneAnalysisResult | null>) => void;
  /** v4 / Phase B — currently-active view id. Drives which slot the
   *  active-display fields (zoneAnalysisResult, designStrategyResult,
   *  aiReport, aiReportMeta) mirror. Defaults to whatever groupingMode
   *  resolves to ('zones' or 'clusters'); set explicitly when the user
   *  picks a non-binary view (parent_zones, within_zone:<id>). */
  activeViewId: string;
  setActiveViewId: (viewId: string) => void;
  /** #21 — single entry-point for "the upstream context changed, drop the
   * cached report." Used after regenerating Stage 3 strategies and when the
   * user toggles grouping mode. Returns true if anything was actually
   * cleared, so callers can avoid a no-op render. */
  invalidateAiReport: () => boolean;

  clearPipelineResults: () => void;
  hydrateFromProject: (project: Project) => void;

  // Pipeline run state — lives outside React component lifetimes so the run
  // survives Analysis page unmount, and lets every other page show a global
  // progress indicator. Not persisted (the in-flight SSE connection can't
  // survive a reload anyway).
  pipelineRun: PipelineRunState;
  startPipeline: (args: StartPipelineArgs) => Promise<void>;
  cancelPipeline: () => void;
  resetPipelineRun: () => void;

  // UI State
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Analysis chart visibility (Reports page). Stores only hidden IDs, so new
  // charts added to the registry default to visible.
  hiddenChartIds: string[];
  toggleChart: (id: string) => void;
  resetCharts: () => void;

  // Reports-page reading preferences (5.10.4 + 5.10.8)
  showAiSummary: boolean;
  setShowAiSummary: (v: boolean) => void;
  colorblindMode: boolean;
  setColorblindMode: (v: boolean) => void;

  // #1 — global grouping mode (zones | clusters). Drives which dataset feeds
  // the ChartContext. zoneAnalysisResult always holds the data for the active
  // mode; the inactive mode's data lives in clusterAnalysisResult /
  // userZoneAnalysisResult so the toggle is instant.
  groupingMode: GroupingMode;
  setGroupingMode: (m: GroupingMode) => void;
  /** Snapshot of the user-zone Stage 2.5 result so we can swap back when the
   * user toggles from Cluster view back to Zone view. Set on first cluster
   * promotion; cleared on project switch / pipeline rerun. */
  userZoneAnalysisResult: ZoneAnalysisResult | null;
  setUserZoneAnalysisResult: (r: ZoneAnalysisResult | null) => void;
  /** Cluster-as-zone Stage 2.5 result (full payload) returned by the
   * /clustering/by-project endpoint. */
  clusterAnalysisResult: ZoneAnalysisResult | null;
  setClusterAnalysisResult: (r: ZoneAnalysisResult | null) => void;

  // Layer 2 — Stage 1 recommendation in-flight tracker. Persisted across
  // page reloads so a hard refresh during a long Gemini call still shows
  // the user "Resuming…" instead of an empty Get-Recommendations card.
  recommendInFlight: { projectId: string; startedAt: number } | null;
  setRecommendInFlight: (r: { projectId: string; startedAt: number } | null) => void;

  // v4 / Module 1 — single-zone entry-path strategy.
  //   null         : not yet decided (project has multiple zones, or user has
  //                  not interacted with the entry-card yet).
  //   'view_only'  : Single View — render only charts whose viableInModes
  //                  contains 'single_zone'; segmented control hidden; the
  //                  chart grid shows a "Run clustering" button up top.
  //   'cluster'    : Dual View — clustering ran; segmented control visible
  //                  and defaults to 'zones' (user toggles to 'clusters').
  singleZoneStrategy: 'view_only' | 'cluster' | null;
  setSingleZoneStrategy: (s: 'view_only' | 'cluster' | null) => void;
  /** v4 / Module 1 (multi-zone variant). Picked once per session for
   *  projects with ≥ 2 user zones:
   *   'zone_only'           — keep zone-level analysis as-is
   *   'within_zone_cluster' — within each zone run HDBSCAN, treat sub-clusters as virtual zones */
  multiZoneStrategy: 'zone_only' | 'within_zone_cluster' | null;
  setMultiZoneStrategy: (s: 'zone_only' | 'within_zone_cluster' | null) => void;
}

export const useAppStore = create<AppState>()(persist((set, get) => ({
  // Current project
  currentProject: null,
  setCurrentProject: (project) => set({ currentProject: project }),

  // Selected indicators
  selectedIndicators: [],
  setSelectedIndicators: (indicators) => set({ selectedIndicators: indicators }),
  addSelectedIndicator: (indicator) =>
    set((state) => ({
      selectedIndicators: [...state.selectedIndicators, indicator],
    })),
  removeSelectedIndicator: (indicatorId) =>
    set((state) => ({
      selectedIndicators: state.selectedIndicators.filter(
        (i) => i.indicator_id !== indicatorId
      ),
    })),
  clearSelectedIndicators: () => set({ selectedIndicators: [] }),

  // Vision results
  visionMaskResults: [],
  setVisionMaskResults: (results) => set({ visionMaskResults: results }),
  visionStatistics: null,
  setVisionStatistics: (stats) => set({ visionStatistics: stats }),

  // Pipeline results
  recommendations: [],
  setRecommendations: (recs) => set({ recommendations: recs }),
  indicatorRelationships: [],
  setIndicatorRelationships: (rels) => set({ indicatorRelationships: rels }),
  recommendationSummary: null,
  setRecommendationSummary: (s) => set({ recommendationSummary: s }),
  zoneAnalysisResult: null,
  setZoneAnalysisResult: (r) => set({ zoneAnalysisResult: r }),
  designStrategyResult: null,
  // Mirror plain setDesignStrategyResult writes into the per-view dict for
  // the currently-active viewId, so the per-view dict stays in sync even
  // when callers use the legacy flat setter.
  setDesignStrategyResult: (r) => set((s) => ({
    designStrategyResult: r,
    designStrategyResultsByViewId: { ...s.designStrategyResultsByViewId, [s.activeViewId]: r },
  })),
  designStrategyResultsByViewId: {},
  setDesignStrategyResultForViewId: (viewId, result) => set((s) => ({
    designStrategyResultsByViewId: { ...s.designStrategyResultsByViewId, [viewId]: result },
    // If the requested viewId matches the active view, refresh the
    // active-display field so the Strategies tab swaps in the new result
    // immediately.
    ...(viewId === s.activeViewId ? { designStrategyResult: result } : {}),
  })),
  pipelineResult: null,
  setPipelineResult: (r) => set({ pipelineResult: r }),

  // AI report
  aiReport: null,
  setAiReport: (r) => set((s) => ({
    aiReport: r,
    // Mirror into the slot for the currently-active view so the per-view
    // dict stays in sync with manual setAiReport calls.
    aiReportsByViewId: { ...s.aiReportsByViewId, [s.activeViewId]: r },
  })),
  aiReportMeta: null,
  setAiReportMeta: (m) => set((s) => ({
    aiReportMeta: m,
    aiReportMetasByViewId: { ...s.aiReportMetasByViewId, [s.activeViewId]: m },
  })),
  aiReportsByViewId: {},
  aiReportMetasByViewId: {},
  setAiReportForViewId: (viewId, report, meta) => set((s) => ({
    aiReportsByViewId: { ...s.aiReportsByViewId, [viewId]: report },
    aiReportMetasByViewId: { ...s.aiReportMetasByViewId, [viewId]: meta },
    // If the requested viewId matches the active view, also refresh the
    // active-display fields so the Report card swaps in the new report
    // immediately.
    ...(viewId === s.activeViewId
      ? { aiReport: report, aiReportMeta: meta }
      : {}),
  })),
  // v4 / Phase B — analysis_views map and active view selector.
  analysisViewsByViewId: {},
  setAnalysisViewsByViewId: (views) => set({ analysisViewsByViewId: views }),
  activeViewId: 'zones',  // sensible default for projects pre-multi-view
  setActiveViewId: (viewId) => set({ activeViewId: viewId }),
  invalidateAiReport: () => {
    const s = get();
    const hasActive = s.aiReport != null || s.aiReportMeta != null;
    const hasAnyView =
      Object.values(s.aiReportsByViewId).some((v) => v != null)
      || Object.values(s.aiReportMetasByViewId).some((v) => v != null);
    if (!hasActive && !hasAnyView) return false;
    // Wipe both the active-display fields AND the per-view slots.
    set({
      aiReport: null,
      aiReportMeta: null,
      aiReportsByViewId: {},
      aiReportMetasByViewId: {},
    });
    return true;
  },

  clearPipelineResults: () => set({
    visionMaskResults: [],
    visionStatistics: null,
    recommendations: [],
    indicatorRelationships: [],
    recommendationSummary: null,
    selectedIndicators: [],
    zoneAnalysisResult: null,
    designStrategyResult: null,
    designStrategyResultsByViewId: {},
    pipelineResult: null,
    aiReport: null,
    aiReportMeta: null,
    aiReportsByViewId: {},
    aiReportMetasByViewId: {},
    analysisViewsByViewId: {},
    activeViewId: 'zones',
    // Reset grouping-mode caches too — stale cluster snapshots from an old
    // pipeline run shouldn't leak into a fresh project.
    groupingMode: 'zones',
    userZoneAnalysisResult: null,
    clusterAnalysisResult: null,
  }),

  // Hydrate analysis artefacts from a freshly fetched Project. The backend
  // is the source of truth for these — this lets ProjectPipelineLayout
  // restore them on every project mount so reloads / project switches don't
  // lose the user's work.
  //
  // We always overwrite from the project payload (no "preserve local"
  // branch). That guarantees: a fresh tab opening project A cannot leak
  // localStorage from a previous session's project B; a returning user
  // sees exactly what the server has. The only state that survives across
  // sessions is project-agnostic UI prefs (still in partialize below).
  hydrateFromProject: (project: Project) => set((state) => {
    // Rebuild visionMaskResults from each image's mask_filepaths so the
    // VisionAnalysis page renders previews immediately on mount, instead
    // of inheriting the previous project's masks until that page's own
    // restoration effect runs.
    const maskResults = (project.uploaded_images ?? [])
      .filter((img) => img.mask_filepaths && Object.keys(img.mask_filepaths).length > 0)
      .map((img) => ({ imageId: img.image_id, maskPaths: img.mask_filepaths }));

    // pipelineResult is session-only metadata about the latest pipeline run
    // (skipped images, calc counts). It is NOT persisted server-side. Two
    // hydration paths to support:
    //   1. Project switch (A → B): drop the previous project's run summary
    //      so it doesn't bleed into the new project's Analysis page.
    //   2. Same-project refetch: preserve the in-memory result, otherwise a
    //      React-Query refetch (window focus, default staleTime=0 revalidate)
    //      RIGHT after a successful pipeline silently nukes the freshly-set
    //      result and bounces the Analysis page back to the empty state.
    const previousProjectId = state.currentProject?.id ?? state.pipelineResult?.project_id ?? null;
    const sameProject = previousProjectId === project.id;
    const preservedPipelineResult = sameProject ? state.pipelineResult : null;

    // Stage 1 recommendation outputs (recommendations / relationships / summary)
    // are NOT persisted server-side — they're transient results from the
    // /api/indicators/recommend mutation. On a same-project refetch the
    // backend project payload returns them as null/empty, which would clobber
    // the freshly-loaded list and bounce the Prepare page back to the
    // "Get Recommendations" empty state. Preserve in-memory values when the
    // backend doesn't carry them; drop only on project switch.
    const preservedRecommendations = sameProject
      ? (project.stage1_recommendations?.length ? project.stage1_recommendations : state.recommendations)
      : (project.stage1_recommendations ?? []);
    const preservedRelationships = sameProject
      ? (project.stage1_relationships?.length ? project.stage1_relationships : state.indicatorRelationships)
      : (project.stage1_relationships ?? []);
    const preservedSummary = sameProject
      ? (project.stage1_summary ?? state.recommendationSummary)
      : (project.stage1_summary ?? null);

    // Cluster grouping caches are also session-only — drop on project switch
    // so we don't show project A's archetypes on project B.
    const preservedGroupingMode = sameProject ? state.groupingMode : 'zones';
    const preservedUserZone = sameProject ? state.userZoneAnalysisResult : null;
    const preservedClusterAnalysis = sameProject ? state.clusterAnalysisResult : null;

    // Entry-gate picks (Single View / Dual View / Zone-only / Within-zone)
    // are session-only state. Preserve on same-project refetch so the
    // user's choice survives a React Query revalidation, but reset on
    // project switch so each project gets its own A/B/C decision (otherwise
    // navigating from project A's Single View to a new project B would
    // immediately drop the user past B's entry gate without asking).
    const preservedSingleZoneStrategy = sameProject ? state.singleZoneStrategy : null;
    const preservedMultiZoneStrategy = sameProject ? state.multiZoneStrategy : null;

    // The active zoneAnalysisResult might be the cluster-derived view (set
    // by handleRunClustering), which isn't persisted to the project payload.
    // When refetching the same project, keep whichever view the user is in.
    const inClusterView =
      sameProject && state.groupingMode === 'clusters' && !!state.clusterAnalysisResult;
    const nextZoneAnalysis = inClusterView
      ? state.clusterAnalysisResult
      : project.zone_analysis_result ?? null;

    // v4 / Phase B — hydrate per-view AI reports / strategies / analysis
    // views from the project payload's open-string-keyed dicts. Replaces
    // the previous fixed-key 'zones' / 'clusters' approach with arbitrary
    // view ids (parent_zones, all_sub_clusters, within_zone:<zone_id>).
    //
    // Backward-compat: legacy single-slot project.ai_report falls into the
    // 'zones' view if it has no other home, so projects from before the
    // multi-view refactor still display correctly.
    const projAiReports = (project.ai_reports ?? {}) as Record<string, string | null>;
    const projAiReportMetas = (project.ai_report_metas ?? {}) as Record<string, Record<string, unknown> | null>;
    const aiReportsByViewId: Record<string, string | null> = { ...projAiReports };
    const aiReportMetasByViewId: Record<string, Record<string, unknown> | null> = { ...projAiReportMetas };
    if (Object.values(aiReportsByViewId).every((v) => v == null) && project.ai_report) {
      const legacyViewId = ((project.ai_report_meta as { grouping_mode?: string; view_id?: string } | undefined)
        ?.view_id
        ?? (project.ai_report_meta as { grouping_mode?: string } | undefined)?.grouping_mode
        ?? 'zones');
      aiReportsByViewId[legacyViewId] = project.ai_report;
      aiReportMetasByViewId[legacyViewId] = (project.ai_report_meta as Record<string, unknown> | null) ?? null;
    }

    const projDesignResults = (project.design_strategy_results ?? {}) as Record<string, DesignStrategyResult | null>;
    const designStrategyResultsByViewId: Record<string, DesignStrategyResult | null> = { ...projDesignResults };
    if (
      Object.values(designStrategyResultsByViewId).every((v) => v == null)
      && project.design_strategy_result
    ) {
      designStrategyResultsByViewId.zones = project.design_strategy_result as DesignStrategyResult;
    }

    // The currently-active view: prefer whatever was active before
    // (preservedGroupingMode for sameProject re-mount), else default to
    // 'zones'. Phase C will introduce a richer activeViewId concept; for
    // now it tracks the legacy groupingMode 1:1.
    const activeViewId = preservedGroupingMode;
    const activeReport = aiReportsByViewId[activeViewId] ?? null;
    const activeMeta = aiReportMetasByViewId[activeViewId] ?? null;
    const activeStrategies = designStrategyResultsByViewId[activeViewId] ?? null;

    return {
      recommendations: preservedRecommendations,
      indicatorRelationships: preservedRelationships,
      recommendationSummary: preservedSummary,
      selectedIndicators: project.selected_indicators ?? [],
      visionMaskResults: maskResults,
      zoneAnalysisResult: nextZoneAnalysis,
      designStrategyResult: activeStrategies,
      designStrategyResultsByViewId,
      pipelineResult: preservedPipelineResult,
      aiReport: activeReport,
      aiReportMeta: activeMeta,
      aiReportsByViewId,
      aiReportMetasByViewId,
      // analysis_views is freshly populated by /clustering/within-zones
      // each session — not persisted on the project record. Reset on
      // hydrate so a stale dict from one session doesn't leak into another.
      analysisViewsByViewId: {},
      activeViewId,
      groupingMode: preservedGroupingMode,
      userZoneAnalysisResult: preservedUserZone,
      clusterAnalysisResult: preservedClusterAnalysis,
      singleZoneStrategy: preservedSingleZoneStrategy,
      multiZoneStrategy: preservedMultiZoneStrategy,
    };
  }),

  // Pipeline run state
  pipelineRun: initialPipelineRun,

  resetPipelineRun: () => set({ pipelineRun: initialPipelineRun }),

  cancelPipeline: () => {
    activeAbortController?.abort();
    activeAbortController = null;
  },

  startPipeline: async ({ projectId, projectName, indicatorIds, useLlm, onComplete, onError }) => {
    if (get().pipelineRun.isRunning) {
      // Don't allow concurrent pipelines from the same client. Caller should
      // gate UI on `pipelineRun.isRunning` so this branch is rarely hit.
      onError?.('A pipeline is already running');
      return;
    }

    set({
      pipelineRun: {
        isRunning: true,
        projectId,
        projectName,
        startedAt: Date.now(),
        steps: [],
        imageProgress: null,
        errorMessage: null,
      },
    });

    const controller = new AbortController();
    activeAbortController = controller;

    let finalResult: ProjectPipelineResult | null = null;
    let errorMessage: string | null = null;

    try {
      await api.analysis.runProjectPipelineStream(
        { project_id: projectId, indicator_ids: indicatorIds, run_stage3: true, use_llm: useLlm },
        (ev: ProjectPipelineStreamEvent) => {
          // Use functional set to compose with the latest steps array — avoids
          // racing with concurrent progress events.
          if (ev.type === 'progress') {
            set((s) => ({
              pipelineRun: {
                ...s.pipelineRun,
                imageProgress: {
                  current: ev.current,
                  total: ev.total,
                  filename: ev.image_filename,
                  succeeded: ev.succeeded,
                  failed: ev.failed,
                  cached: ev.cached,
                },
              },
            }));
          } else if (ev.type === 'status') {
            set((s) => {
              const prev = s.pipelineRun.steps;
              const idx = prev.findIndex(x => x.step === ev.step);
              const next = { step: ev.step, status: ev.status, detail: ev.detail };
              const steps = idx >= 0
                ? prev.map((x, i) => (i === idx ? next : x))
                : [...prev, next];
              return { pipelineRun: { ...s.pipelineRun, steps } };
            });
          } else if (ev.type === 'result') {
            finalResult = ev.data;
          } else if (ev.type === 'error') {
            errorMessage = ev.message;
          }
        },
        controller.signal,
      );
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        set({ pipelineRun: initialPipelineRun });
        activeAbortController = null;
        return;
      }
      errorMessage = extractErrorMessage(err, 'Pipeline failed');
    }

    activeAbortController = null;

    if (errorMessage) {
      set((s) => ({ pipelineRun: { ...s.pipelineRun, isRunning: false, errorMessage } }));
      onError?.(errorMessage);
      return;
    }
    if (finalResult) {
      const result = finalResult as ProjectPipelineResult;
      set((s) => {
        // Cross-project guard: if the user navigated away from the running
        // project mid-pipeline, the current store holds project B's hydrated
        // state. Overwriting zoneAnalysisResult here would paint A's
        // analysis onto B's pages. The backend has already persisted the
        // result to project A's record (see analysis.py:project.zone_analysis_result
        // assignment), so when the user navigates back to A,
        // hydrateFromProject will pull it in. We only flip isRunning off
        // here; the rest of the state stays correct for B.
        const stillViewingPipelineProject = s.currentProject?.id === projectId;
        if (!stillViewingPipelineProject) {
          return { pipelineRun: { ...s.pipelineRun, isRunning: false } };
        }
        return {
          pipelineResult: result,
          zoneAnalysisResult: result.zone_analysis ?? null,
          designStrategyResult: result.design_strategies ?? null,
          pipelineRun: { ...s.pipelineRun, isRunning: false },
          // A fresh pipeline run produces a brand-new user-zone analysis. Any
          // previously cached cluster snapshot or zone-snapshot belongs to the
          // OLD analysis — toggling back to them would render stale data.
          // Reset both halves of the grouping toggle so the segmented control
          // disappears until the user re-runs clustering.
          groupingMode: 'zones',
          userZoneAnalysisResult: null,
          clusterAnalysisResult: null,
        };
      });
      onComplete?.(result);
    } else {
      set((s) => ({ pipelineRun: { ...s.pipelineRun, isRunning: false } }));
    }
  },

  // UI State
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // Analysis chart visibility
  hiddenChartIds: [],
  toggleChart: (id) =>
    set((state) => ({
      hiddenChartIds: state.hiddenChartIds.includes(id)
        ? state.hiddenChartIds.filter((x) => x !== id)
        : [...state.hiddenChartIds, id],
    })),
  resetCharts: () => set({ hiddenChartIds: [] }),

  // Reports preferences (persisted)
  showAiSummary: true,
  setShowAiSummary: (v) => set({ showAiSummary: v }),
  colorblindMode: false,
  setColorblindMode: (v) => set({ colorblindMode: v }),

  // #1 — grouping mode + cached payloads for instant toggle
  groupingMode: 'zones',
  setGroupingMode: (m) => set({ groupingMode: m }),
  userZoneAnalysisResult: null,
  setUserZoneAnalysisResult: (r) => set({ userZoneAnalysisResult: r }),
  clusterAnalysisResult: null,
  setClusterAnalysisResult: (r) => set({ clusterAnalysisResult: r }),
  recommendInFlight: null,
  setRecommendInFlight: (r) => set({ recommendInFlight: r }),
  singleZoneStrategy: null,
  setSingleZoneStrategy: (s) => set({ singleZoneStrategy: s }),
  multiZoneStrategy: null,
  setMultiZoneStrategy: (s) => set({ multiZoneStrategy: s }),
}), {
  name: 'scenerx-store',
  // localStorage now holds ONLY UI prefs and pre-pipeline state. The big
  // analysis blobs (zone_analysis_result / design_strategy_result / ai_report
  // / pipelineResult) live on the backend ProjectResponse and hydrate into
  // the store via `hydrateFromProject` on every project mount. This is what
  // fixes "switching projects nukes my AI report" and lets users open the
  // same project from another browser without losing work.
  partialize: (state) => ({
    // localStorage now ONLY holds project-agnostic UI prefs. Anything
    // project-scoped (Stage 1 / 2.5 / 3, AI report, selected indicators,
    // recommendation summary) lives on the backend ProjectResponse and is
    // hydrated via hydrateFromProject on every project mount. This means:
    //
    //   - currentProject is not persisted — it carries uploaded_images
    //     (potentially thousands) and would blow past the 5-10MB quota.
    //     React Query refetches it on every /projects/:id/* route.
    //   - visionMaskResults is not persisted — scales linearly with image
    //     count (~2KB per image), and batch flushes during analysis would
    //     cause O(n²) writes. VisionAnalysis.tsx rebuilds from
    //     project.uploaded_images[].mask_filepaths on mount.
    //   - Stage 1 / analysis blobs are not persisted — eliminates the
    //     "fresh tab leaks last session's recommendations into a different
    //     project" bug, and keeps storage small.
    visionStatistics: state.visionStatistics,
    hiddenChartIds: state.hiddenChartIds,
    showAiSummary: state.showAiSummary,
    colorblindMode: state.colorblindMode,
    // Layer 2 — persist the in-flight Stage 1 recommendation marker so a
    // hard refresh during the call resumes the "Running…" UI instead of
    // dropping back to the empty Get-Recommendations state.
    recommendInFlight: state.recommendInFlight,
  }),
}));

export default useAppStore;
