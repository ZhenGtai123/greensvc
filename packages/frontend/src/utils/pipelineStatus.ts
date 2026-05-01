import type { Project } from '../types';

export interface StageStatus {
  done: boolean;
  ready: boolean;
}

/**
 * Single source of truth for pipeline stage completion status.
 * 5-step pipeline: Project → Images → Prepare → Analysis → Report
 */
export function getStageStatuses(
  project: Project | null,
  store: {
    recommendations: unknown[];
    zoneAnalysisResult: unknown | null;
    aiReport: string | null;
  },
): StageStatus[] {
  if (!project) {
    return [
      { done: false, ready: true },   // Project
      { done: false, ready: false },   // Images
      { done: false, ready: false },   // Prepare
      { done: false, ready: false },   // Analysis
      { done: false, ready: false },   // Report
    ];
  }

  const hasZones = (project.spatial_zones?.length ?? 0) > 0;
  const hasImages = (project.uploaded_images?.length ?? 0) > 0;
  const hasAssigned = project.uploaded_images?.some(img => img.zone_id) ?? false;
  const hasMasks = project.uploaded_images?.some(
    (img) => img.mask_filepaths && Object.keys(img.mask_filepaths).length > 0,
  ) ?? false;

  const hasRecommendations = store.recommendations.length > 0;
  const hasZoneAnalysis = store.zoneAnalysisResult !== null;
  const hasAiReport = !!store.aiReport;

  // Step 1: Project — done when project has zones defined
  const projectStep: StageStatus = { done: hasZones, ready: true };

  // Step 2: Images — done when images uploaded and assigned to zones
  const images: StageStatus = { done: hasImages && hasAssigned, ready: hasZones };

  // Step 3: Prepare (Vision + Indicators) — done when masks exist AND recommendations done
  const prepare: StageStatus = {
    done: hasMasks && hasRecommendations,
    ready: hasImages && hasAssigned,
  };

  // Step 4: Analysis — done when zone analysis exists, ready when prepare done
  const analysis: StageStatus = { done: hasZoneAnalysis, ready: hasMasks && hasRecommendations };

  // Step 5: Report — done once an AI report has been generated. Charts and
  // raw downloads are always available the moment Stage 2.5 finishes, so
  // "AI report exists" is the single user-meaningful signal that the
  // workflow is complete. Pipeline runs and Stage 3 retries clear ai_report
  // server-side, so this can never falsely show green for stale data.
  const report: StageStatus = { done: hasAiReport, ready: hasZoneAnalysis };

  return [projectStep, images, prepare, analysis, report];
}
