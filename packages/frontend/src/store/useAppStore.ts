import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project, IndicatorRecommendation, IndicatorRelationship, RecommendationSummary, ZoneAnalysisResult, DesignStrategyResult, ProjectPipelineResult, ProjectPipelineStreamEvent } from '../types';
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

  clearPipelineResults: () => void;
  hydrateFromProject: (project: Project, forceClearMissing: boolean) => void;

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
  }),

  // Hydrate analysis artefacts from a freshly fetched Project. The backend
  // is the source of truth for these — this lets ProjectPipelineLayout
  // restore them on every project mount so reloads / project switches don't
  // lose the user's work. Pass `forceClearMissing` when switching projects:
  // the new project may legitimately have no results yet, and we must NOT
  // leak the previous project's blobs through.
  hydrateFromProject: (project: Project, forceClearMissing: boolean) => set((s) => {
    const next: Partial<AppState> = {};
    if (project.zone_analysis_result !== undefined || forceClearMissing) {
      next.zoneAnalysisResult = project.zone_analysis_result ?? null;
    } else if (s.zoneAnalysisResult === null && project.zone_analysis_result) {
      next.zoneAnalysisResult = project.zone_analysis_result;
    }
    if (project.design_strategy_result !== undefined || forceClearMissing) {
      next.designStrategyResult = project.design_strategy_result ?? null;
    }
    if (project.ai_report !== undefined || forceClearMissing) {
      next.aiReport = project.ai_report ?? null;
    }
    if (project.ai_report_meta !== undefined || forceClearMissing) {
      next.aiReportMeta = project.ai_report_meta ?? null;
    }
    return next;
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
      set((s) => ({
        pipelineResult: result,
        zoneAnalysisResult: result.zone_analysis ?? null,
        designStrategyResult: result.design_strategies ?? null,
        pipelineRun: { ...s.pipelineRun, isRunning: false },
      }));
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
}), {
  name: 'scenerx-store',
  // localStorage now holds ONLY UI prefs and pre-pipeline state. The big
  // analysis blobs (zone_analysis_result / design_strategy_result / ai_report
  // / pipelineResult) live on the backend ProjectResponse and hydrate into
  // the store via `hydrateFromProject` on every project mount. This is what
  // fixes "switching projects nukes my AI report" and lets users open the
  // same project from another browser without losing work.
  partialize: (state) => ({
    // currentProject is NOT persisted — it contains uploaded_images (can be 1000s)
    // which blows past localStorage's 5-10MB quota. It's re-fetched via React Query
    // in ProjectPipelineLayout on every /projects/:id/* route.
    // visionMaskResults is NOT persisted — it scales linearly with image count
    // (~2KB per image) and each batch-flush during analysis would re-serialize the
    // growing array to localStorage (O(n²) writes). VisionAnalysis.tsx rebuilds it
    // from project.uploaded_images[].mask_filepaths on mount if the store is empty.
    selectedIndicators: state.selectedIndicators,
    visionStatistics: state.visionStatistics,
    recommendations: state.recommendations,
    indicatorRelationships: state.indicatorRelationships,
    recommendationSummary: state.recommendationSummary,
    hiddenChartIds: state.hiddenChartIds,
    showAiSummary: state.showAiSummary,
    colorblindMode: state.colorblindMode,
  }),
}));

export default useAppStore;
