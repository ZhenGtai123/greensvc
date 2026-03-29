import type { Project } from '../types';

export interface StageStatus {
  done: boolean;
  ready: boolean;
}

/**
 * Single source of truth for pipeline stage completion status.
 * 4-step pipeline: Setup → Prepare → Analysis → Report
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
      { done: false, ready: true },   // Setup
      { done: false, ready: false },   // Prepare
      { done: false, ready: false },   // Analysis
      { done: false, ready: false },   // Report
    ];
  }

  const hasImages = (project.uploaded_images?.length ?? 0) > 0;
  const hasZones = (project.spatial_zones?.length ?? 0) > 0;
  const hasMasks = project.uploaded_images?.some(
    (img) => img.mask_filepaths && Object.keys(img.mask_filepaths).length > 0,
  ) ?? false;

  const hasRecommendations = store.recommendations.length > 0;
  const hasZoneAnalysis = store.zoneAnalysisResult !== null;

  // Step 1: Setup — done when project has images AND zones
  const setup: StageStatus = { done: hasImages && hasZones, ready: true };

  // Step 2: Prepare (Vision + Indicators) — done when masks exist AND recommendations done
  const prepare: StageStatus = {
    done: hasMasks && hasRecommendations,
    ready: hasImages && hasZones,
  };

  // Step 3: Analysis — done when zone analysis exists, ready when prepare done
  const analysis: StageStatus = { done: hasZoneAnalysis, ready: hasMasks && hasRecommendations };

  // Step 4: Report — never "done" (view-only), ready when analysis done
  const report: StageStatus = { done: false, ready: hasZoneAnalysis };

  return [setup, prepare, analysis, report];
}
