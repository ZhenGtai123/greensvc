import type { Project } from '../types';

export interface StageStatus {
  done: boolean;
  ready: boolean;
  /**
   * v4 Layer 2 — "out of date" state. True when this stage's output was
   * previously produced (we have evidence from siblings / image artefacts)
   * but the cached artefact is now missing because something upstream
   * changed and the backend cascading-invalidation wiped it.
   *
   * Distinct from `!done`:
   *   - `!done && !stale` → never run yet (gray)
   *   - `!done &&  stale` → was run, output wiped — re-run to refresh (amber)
   *   - ` done`           → up-to-date (green)
   *
   * Heuristic: a stage is stale when its required upstream is fully done
   * AND its own output is missing AND there is positive evidence (typically
   * persistent image masks) that the user reached this stage before. The
   * heuristic doesn't catch every wipe scenario, but it catches the common
   * ones — adding image, changing brief, changing selected indicators —
   * which are exactly the cases Layer 1 invalidates.
   */
  stale?: boolean;
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
  const totalImages = project.uploaded_images?.length ?? 0;
  const imagesWithMasks = project.uploaded_images?.filter(
    (img) => img.mask_filepaths && Object.keys(img.mask_filepaths).length > 0,
  ).length ?? 0;
  const hasMasks = imagesWithMasks > 0;
  // Some images uploaded after the last pipeline run won't have masks yet.
  // This is the cleanest signal for "Prepare is partially out of date":
  // the user added images post-pipeline; previous images still have masks
  // (so hasMasks=true), but new ones don't.
  const someImagesMissingMasks = hasImages && imagesWithMasks > 0 && imagesWithMasks < totalImages;

  const hasRecommendations = store.recommendations.length > 0;
  const hasZoneAnalysis = store.zoneAnalysisResult !== null;
  const hasAiReport = !!store.aiReport;

  // Step 1: Project — done when project has zones defined
  const projectStep: StageStatus = { done: hasZones, ready: true };

  // Step 2: Images — done when images uploaded and assigned to zones
  const images: StageStatus = { done: hasImages && hasAssigned, ready: hasZones };

  // Step 3: Prepare (Vision + Indicators) — done when masks exist AND
  // recommendations done. Stale fires in two scenarios:
  //
  //   (a) hasMasks && !hasRecommendations → Stage 1 was wiped (Layer 1
  //       cascade from a design_brief / dimensions change) but pipeline
  //       masks remain. User must re-run Get Recommendations.
  //
  //   (b) someImagesMissingMasks → user uploaded new images post-pipeline
  //       and the existing masks no longer cover the full image set.
  //       Pipeline needs a re-run to compute masks for the new images.
  //
  // Note: zone_analysis_result alone can be missing without Prepare being
  // stale (Stage 4 owns that). Prepare stale specifically tracks vision +
  // recommendation freshness.
  const prepareStale =
    (hasMasks && !hasRecommendations) || someImagesMissingMasks;
  const prepare: StageStatus = {
    done: hasMasks && hasRecommendations && !someImagesMissingMasks,
    ready: hasImages && hasAssigned,
    stale: prepareStale,
  };

  // Step 4: Analysis — done when zone analysis exists. Stale fires when
  // both Prepare has finished (masks + recommendations present) AND the
  // analysis result is missing. After Layer 1 invalidation, this is the
  // most common stale signal — almost any upstream edit (image add /
  // delete, image-zone reassign, GPS reparse, selected indicator change)
  // wipes zone_analysis_result while leaving masks and recommendations
  // intact.
  const analysisStale =
    hasMasks && hasRecommendations && !hasZoneAnalysis && !someImagesMissingMasks;
  const analysis: StageStatus = {
    done: hasZoneAnalysis,
    ready: hasMasks && hasRecommendations,
    stale: analysisStale,
  };

  // Step 5: Report — done once an AI report has been generated. Charts and
  // raw downloads are always available the moment Stage 2.5 finishes, so
  // "AI report exists" is the single user-meaningful signal that the
  // workflow is complete. Pipeline runs and Stage 3 retries clear ai_report
  // server-side, so this can never falsely show green for stale data.
  // We do NOT flag this stage as stale on missing report — the AI report
  // is always a manual user action (Generate AI Report button), so an
  // empty slot just means "not yet asked", not "stale".
  const report: StageStatus = { done: hasAiReport, ready: hasZoneAnalysis };

  return [projectStep, images, prepare, analysis, report];
}
