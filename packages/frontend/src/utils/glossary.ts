/**
 * Single source of truth for analysis-tab terminology. Each term has a one
 * line `short` definition (used in inline tooltips) and an optional `long`
 * definition (rendered in the Glossary side drawer).
 *
 * Add new entries by their canonical lowercase key. Components reference
 * them via <TermInfo term="z-score" />.
 */
export interface GlossaryEntry {
  /** Canonical display label (e.g. "z-score", "|z|"). */
  label: string;
  /** ≤ 60 char inline definition. */
  short: string;
  /** Optional richer definition shown in the Glossary drawer. */
  long?: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  'z-score': {
    label: 'z-score',
    short: 'How far a value is from the mean, in std-dev units.',
    long: 'A standardized score: (value − mean) / std-dev. Positive = above the population mean, negative = below. |z| ≥ 1.5 is large, ≥ 2 is unusual.',
  },
  '|z|': {
    label: '|z|',
    short: 'Absolute z-score — magnitude of deviation, ignoring sign.',
    long: 'Absolute value of z-score. Useful when you only care about how far a zone deviates, not the direction. "Mean |z|" averages across indicators to summarize a zone\'s overall distinctiveness.',
  },
  percentile: {
    label: 'percentile',
    short: 'Rank within a distribution, 0–100.',
    long: 'Where a value falls in a sorted distribution. 90th percentile means the value is higher than 90% of the comparison group. Used by radar charts.',
  },
  'cv%': {
    label: 'CV%',
    short: 'Coefficient of variation: std-dev / mean × 100%.',
    long: 'Coefficient of variation. A scale-free measure of spread: a CV of 25% means the std-dev is one-quarter of the mean. Higher = more variable relative to its average.',
  },
  fg: {
    label: 'FG',
    short: 'Foreground — pixels closest to the camera.',
    long: 'Foreground depth layer (FMB partitioning). Captures elements within roughly 5 m: ground, near vegetation, signage, pedestrians.',
  },
  mg: {
    label: 'MG',
    short: 'Middleground — mid-distance pixels.',
    long: 'Middleground depth layer. Captures the intermediate scene: building facades, mid-distance trees, crowd density.',
  },
  bg: {
    label: 'BG',
    short: 'Background — distant pixels.',
    long: 'Background depth layer. Captures the far scene: sky, distant buildings, horizon greenery.',
  },
  full: {
    label: 'Full',
    short: 'Whole-image value, no FMB split.',
    long: 'The indicator computed on the entire image, rather than on a single FG/MG/BG layer. Most stable layer for cross-zone comparison.',
  },
  archetype: {
    label: 'archetype',
    short: 'A discovered point cluster with a distinct profile.',
    long: 'In SVC clustering, an archetype is a group of GPS points whose indicator values move together. Each archetype gets a centroid + label, and points inherit their archetype id.',
  },
  'ward-linkage': {
    label: 'Ward linkage',
    short: 'Hierarchical clustering that minimises within-cluster variance.',
    long: 'A hierarchical agglomerative clustering criterion. At each step, merges the two clusters whose union increases total within-cluster variance the least. Tends to produce compact, similarly-sized groups.',
  },
  silhouette: {
    label: 'silhouette score',
    short: 'How well a point fits its cluster vs. neighbouring clusters (-1 to 1).',
    long: 'Per-point measure: (b − a) / max(a, b) where a is mean intra-cluster distance and b is mean distance to the nearest other cluster. Average over all points → cluster-quality summary; used to pick optimal K.',
  },
  shapiro: {
    label: 'Shapiro-Wilk',
    short: 'Statistical test for whether a sample is normally distributed.',
    long: "Shapiro-Wilk normality test. Null hypothesis: the sample comes from a normal distribution. p < 0.05 ⇒ reject normality; the platform then uses Spearman (rank) correlations instead of Pearson.",
  },
  kruskal: {
    label: 'Kruskal-Wallis',
    short: 'Non-parametric ANOVA — tests if zones have different medians.',
    long: 'Rank-based test for whether ≥ 3 groups (zones) come from the same distribution. p < 0.05 ⇒ at least one zone differs significantly. Robust to non-normal data.',
  },
};

/** Lookup helper that tolerates case + minor variants. */
export function lookupTerm(term: string): GlossaryEntry | null {
  const key = term.toLowerCase().trim();
  return GLOSSARY[key] ?? null;
}
