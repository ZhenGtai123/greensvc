import { create } from 'zustand';
import type { Project, CalculatorInfo, IndicatorRecommendation, SemanticClass } from '../types';

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
