# GreenSVC Platform - TODO

## Current Status

Platform has two analysis paths that are currently **disconnected**:
- **Path A (Exploratory)**: Vision Analysis, Indicators, Calculators, Reports — individual tools
- **Path B (Pipeline)**: Project → Images → Zones → Pipeline (Stage 1→2→2.5→3)

Core data flow should be:
```
Raw Photo → Vision API (segmentation) → Mask Image → Calculator → Metric Value → Aggregation → Design Strategy
```

Calculators operate on **semantic segmentation mask images** (color-coded pixels), not raw photos.
The pipeline currently passes raw image paths to calculators — this produces garbage results.

---

## P0 - Critical (Pipeline Broken)

### [ ] 1. Vision → Mask Persistence
**Problem**: Vision API produces segmentation masks, but results are never saved back to the project.
`UploadedImage` model has no field for mask file path.

**Files**:
- `packages/backend/app/models/project.py` — Add `mask_filepath: Optional[str]` to `UploadedImage`
- `packages/backend/app/api/routes/vision.py` — `/analyze/path` should save mask and update project image
- `packages/backend/app/api/routes/projects.py` — New endpoint or extend existing to store mask path

**Steps**:
1. Add `mask_filepath` field to `UploadedImage` model
2. Create a pipeline step or endpoint that runs Vision API on project images
3. Save resulting mask images to disk (e.g., `uploads/{project_id}/{image_id}_mask.png`)
4. Store mask path in `UploadedImage.mask_filepath`

### [ ] 2. Pipeline Uses Mask Path Instead of Raw Image Path
**Problem**: `analysis.py:203` passes `img.filepath` (raw photo) to calculators that expect mask images.

**Files**:
- `packages/backend/app/api/routes/analysis.py` ~line 203

**Fix**: Change `calculator.calculate(ind_id, img.filepath)` to use `img.mask_filepath`.
Add validation: skip images without masks, or auto-run Vision API as Pipeline Stage 1.5.

### [ ] 3. Add Vision Processing Step to Project Pipeline
**Problem**: No automated way to run Vision API on all project images before calculation.

**Options**:
- A) Add "Stage 1.5: Vision Processing" to the pipeline that auto-runs segmentation
- B) Require users to manually run Vision Analysis first (via UI button on ProjectDetail)
- C) Both: UI button for on-demand + pipeline auto-runs if masks missing

**Files**:
- `packages/backend/app/api/routes/analysis.py` — Add vision step before Stage 2
- `packages/frontend/src/pages/ProjectDetail.tsx` — Optional: "Run Vision" batch button

---

## P1 - Important (Features Incomplete)

### [ ] 4. Connect Vision Analysis Results to Project
**Problem**: VisionAnalysis.tsx can analyze project images, but results exist only in UI state.
After page refresh, all results are lost.

**Files**:
- `packages/frontend/src/pages/VisionAnalysis.tsx` — After batch analysis, save masks back to project
- `packages/frontend/src/api/index.ts` — May need new API call to persist vision results

### [ ] 5. Connect Reports Page to Project Pipeline
**Problem**: Reports page runs calculations independently; results don't feed into or from the project pipeline.

**Files**:
- `packages/frontend/src/pages/Reports.tsx`
- Consider: Should Reports display pipeline results, or remain a standalone tool?

### [ ] 6. Auth Not Enforced
**Problem**: `auth.py` has full JWT implementation (register, login, `get_current_user`), but NO endpoint uses `Depends(get_current_user)`. All routes are public.

**Files**:
- `packages/backend/app/api/routes/auth.py` — Implementation exists
- All route files — Need to add auth dependency where appropriate

### [ ] 7. Celery Tasks — Verify Runtime
**Problem**: Task files exist (`vision_tasks.py`, `metrics_tasks.py`, `analysis_tasks.py`) but need runtime verification with Redis/Celery.

**Files**:
- `packages/backend/app/tasks/vision_tasks.py`
- `packages/backend/app/tasks/metrics_tasks.py`
- `packages/backend/app/tasks/analysis_tasks.py`

---

## P2 - Nice to Have (Optimization & Polish)

### [ ] 8. Four-Layer Support in Pipeline
**Problem**: Calculators and shared_layer support 4 layers (full, foreground, middleground, background),
but the pipeline only processes "full" layer. The Vision API can produce layered masks.

**Files**:
- `packages/backend/app/api/routes/analysis.py`
- `packages/backend/app/services/metrics_aggregator.py`

---

## Done

- [x] Zone Assignment UI in ProjectDetail.tsx (batch select + assign + unassign)
- [x] Calculator scripts present in `data/metrics_code/` (35 calculators)
- [x] Semantic configuration present in `data/Semantic_configuration.json`
- [x] `MetricsCalculator` loads semantic_colors and injects into calculator modules
- [x] Indicators → Analysis auto-sync (Analysis.tsx reads from store on mount)
- [x] Reports page uses store indicators (auto-select + recommended sort with star)
- [x] ProjectWizard batch zone assignment (new `PUT /batch-zone` endpoint, only sends changed images)
- [x] Route ordering: `batch-zone` moved above `{image_id}/zone` in projects.py
- [x] Route ordering: `/evidence/dimension/{id}` moved above `/evidence/{id}` in indicators.py
- [x] Pydantic validation: `List[dict]` → `List[ZoneAssignment]` in batch-zone endpoint
- [x] Null zone_id fix: omit param when null instead of sending string "null"
- [x] Analysis.tsx: useEffect sync runs only once (ref guard), won't override manual clear
- [x] Reports.tsx: useEffect auto-select runs only once (ref guard)
- [x] ProjectDetail.tsx: batch assign uses batch endpoint instead of N sequential calls
- [x] ProjectWizard.tsx: fixed stale closures in handleDrop, handleExistingImageDrop, removeZone, handleDeleteExistingImage (functional updaters)
- [x] Static file serving: mounted `/api/uploads` in main.py so uploaded images can be displayed
