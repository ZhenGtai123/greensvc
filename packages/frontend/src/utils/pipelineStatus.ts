import type { Project } from '../types';

export interface StageStatus {
  done: boolean;
  ready: boolean;
}

/**
 * Single source of truth for pipeline stage completion status.
 * Used by both PipelineCard (ProjectDetail) and StepIndicator (pipeline pages).
 */
export function getStageStatuses(
  project: Project | null,
  store: {
    recommendations: unknown[];
    zoneAnalysisResult: unknown | null;
  },
): StageStatus[] {
  if (!project) {
    return [
      { done: false, ready: false },
      { done: false, ready: false },
      { done: false, ready: false },
      { done: false, ready: false },
    ];
  }

  const hasImages = (project.uploaded_images?.length ?? 0) > 0;
  const hasZones = (project.spatial_zones?.length ?? 0) > 0;
  const hasMasks = project.uploaded_images?.some(
    (img) => img.mask_filepaths && Object.keys(img.mask_filepaths).length > 0,
  ) ?? false;

  const hasRecommendations = store.recommendations.length > 0;
  const hasZoneAnalysis = store.zoneAnalysisResult !== null;

  // Vision: done when masks exist, ready when project has images AND zones
  const vision: StageStatus = { done: hasMasks, ready: hasImages && hasZones };

  // Indicators: done when recommendations produced, always ready (can use KB without vision)
  const indicators: StageStatus = { done: hasRecommendations, ready: true };

  // Analysis: done when zone analysis exists, ready when vision + indicators done
  const analysis: StageStatus = { done: hasZoneAnalysis, ready: hasMasks && hasRecommendations };

  // Reports: never "done" (view-only summary), ready when analysis done
  const reports: StageStatus = { done: false, ready: hasZoneAnalysis };

  return [vision, indicators, analysis, reports];
}
