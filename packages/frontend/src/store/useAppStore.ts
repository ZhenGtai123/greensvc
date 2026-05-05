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
  designStrategyResult: DesignStrategyResult | null;
  setDesignStrategyResult: (r: DesignStrategyResult | null) => void;
  pipelineResult: ProjectPipelineResult | null;
  setPipelineResult: (r: ProjectPipelineResult | null) => void;

  // AI report
  aiReport: string | null;
  setAiReport: (r: string | null) => void;
  aiReportMeta: Record<string, unknown> | null;
  setAiReportMeta: (m: Record<string, unknown> | null) => void;
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
  setDesignStrategyResult: (r) => set({ designStrategyResult: r }),
  pipelineResult: null,
  setPipelineResult: (r) => set({ pipelineResult: r }),

  // AI report
  aiReport: null,
  setAiReport: (r) => set({ aiReport: r }),
  aiReportMeta: null,
  setAiReportMeta: (m) => set({ aiReportMeta: m }),
  invalidateAiReport: () => {
    const s = get();
    if (s.aiReport == null && s.aiReportMeta == null) return false;
    set({ aiReport: null, aiReportMeta: null });
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
    pipelineResult: null,
    aiReport: null,
    aiReportMeta: null,
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

    // Cluster grouping caches are also session-only — drop on project switch
    // so we don't show project A's archetypes on project B.
    const preservedGroupingMode = sameProject ? state.groupingMode : 'zones';
    const preservedUserZone = sameProject ? state.userZoneAnalysisResult : null;
    const preservedClusterAnalysis = sameProject ? state.clusterAnalysisResult : null;

    // The active zoneAnalysisResult might be the cluster-derived view (set
    // by handleRunClustering), which isn't persisted to the project payload.
    // When refetching the same project, keep whichever view the user is in.
    const inClusterView =
      sameProject && state.groupingMode === 'clusters' && !!state.clusterAnalysisResult;
    const nextZoneAnalysis = inClusterView
      ? state.clusterAnalysisResult
      : project.zone_analysis_result ?? null;

    // #21 — drop a stale AI report on hydration. The backend persists the
    // mode it was generated under in `ai_report_meta.grouping_mode`; if the
    // user is now viewing a different mode (e.g. switched zone -> cluster
    // and reloaded), the cached report describes the wrong units.
    const reportMeta = project.ai_report_meta ?? null;
    const reportMode = (reportMeta as { grouping_mode?: string } | null)?.grouping_mode ?? 'zones';
    const reportStale = reportMode !== preservedGroupingMode;

    return {
      recommendations: project.stage1_recommendations ?? [],
      indicatorRelationships: project.stage1_relationships ?? [],
      recommendationSummary: project.stage1_summary ?? null,
      selectedIndicators: project.selected_indicators ?? [],
      visionMaskResults: maskResults,
      zoneAnalysisResult: nextZoneAnalysis,
      designStrategyResult: project.design_strategy_result ?? null,
      pipelineResult: preservedPipelineResult,
      aiReport: reportStale ? null : project.ai_report ?? null,
      aiReportMeta: reportStale ? null : reportMeta,
      groupingMode: preservedGroupingMode,
      userZoneAnalysisResult: preservedUserZone,
      clusterAnalysisResult: preservedClusterAnalysis,
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
  }),
}));

export default useAppStore;
