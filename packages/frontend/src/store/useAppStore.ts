import { create } from 'zustand';
import type { Project, CalculatorInfo, IndicatorRecommendation, IndicatorRelationship, RecommendationSummary, SemanticClass, ZoneAnalysisResult, DesignStrategyResult, ProjectPipelineResult } from '../types';

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
  clearPipelineResults: () => void;

  // Calculators
  calculators: CalculatorInfo[];
  setCalculators: (calculators: CalculatorInfo[]) => void;

  // Semantic config
  semanticClasses: SemanticClass[];
  setSemanticClasses: (classes: SemanticClass[]) => void;

  // UI State
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Active tasks
  activeTasks: string[];
  addActiveTask: (taskId: string) => void;
  removeActiveTask: (taskId: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
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
  }),

  // Calculators
  calculators: [],
  setCalculators: (calculators) => set({ calculators }),

  // Semantic config
  semanticClasses: [],
  setSemanticClasses: (classes) => set({ semanticClasses: classes }),

  // UI State
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // Active tasks
  activeTasks: [],
  addActiveTask: (taskId) =>
    set((state) => ({
      activeTasks: [...state.activeTasks, taskId],
    })),
  removeActiveTask: (taskId) =>
    set((state) => ({
      activeTasks: state.activeTasks.filter((id) => id !== taskId),
    })),
}));

export default useAppStore;
