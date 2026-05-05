/**
 * #7-B — Whole-page export bundle.
 *
 * Builds a ZIP containing every visible chart's SVG + CSV (when tabular data
 * is available), the rendered AI report markdown, and a metadata.json
 * describing the project + grouping mode the bundle was captured under.
 *
 * Implemented entirely client-side via JSZip — no backend kaleido /
 * puppeteer dependency. Charts are captured from the live DOM, so callers
 * must ensure all chart cards are mounted before invoking this (Reports.tsx
 * passes forceMount={true} to every ChartHost so this is automatic post-#2).
 */

import JSZip from 'jszip';

import type { ExportColumn } from './exportChart';

export interface BundleChartArtifact {
  /** Stable chart id (used as filename stem). */
  chartId: string;
  /** Human-readable title — written into metadata.json. */
  title: string;
  /** DOM node of the rendered chart card; first <svg> inside it is captured. */
  node: HTMLElement | null;
  /** Optional tabular data — when present, a CSV sibling is added. */
  rows?: Record<string, unknown>[];
  columns?: ExportColumn[];
}

export interface BundleOptions {
  charts: BundleChartArtifact[];
  /** Project slug — drives the ZIP filename and metadata. */
  projectSlug: string;
  /** Project name (human-readable) — written into metadata.json. */
  projectName?: string | null;
  /** Active grouping mode (zones | clusters). Tagged into the filename so
   * zone-mode and cluster-mode bundles never overwrite each other. */
  groupingMode: 'zones' | 'clusters';
  /** Optional rendered AI report markdown — written as report.md. */
  aiReport?: string | null;
  /** Optional structured metadata about the AI report (model, word count). */
  aiReportMeta?: Record<string, unknown> | null;
  /** Extra metadata fields merged into metadata.json. */
  extraMetadata?: Record<string, unknown>;
}

function sanitizeSlug(input: string | null | undefined, fallback: string): string {
  if (!input) return fallback;
  return input.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '-').slice(0, 60) || fallback;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '-' +
    pad(d.getHours()) +
    pad(d.getMinutes())
  );
}

function escapeCSVCell(v: unknown): string {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCSV(rows: Record<string, unknown>[], columns?: ExportColumn[]): string {
  const cols: ExportColumn[] = columns && columns.length > 0
    ? columns
    : (rows.length > 0 ? Object.keys(rows[0]).map((k) => ({ key: k, label: k })) : []);
  if (cols.length === 0) return '';
  const header = cols.map((c) => escapeCSVCell(c.label)).join(',');
  const body = rows
    .map((row) => cols.map((c) => escapeCSVCell(row[c.key])).join(','))
    .join('\r\n');
  // U+FEFF BOM for Excel-on-Windows UTF-8 detection.
  return `\uFEFF${header}\r\n${body}\r\n`;
}

function captureSVGString(node: HTMLElement | null): string | null {
  if (!node) return null;
  const svgs = Array.from(node.querySelectorAll('svg'));
  const svg = svgs.find((s) => s.getBoundingClientRect().width > 0) ?? svgs[0];
  if (!svg) return null;
  const cloned = svg.cloneNode(true) as SVGSVGElement;
  cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  cloned.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  const rect = svg.getBoundingClientRect();
  if (!cloned.getAttribute('width')) cloned.setAttribute('width', String(Math.ceil(rect.width)));
  if (!cloned.getAttribute('height')) cloned.setAttribute('height', String(Math.ceil(rect.height)));
  if (!cloned.getAttribute('viewBox')) {
    cloned.setAttribute('viewBox', `0 0 ${Math.ceil(rect.width)} ${Math.ceil(rect.height)}`);
  }
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', '#ffffff');
  cloned.insertBefore(bg, cloned.firstChild);
  const xml = new XMLSerializer().serializeToString(cloned);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
}

/** Build and trigger download of the bundle ZIP. Returns the count of
 * artifacts that ended up inside the archive (charts that lack both an SVG
 * and tabular data are skipped). */
export async function exportBundle(opts: BundleOptions): Promise<{
  filename: string;
  charts: number;
  csvs: number;
}> {
  const zip = new JSZip();
  const slug = sanitizeSlug(opts.projectSlug, 'project');
  const ts = timestamp();
  const folderName = `${slug}_${opts.groupingMode}_${ts}`;
  const root = zip.folder(folderName) ?? zip;
  const charts = root.folder('charts') ?? root;
  const data = root.folder('data') ?? root;

  let chartCount = 0;
  let csvCount = 0;
  const manifest: {
    chart_id: string;
    title: string;
    files: string[];
  }[] = [];

  for (const c of opts.charts) {
    const safeId = sanitizeSlug(c.chartId, 'chart');
    const files: string[] = [];

    const svg = captureSVGString(c.node);
    if (svg) {
      charts.file(`${safeId}.svg`, svg);
      files.push(`charts/${safeId}.svg`);
    }

    if (c.rows && c.rows.length > 0) {
      const csv = rowsToCSV(c.rows, c.columns);
      if (csv) {
        data.file(`${safeId}.csv`, csv);
        files.push(`data/${safeId}.csv`);
        csvCount += 1;
      }
    }

    if (files.length > 0) {
      chartCount += 1;
      manifest.push({ chart_id: c.chartId, title: c.title, files });
    }
  }

  if (opts.aiReport) {
    root.file('report.md', opts.aiReport);
  }

  const metadata = {
    project_slug: slug,
    project_name: opts.projectName ?? null,
    grouping_mode: opts.groupingMode,
    generated_at: new Date().toISOString(),
    ai_report_present: !!opts.aiReport,
    ai_report_meta: opts.aiReportMeta ?? null,
    chart_count: chartCount,
    csv_count: csvCount,
    charts: manifest,
    ...(opts.extraMetadata ?? {}),
  };
  root.file('metadata.json', JSON.stringify(metadata, null, 2));

  const readme =
    `# SceneRx export bundle\n\n` +
    `- Project: ${opts.projectName ?? slug}\n` +
    `- Grouping mode: ${opts.groupingMode}\n` +
    `- Generated: ${metadata.generated_at}\n` +
    `- ${chartCount} chart(s), ${csvCount} CSV(s)\n\n` +
    `## Layout\n\n` +
    `\`\`\`\n${folderName}/\n├── charts/    # SVG figures (vector, white background)\n` +
    `├── data/      # CSV tables matching each chart\n` +
    `├── report.md  # AI-generated report (only if present)\n` +
    `└── metadata.json\n\`\`\`\n\n` +
    `## Notes\n\n` +
    `- SVGs include xmlns + a white background <rect> so they import cleanly\n` +
    `  into Illustrator / Inkscape / LaTeX without a transparent backdrop.\n` +
    `- CSVs use UTF-8 with BOM so Excel on Windows opens non-ASCII labels\n` +
    `  without mojibake.\n` +
    `- File names are stable: regenerating with the same chart_id and\n` +
    `  grouping_mode produces predictable paths for relative references.\n`;
  root.file('README.md', readme);

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = `${folderName}.zip`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  return { filename, charts: chartCount, csvs: csvCount };
}
