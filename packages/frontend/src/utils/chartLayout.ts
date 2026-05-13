/**
 * v4 / Module 7 — Shared chart layout helpers.
 *
 * Centralises the math used by every chart in AnalysisCharts.tsx so we don't
 * scatter "magic" margin / cellSize constants across components.
 *
 *   computeChartMargins   — top/bottom/left/right padding from rotated label
 *                           length + legend block. Replaces the case-by-case
 *                           constants in CorrelationHeatmap / PriorityHeatmap.
 *
 *   robustGpsBbox         — IQR×3 outlier-filtered bounding box for GPS
 *                           scatters. Fixes the "scatter clustered in a corner
 *                           because of a stray (0, 0) point" symptom shown in
 *                           the user's Spatial Z-Deviation Map screenshot.
 *
 *   useContainerWidth     — ResizeObserver-backed width hook used by
 *                           ResponsiveSmallMultiples to pick 1×4 / 2×2 / 4×1
 *                           depending on available space.
 */

import { useEffect, useState, type RefObject } from 'react';

// ---------------------------------------------------------------------------
// Margins
// ---------------------------------------------------------------------------

/** Approximate per-character width relative to font-size. Tuned for sans-serif
 * UI fonts (Helvetica / Arial / system-ui). Aligns with the existing
 * CHAR_WIDTH_RATIO constant in AnalysisCharts.tsx. */
const CHAR_WIDTH_RATIO = 0.55;

export interface ChartMarginInput {
  /** Labels rendered along the top axis (column headers / x-axis). */
  topLabels: string[];
  /** Rotation angle in degrees, e.g. -45 or -90. 0 means horizontal. */
  topRotationDeg: number;
  /** Labels rendered along the left axis (row headers / y-axis). */
  leftLabels: string[];
  /** Optional legend block sitting below the chart. */
  legend?: { width: number; height: number };
  /** Font size in px used for the labels. */
  fontSize: number;
  /** Per-character width ratio override (defaults to 0.55 for sans-serif). */
  charWidthRatio?: number;
}

export interface ChartMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Compute non-clipping margins for a heatmap / matrix-style chart.
 *
 * Top:    derived from the longest top label projected onto the vertical axis
 *         given the rotation angle, plus 10px breathing room.
 * Left:   longest left-label width plus 14px gap.
 * Bottom: legend.height + 16px gap when a legend is supplied; 10px otherwise.
 * Right:  fixed 16px (matrix charts rarely need much room on the right).
 */
export function computeChartMargins(opts: ChartMarginInput): ChartMargins {
  const ratio = opts.charWidthRatio ?? CHAR_WIDTH_RATIO;
  const cw = opts.fontSize * ratio;

  const longestTop = opts.topLabels.reduce((m, l) => Math.max(m, l.length), 0);
  const longestLeft = opts.leftLabels.reduce((m, l) => Math.max(m, l.length), 0);

  const rotationRad = Math.abs(opts.topRotationDeg) * (Math.PI / 180);
  // Vertical projection of a rotated horizontal label = label-width × sin(angle)
  // For 0° this collapses to fontSize itself (one row of text).
  const projected = longestTop * cw * Math.sin(rotationRad);
  const top = Math.max(opts.fontSize + 6, Math.ceil(projected) + 10);

  const left = Math.max(opts.fontSize, Math.ceil(longestLeft * cw)) + 14;

  const legendBlock = opts.legend ? opts.legend.height + 16 : 10;
  const bottom = legendBlock;

  return { top, bottom, left, right: 16 };
}

// ---------------------------------------------------------------------------
// Robust GPS bounding box
// ---------------------------------------------------------------------------

export interface GpsPoint {
  lat: number;
  lng: number;
}

export interface RobustBbox<T extends GpsPoint = GpsPoint> {
  /** Inlier points within IQR×3 of the median. */
  inliers: T[];
  /** Outlier points (still rendered, but as outline circles to mark them). */
  outliers: T[];
  /** Bounding box for the inliers, with 5% padding. Can be passed directly
   *  to `toX`/`toY` projection functions. */
  bbox: { latMin: number; latMax: number; lngMin: number; lngMax: number };
  /** Approximate horizontal extent in meters at the bbox's center latitude.
   *  Useful for a "scale bar" caption. */
  horizontalMeters: number;
  /** Approximate vertical extent in meters. */
  verticalMeters: number;
}

/**
 * Filter outliers via IQR×3 then compute a padded bounding box.
 *
 * Why this exists: the original ValueSpatialMap / CrossIndicatorSpatialMaps
 * used Math.min/max across all points, so a single (0, 0) initialization
 * value or a GPS drift point would inflate the bbox and crush the real
 * cluster into a corner. See Module 7.3.2 for the failure mode.
 *
 * Behaviour:
 *   - With < 4 points: return all as inliers (IQR is unreliable below 4).
 *   - With ≥ 4 points: drop anything outside [Q1 − 3·IQR, Q3 + 3·IQR] on
 *     either lat or lng axis. Drift / sentinels are typically several IQRs
 *     out, so this catches them without harming legitimate clusters.
 *   - bbox is padded by max(5% of range, 0.0005°) so a 50m square still
 *     gets reasonable horizontal span on the SVG.
 */
export function robustGpsBbox<T extends GpsPoint>(points: T[]): RobustBbox<T> {
  if (points.length === 0) {
    const fallback = { latMin: 0, latMax: 0, lngMin: 0, lngMax: 0 };
    return { inliers: [], outliers: [], bbox: fallback, horizontalMeters: 0, verticalMeters: 0 };
  }

  if (points.length < 4) {
    return {
      inliers: points,
      outliers: [],
      bbox: bboxWithPadding(points),
      ...metersFor(bboxWithPadding(points)),
    };
  }

  const iqrBounds = (vals: number[]) => {
    const sorted = [...vals].sort((a, b) => a - b);
    const q = (p: number) => {
      const idx = p * (sorted.length - 1);
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      return lo === hi ? sorted[lo] : sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
    };
    const q1 = q(0.25);
    const q3 = q(0.75);
    const iqr = q3 - q1;
    return { lo: q1 - 3 * iqr, hi: q3 + 3 * iqr };
  };

  const latBounds = iqrBounds(points.map((p) => p.lat));
  const lngBounds = iqrBounds(points.map((p) => p.lng));

  const inliers: T[] = [];
  const outliers: T[] = [];
  for (const p of points) {
    const isInlier =
      p.lat >= latBounds.lo && p.lat <= latBounds.hi &&
      p.lng >= lngBounds.lo && p.lng <= lngBounds.hi;
    (isInlier ? inliers : outliers).push(p);
  }

  // If everything got flagged as outlier (all-equal degenerate), fall back to
  // using all points so we still draw something.
  const targetForBbox = inliers.length >= 1 ? inliers : points;
  const bbox = bboxWithPadding(targetForBbox);
  const meters = metersFor(bbox);

  return { inliers, outliers, bbox, ...meters };
}

function bboxWithPadding<T extends GpsPoint>(points: T[]): RobustBbox['bbox'] {
  if (points.length === 0) return { latMin: 0, latMax: 0, lngMin: 0, lngMax: 0 };
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const latMin = Math.min(...lats);
  const latMax = Math.max(...lats);
  const lngMin = Math.min(...lngs);
  const lngMax = Math.max(...lngs);

  const latRange = latMax - latMin;
  const lngRange = lngMax - lngMin;
  // 5% padding, but with a 0.0005° (~50 m) floor so very small clusters still
  // get visible span on screen.
  const latPad = Math.max(latRange * 0.05, 0.0005);
  const lngPad = Math.max(lngRange * 0.05, 0.0005);

  return {
    latMin: latMin - latPad,
    latMax: latMax + latPad,
    lngMin: lngMin - lngPad,
    lngMax: lngMax + lngPad,
  };
}

function metersFor(bbox: RobustBbox['bbox']): { horizontalMeters: number; verticalMeters: number } {
  const lat0 = (bbox.latMin + bbox.latMax) / 2;
  const verticalMeters = (bbox.latMax - bbox.latMin) * 111320;
  const horizontalMeters = (bbox.lngMax - bbox.lngMin) * 111320 * Math.cos(lat0 * (Math.PI / 180));
  return {
    horizontalMeters: Math.round(horizontalMeters),
    verticalMeters: Math.round(verticalMeters),
  };
}

// ---------------------------------------------------------------------------
// Container-width hook
// ---------------------------------------------------------------------------

/**
 * Watch a DOM element's width with ResizeObserver. Returns 0 until the
 * element is measured, so callers should treat 0 as "not yet known" and
 * fall back to a reasonable default until the first observation lands.
 */
export function useContainerWidth<T extends HTMLElement = HTMLElement>(ref: RefObject<T | null>): number {
  const [width, setWidth] = useState<number>(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') {
      setWidth(el.getBoundingClientRect().width);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}
