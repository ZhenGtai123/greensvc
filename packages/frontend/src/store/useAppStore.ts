import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Project, IndicatorRecommendation, IndicatorRelationship, RecommendationSummary, ZoneAnalysisResult, DesignStrategyResult, ProjectPipelineResult } from '../types';

export interface VisionMaskResult {
  imageId: string;
  maskPaths: Record<string, string>;
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

  // UI State
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()(persist((set) => ({
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

  // UI State
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}), {
  name: 'scenerx-store',
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
    zoneAnalysisResult: state.zoneAnalysisResult,
    designStrategyResult: state.designStrategyResult,
    pipelineResult: state.pipelineResult,
    aiReport: state.aiReport,
    aiReportMeta: state.aiReportMeta,
  }),
}));

export default useAppStore;
