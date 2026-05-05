import { useMemo } from 'react';
import { Box, Text, SimpleGrid, HStack } from '@chakra-ui/react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
  ErrorBar,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts';
import type { EnrichedZoneStat, ZoneDiagnostic, ArchetypeProfile, UploadedImage, ImageRecord, GlobalIndicatorStats, DataQualityRow, IndicatorDefinitionInput } from '../types';
import { divergingColor, directionalColor, magnitudeColor } from '../utils/palette';

// Shared color palette for zones
const ZONE_COLORS = [
  '#3182CE', '#38A169', '#D69E2E', '#E53E3E', '#805AD5',
  '#DD6B20', '#319795', '#D53F8C', '#2B6CB0', '#276749',
];

function getZoneColor(index: number): string {
  return ZONE_COLORS[index % ZONE_COLORS.length];
}

// v6.0: color by mean_abs_z deviation level (purely descriptive)
function deviationBarColor(meanAbsZ: number): string {
  if (meanAbsZ >= 1.5) return '#E53E3E';
  if (meanAbsZ >= 1.0) return '#DD6B20';
  if (meanAbsZ >= 0.5) return '#D69E2E';
  return '#38A169';
}

// ─── Radar Profile Chart ────────────────────────────────────────────────────

interface RadarProfileChartProps {
  radarProfiles: Record<string, Record<string, number>>;
}

export function RadarProfileChart({ radarProfiles }: RadarProfileChartProps) {
  const { data, zones } = useMemo(() => {
    const zoneNames = Object.keys(radarProfiles);
    const allIndicators = Array.from(
      new Set(zoneNames.flatMap(z => Object.keys(radarProfiles[z]))),
    ).sort();

    const chartData = allIndicators.map(ind => {
      const row: Record<string, string | number> = { indicator: ind };
      for (const zone of zoneNames) {
        row[zone] = radarProfiles[zone]?.[ind] ?? 0;
      }
      return row;
    });

    return { data: chartData, zones: zoneNames };
  }, [radarProfiles]);

  if (zones.length === 0 || data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={400}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid />
        <PolarAngleAxis
          dataKey="indicator"
          tick={{ fontSize: 9 }}
          tickLine={false}
          tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 10) + '…' : v}
        />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
        {zones.map((zone, i) => (
          <Radar
            key={zone}
            name={zone}
            dataKey={zone}
            stroke={getZoneColor(i)}
            fill={getZoneColor(i)}
            fillOpacity={0.15}
          />
        ))}
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Tooltip />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ─── Radar Profile By Layer (matches notebook Fig 4) ──────────────────────
// Shows one small radar per zone with 4 overlaid polygons (full/FG/MG/BG).

const RBL_LAYER_ORDER = ['full', 'foreground', 'middleground', 'background'];
const RBL_LAYER_LABELS: Record<string, string> = {
  full: 'Full',
  foreground: 'FG',
  middleground: 'MG',
  background: 'BG',
};
const RBL_LAYER_COLORS: Record<string, string> = {
  full: '#3498db',
  foreground: '#e74c3c',
  middleground: '#2ecc71',
  background: '#9b59b6',
};

interface RadarProfileByLayerProps {
  radarProfilesByLayer: Record<string, Record<string, Record<string, number>>>;
}

export function RadarProfileByLayer({ radarProfilesByLayer }: RadarProfileByLayerProps) {
  const { zones, perZoneData } = useMemo(() => {
    // Union of zones across all layers
    const zoneSet = new Set<string>();
    const indSet = new Set<string>();
    for (const layer of Object.keys(radarProfilesByLayer)) {
      const zd = radarProfilesByLayer[layer];
      for (const zone of Object.keys(zd)) {
        zoneSet.add(zone);
        for (const ind of Object.keys(zd[zone])) indSet.add(ind);
      }
    }
    const zoneList = Array.from(zoneSet).sort();
    const indList = Array.from(indSet).sort();

    // Per-zone chart rows: [{ indicator, full, foreground, middleground, background }, ...]
    const data: Record<string, { indicator: string; [layer: string]: string | number }[]> = {};
    for (const zone of zoneList) {
      data[zone] = indList.map(ind => {
        const row: { indicator: string; [layer: string]: string | number } = { indicator: ind };
        for (const layer of RBL_LAYER_ORDER) {
          const v = radarProfilesByLayer[layer]?.[zone]?.[ind];
          row[layer] = v ?? 0;
        }
        return row;
      });
    }
    return { zones: zoneList, perZoneData: data };
  }, [radarProfilesByLayer]);

  if (zones.length === 0) return null;

  return (
    <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
      {zones.map(zone => (
        <Box key={zone}>
          <Text fontSize="xs" fontWeight="bold" mb={1} textAlign="center" noOfLines={1}>
            {zone}
          </Text>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={perZoneData[zone]} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid />
              <PolarAngleAxis
                dataKey="indicator"
                tick={{ fontSize: 9 }}
                tickLine={false}
                tickFormatter={(v: string) => (v.length > 8 ? v.slice(0, 8) + '…' : v)}
              />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 8 }} />
              {RBL_LAYER_ORDER.map(layer => (
                <Radar
                  key={layer}
                  name={RBL_LAYER_LABELS[layer]}
                  dataKey={layer}
                  stroke={RBL_LAYER_COLORS[layer]}
                  fill={RBL_LAYER_COLORS[layer]}
                  fillOpacity={layer === 'full' ? 0.15 : 0}
                  strokeWidth={layer === 'full' ? 2 : 1.5}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        </Box>
      ))}
    </SimpleGrid>
  );
}

// ─── Zone Deviation Chart (v6.0 descriptive) ──────────────────────────────

interface ZonePriorityChartProps {
  diagnostics: ZoneDiagnostic[];
}

export function ZonePriorityChart({ diagnostics }: ZonePriorityChartProps) {
  const data = useMemo(() => {
    return [...diagnostics]
      .sort((a, b) => b.mean_abs_z - a.mean_abs_z)
      .map(d => ({
        zone: d.zone_name,
        mean_abs_z: Number(d.mean_abs_z?.toFixed(2) ?? 0),
        point_count: d.point_count,
      }));
  }, [diagnostics]);

  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={Math.max(250, data.length * 50)}>
      <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="zone"
          tick={{ fontSize: 11 }}
          width={120}
        />
        <Tooltip
          formatter={(value, name) => [
            (typeof value === 'number' ? value : 0) as number,
            name === 'mean_abs_z' ? 'Mean |z|' : 'Points',
          ]}
        />
        <Bar dataKey="mean_abs_z" name="Mean |z|" barSize={20}>
          {data.map((entry, i) => (
            <Cell key={i} fill={deviationBarColor(entry.mean_abs_z)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Correlation Heatmap (SVG) ──────────────────────────────────────────────

interface CorrelationHeatmapProps {
  corr: Record<string, Record<string, number>>;
  pval?: Record<string, Record<string, number>>;
  indicators: string[];
  /** 5.10.8 — switch to Cividis when set, default red-blue otherwise. */
  colorblindMode?: boolean;
}

function corrColor(val: number, colorblindMode = false): string {
  if (colorblindMode) {
    return divergingColor(val, true);
  }
  const intensity = Math.min(Math.abs(val), 1);
  const alpha = 0.15 + intensity * 0.85;
  if (val > 0) return `rgba(49, 130, 206, ${alpha})`;   // blue
  if (val < 0) return `rgba(229, 62, 62, ${alpha})`;    // red
  return 'rgba(160, 174, 192, 0.2)';                     // gray
}

function significanceStars(p: number | undefined): string {
  if (p === undefined || p === null) return '';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

// Margin helpers shared by both heatmaps. SVG <text> width is browser-dependent
// at runtime, so we approximate from char count: at fontSize px, a regular
// system font averages ~0.6 px per character. The rotated label's vertical
// projection is `length * sin(angle)`; we add padding for the diagonal stub
// that hangs below the rotation pivot and a top breathing gap.
const ROTATION_DEG = 45;
const ROTATION_RAD = (ROTATION_DEG * Math.PI) / 180;
const CHAR_WIDTH_RATIO = 0.6;

function rotatedLabelTopMargin(maxLabelChars: number, fontSize: number): number {
  const labelPx = maxLabelChars * fontSize * CHAR_WIDTH_RATIO;
  // sin(45°) ≈ 0.707 — vertical projection after rotating around the pivot.
  // +12 baseline pad keeps the longest descender clear of the cells.
  return Math.ceil(labelPx * Math.sin(ROTATION_RAD)) + 12;
}

export function CorrelationHeatmap({ corr, pval, indicators, colorblindMode }: CorrelationHeatmapProps) {
  const n = indicators.length;
  const cellSize = Math.max(36, Math.min(48, 400 / Math.max(n, 1)));
  const colLabelFontSize = 10;
  const rowLabelFontSize = 10;
  const colLabelMaxChars = 10; // truncation threshold below
  const rowLabelMaxChars = 10;
  const labelHeight = rotatedLabelTopMargin(colLabelMaxChars, colLabelFontSize);
  // Left margin: longest row label (un-rotated) + breathing gap
  const labelWidth = Math.ceil(rowLabelMaxChars * rowLabelFontSize * CHAR_WIDTH_RATIO) + 14;
  // Bottom legend block (rect 12px high + 8px above + 8px below the cells)
  const legendHeight = 12;
  const legendGap = 8;
  const legendBottomPad = 8;

  if (n === 0) return null;

  const svgWidth = labelWidth + n * cellSize;
  const svgHeight = labelHeight + n * cellSize + legendGap + legendHeight + legendBottomPad;
  const legendY = labelHeight + n * cellSize + legendGap;

  return (
    <Box overflowX="auto">
      <svg width={svgWidth} height={svgHeight} style={{ fontFamily: 'system-ui, sans-serif' }}>
        {/* Column labels (top) */}
        {indicators.map((ind, col) => (
          <text
            key={`col-${ind}`}
            x={labelWidth + col * cellSize + cellSize / 2}
            y={labelHeight - 6}
            textAnchor="end"
            fontSize={colLabelFontSize}
            transform={`rotate(-45, ${labelWidth + col * cellSize + cellSize / 2}, ${labelHeight - 6})`}
          >
            {ind.length > colLabelMaxChars ? ind.slice(0, colLabelMaxChars) + '…' : ind}
          </text>
        ))}

        {/* Row labels (left) + cells */}
        {indicators.map((row, ri) => (
          <g key={`row-${row}`}>
            <text
              x={labelWidth - 6}
              y={labelHeight + ri * cellSize + cellSize / 2 + 4}
              textAnchor="end"
              fontSize={rowLabelFontSize}
            >
              {row.length > rowLabelMaxChars ? row.slice(0, rowLabelMaxChars) + '…' : row}
            </text>
            {indicators.map((col, ci) => {
              const val = corr[row]?.[col];
              const p = pval?.[row]?.[col];
              const stars = significanceStars(p);
              return (
                <g key={`${row}-${col}`}>
                  <rect
                    x={labelWidth + ci * cellSize}
                    y={labelHeight + ri * cellSize}
                    width={cellSize - 2}
                    height={cellSize - 2}
                    rx={3}
                    fill={val != null ? corrColor(val, colorblindMode) : '#EDF2F7'}
                    stroke="#E2E8F0"
                    strokeWidth={0.5}
                  >
                    <title>{`${row} × ${col}: ${val != null ? val.toFixed(3) : '—'}${stars ? ` (p${stars})` : ''}`}</title>
                  </rect>
                  <text
                    x={labelWidth + ci * cellSize + (cellSize - 2) / 2}
                    y={labelHeight + ri * cellSize + (cellSize - 2) / 2 + 4}
                    textAnchor="middle"
                    fontSize={9}
                    fill={val != null && Math.abs(val) > 0.6 ? '#fff' : '#2D3748'}
                    pointerEvents="none"
                  >
                    {val != null ? val.toFixed(2) : '—'}
                  </text>
                  {stars && (
                    <text
                      x={labelWidth + ci * cellSize + (cellSize - 2) / 2}
                      y={labelHeight + ri * cellSize + (cellSize - 2) / 2 + 14}
                      textAnchor="middle"
                      fontSize={8}
                      fill={val != null && Math.abs(val) > 0.6 ? '#fff' : '#718096'}
                      pointerEvents="none"
                    >
                      {stars}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}

        {/* Color legend (positioned below the last row with a fixed 8px gap) */}
        <g transform={`translate(${labelWidth}, ${legendY})`}>
          <rect width={12} height={12} fill={corrColor(-1, colorblindMode)} rx={2} />
          <text x={16} y={10} fontSize={9} fill="#4A5568">-1</text>
          <rect x={40} width={12} height={12} fill={corrColor(0, colorblindMode)} rx={2} />
          <text x={56} y={10} fontSize={9} fill="#4A5568">0</text>
          <rect x={72} width={12} height={12} fill={corrColor(1, colorblindMode)} rx={2} />
          <text x={88} y={10} fontSize={9} fill="#4A5568">+1</text>
        </g>
      </svg>
    </Box>
  );
}

// ─── Z-Score Heatmap (Zone × Indicator) — v6.0 descriptive ─────────────────

function zScoreCellColor(z: number, colorblindMode = false): string {
  if (colorblindMode) {
    // Map z to [-1, 1] (clip at ±2 for legibility), then run through Cividis.
    const t = Math.max(-1, Math.min(1, z / 2));
    return divergingColor(t, true);
  }
  // coolwarm-style: neutral center, blue for negative, red for positive
  const absZ = Math.abs(z);
  if (absZ < 0.25) return '#E2E8F0';     // near zero = gray
  if (z > 0) {
    if (absZ > 1.5) return '#C53030';
    if (absZ > 1.0) return '#E53E3E';
    if (absZ > 0.5) return '#FC8181';
    return '#FEB2B2';
  }
  if (absZ > 1.5) return '#2B6CB0';
  if (absZ > 1.0) return '#3182CE';
  if (absZ > 0.5) return '#63B3ED';
  return '#BEE3F8';
}

interface PriorityHeatmapProps {
  diagnostics: ZoneDiagnostic[];
  layer?: string;
  colorblindMode?: boolean;
}

export function PriorityHeatmap({ diagnostics, layer = 'full', colorblindMode }: PriorityHeatmapProps) {
  const { zones, indicators, grid } = useMemo(() => {
    const zoneList = diagnostics.map(d => d.zone_name);
    const indSet = new Set<string>();
    const gridMap: Record<string, Record<string, { value: number | null; z_score: number }>> = {};

    for (const diag of diagnostics) {
      gridMap[diag.zone_name] = {};
      const status = diag.indicator_status || {};
      for (const [indId, layerData] of Object.entries(status)) {
        indSet.add(indId);
        const ld = (layerData as Record<string, { value?: number | null; z_score?: number }>)[layer];
        if (ld) {
          gridMap[diag.zone_name][indId] = {
            value: ld.value ?? null,
            z_score: ld.z_score || 0,
          };
        }
      }
    }
    return { zones: zoneList, indicators: Array.from(indSet).sort(), grid: gridMap };
  }, [diagnostics, layer]);

  if (zones.length === 0 || indicators.length === 0) return null;

  const cellW = Math.max(44, Math.min(56, 600 / Math.max(indicators.length, 1)));
  const cellH = 36;
  const colLabelFontSize = 9;
  const rowLabelFontSize = 10;
  const colLabelMaxChars = 12; // truncation threshold below
  const rowLabelMaxChars = 14;
  const labelH = rotatedLabelTopMargin(colLabelMaxChars, colLabelFontSize);
  const labelW = Math.ceil(rowLabelMaxChars * rowLabelFontSize * CHAR_WIDTH_RATIO) + 14;
  // Legend: 5 swatches × 80px wide, 12px tall + 8px gap above + 8px below.
  const legendHeight = 12;
  const legendGap = 8;
  const legendBottomPad = 8;
  const svgW = labelW + indicators.length * cellW;
  const svgH = labelH + zones.length * cellH + legendGap + legendHeight + legendBottomPad;
  const legendY = labelH + zones.length * cellH + legendGap;

  const legendItems = [
    { label: 'z<-1.5', color: '#2B6CB0' },
    { label: 'z<-0.5', color: '#63B3ED' },
    { label: 'z~0', color: '#E2E8F0' },
    { label: 'z>0.5', color: '#FC8181' },
    { label: 'z>1.5', color: '#C53030' },
  ];

  return (
    <Box overflowX="auto">
      <svg width={svgW} height={svgH} style={{ fontFamily: 'system-ui, sans-serif' }}>
        {/* Column labels */}
        {indicators.map((ind, ci) => (
          <text
            key={`col-${ind}`}
            x={labelW + ci * cellW + cellW / 2}
            y={labelH - 6}
            textAnchor="end"
            fontSize={colLabelFontSize}
            transform={`rotate(-45, ${labelW + ci * cellW + cellW / 2}, ${labelH - 6})`}
          >
            {ind.length > colLabelMaxChars ? ind.slice(0, colLabelMaxChars) + '...' : ind}
          </text>
        ))}
        {/* Rows */}
        {zones.map((zone, ri) => (
          <g key={zone}>
            <text x={labelW - 6} y={labelH + ri * cellH + cellH / 2 + 4} textAnchor="end" fontSize={rowLabelFontSize}>
              {zone.length > rowLabelMaxChars ? zone.slice(0, rowLabelMaxChars) + '...' : zone}
            </text>
            {indicators.map((ind, ci) => {
              const cell = grid[zone]?.[ind];
              const zs = cell?.z_score ?? 0;
              return (
                <g key={`${zone}-${ind}`}>
                  <rect
                    x={labelW + ci * cellW}
                    y={labelH + ri * cellH}
                    width={cellW - 2}
                    height={cellH - 2}
                    rx={3}
                    fill={zScoreCellColor(zs, colorblindMode)}
                    opacity={0.85}
                  >
                    <title>{`${zone} x ${ind}: z=${zs.toFixed(2)}`}</title>
                  </rect>
                  <text
                    x={labelW + ci * cellW + (cellW - 2) / 2}
                    y={labelH + ri * cellH + (cellH - 2) / 2 + 4}
                    textAnchor="middle"
                    fontSize={9}
                    fill={Math.abs(zs) > 0.8 ? '#fff' : '#2D3748'}
                    fontWeight="bold"
                    pointerEvents="none"
                  >
                    {zs.toFixed(1)}
                  </text>
                </g>
              );
            })}
          </g>
        ))}
        {/* Legend (positioned below the last row with a fixed 8px gap) */}
        <g transform={`translate(${labelW}, ${legendY})`}>
          {legendItems.map((item, i) => (
            <g key={item.label} transform={`translate(${i * 80}, 0)`}>
              <rect width={12} height={12} fill={item.color} rx={2} opacity={0.85} />
              <text x={16} y={10} fontSize={8} fill="#4A5568">{item.label}</text>
            </g>
          ))}
        </g>
      </svg>
    </Box>
  );
}

// ─── Indicator Comparison Grouped Bar ───────────────────────────────────────

interface IndicatorComparisonChartProps {
  stats: EnrichedZoneStat[];
  layer: string;
}

export function IndicatorComparisonChart({ stats, layer }: IndicatorComparisonChartProps) {
  const { data, zones } = useMemo(() => {
    const filtered = stats.filter(s => s.layer === layer);
    const zoneNames = Array.from(new Set(filtered.map(s => s.zone_name))).sort();
    const indicatorIds = Array.from(new Set(filtered.map(s => s.indicator_id))).sort();

    const chartData = indicatorIds.map(ind => {
      const row: Record<string, string | number | null> = { indicator: ind };
      for (const zone of zoneNames) {
        const stat = filtered.find(s => s.indicator_id === ind && s.zone_name === zone);
        row[zone] = stat?.mean ?? null;
      }
      return row;
    });

    return { data: chartData, zones: zoneNames };
  }, [stats, layer]);

  if (zones.length === 0 || data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={Math.max(250, data.length * 35 + 60)}>
      <BarChart data={data} margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="indicator" tick={{ fontSize: 9 }} interval={0} angle={-45} textAnchor="end" height={80} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {zones.map((zone, i) => (
          <Bar key={zone} dataKey={zone} fill={getZoneColor(i)} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}


// ─── Descriptive Statistics Chart (Mean ± Std with Min/Max) ─────────────────

interface DescriptiveStatsChartProps {
  stats: EnrichedZoneStat[];
  layer: string;
}

export function DescriptiveStatsChart({ stats, layer }: DescriptiveStatsChartProps) {
  const data = useMemo(() => {
    const filtered = stats.filter(s => s.layer === layer);
    const indicators = Array.from(new Set(filtered.map(s => s.indicator_id))).sort();
    return indicators.map(ind => {
      const rows = filtered.filter(s => s.indicator_id === ind);
      const means = rows.map(r => r.mean ?? 0);
      const stds = rows.map(r => r.std ?? 0);
      const mins = rows.map(r => r.min ?? 0);
      const maxs = rows.map(r => r.max ?? 0);
      const avgMean = means.reduce((a, b) => a + b, 0) / (means.length || 1);
      const avgStd = stds.reduce((a, b) => a + b, 0) / (stds.length || 1);
      return {
        indicator: ind,
        mean: Number(avgMean.toFixed(3)),
        std: Number(avgStd.toFixed(3)),
        min: Number(Math.min(...mins).toFixed(3)),
        max: Number(Math.max(...maxs).toFixed(3)),
      };
    });
  }, [stats, layer]);

  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={Math.max(250, data.length * 40 + 60)}>
      <BarChart data={data} layout="vertical" margin={{ left: 20, right: 30, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" tick={{ fontSize: 10 }} />
        <YAxis type="category" dataKey="indicator" tick={{ fontSize: 9 }} width={100} />
        <Tooltip formatter={(v, name) => [typeof v === 'number' ? v.toFixed(3) : '—', name ?? '']} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="mean" fill="#3182CE" name="Mean" barSize={14}>
          <ErrorBar dataKey="std" direction="x" stroke="#2D3748" strokeWidth={1} />
        </Bar>
        <Bar dataKey="min" fill="#E53E3E" name="Min" barSize={6} />
        <Bar dataKey="max" fill="#38A169" name="Max" barSize={6} />
      </BarChart>
    </ResponsiveContainer>
  );
}


// ─── Z-Score Heatmap (Zone × Indicator, colored by z-score) ─────────────────

interface ZScoreHeatmapProps {
  stats: EnrichedZoneStat[];
  layer: string;
}

export function ZScoreHeatmap({ stats, layer }: ZScoreHeatmapProps) {
  const { zones, indicators, grid } = useMemo(() => {
    const filtered = stats.filter(s => s.layer === layer);
    const zoneList = Array.from(new Set(filtered.map(s => s.zone_name))).sort();
    const indList = Array.from(new Set(filtered.map(s => s.indicator_id))).sort();
    const g: Record<string, Record<string, { z: number; val: number }>> = {};
    for (const s of filtered) {
      if (!g[s.zone_name]) g[s.zone_name] = {};
      g[s.zone_name][s.indicator_id] = { z: s.z_score ?? 0, val: s.mean ?? 0 };
    }
    return { zones: zoneList, indicators: indList, grid: g };
  }, [stats, layer]);

  if (zones.length === 0 || indicators.length === 0) return null;

  const cellW = Math.max(44, Math.min(56, 600 / Math.max(indicators.length, 1)));
  const cellH = 36;
  const labelW = 120;
  const labelH = 90;
  const svgW = labelW + indicators.length * cellW;
  const svgH = labelH + zones.length * cellH + 30;

  function zColor(z: number): string {
    const clamped = Math.max(-2, Math.min(2, z));
    const t = (clamped + 2) / 4; // 0..1
    // Red (low) → Yellow (mid) → Green (high)
    if (t < 0.5) {
      const r = 229, g = Math.round(62 + (204 - 62) * t * 2), b = 62;
      return `rgb(${r},${g},${b})`;
    }
    const r = Math.round(204 - (204 - 56) * (t - 0.5) * 2), g = Math.round(204 - (204 - 161) * (t - 0.5) * 2), b = Math.round(62 - (62 - 56) * (t - 0.5) * 2);
    return `rgb(${r},${g},${b})`;
  }

  return (
    <Box overflowX="auto">
      <svg width={svgW} height={svgH} style={{ fontFamily: 'system-ui, sans-serif' }}>
        {indicators.map((ind, ci) => (
          <text key={`col-${ind}`} x={labelW + ci * cellW + cellW / 2} y={labelH - 6} textAnchor="end" fontSize={9}
            transform={`rotate(-45, ${labelW + ci * cellW + cellW / 2}, ${labelH - 6})`}
          >{ind.length > 12 ? ind.slice(0, 12) + '…' : ind}</text>
        ))}
        {zones.map((zone, ri) => (
          <g key={zone}>
            <text x={labelW - 6} y={labelH + ri * cellH + cellH / 2 + 4} textAnchor="end" fontSize={10}>
              {zone.length > 14 ? zone.slice(0, 14) + '…' : zone}
            </text>
            {indicators.map((ind, ci) => {
              const cell = grid[zone]?.[ind];
              const z = cell?.z ?? 0;
              const val = cell?.val ?? 0;
              return (
                <g key={`${zone}-${ind}`}>
                  <rect x={labelW + ci * cellW} y={labelH + ri * cellH} width={cellW - 2} height={cellH - 2} rx={3}
                    fill={cell ? zColor(z) : '#EDF2F7'} opacity={0.85}
                  ><title>{`${zone} × ${ind}: val=${val.toFixed(2)}, z=${z.toFixed(2)}`}</title></rect>
                  <text x={labelW + ci * cellW + (cellW - 2) / 2} y={labelH + ri * cellH + (cellH - 2) / 2 + 4}
                    textAnchor="middle" fontSize={9} fill="#fff" fontWeight="bold" pointerEvents="none"
                  >{val.toFixed(1)}</text>
                </g>
              );
            })}
          </g>
        ))}
        <g transform={`translate(${labelW}, ${svgH - 18})`}>
          {[{l: '-2 (low)', c: zColor(-2)}, {l: '-1', c: zColor(-1)}, {l: '0', c: zColor(0)}, {l: '+1', c: zColor(1)}, {l: '+2 (high)', c: zColor(2)}].map((item, i) => (
            <g key={i} transform={`translate(${i * 80}, 0)`}>
              <rect width={12} height={12} fill={item.c} rx={2} opacity={0.85} />
              <text x={16} y={10} fontSize={8} fill="#4A5568">{item.l}</text>
            </g>
          ))}
        </g>
      </svg>
    </Box>
  );
}


// ─── Box Plot by Layer (per indicator) ──────────────────────────────────────

interface BoxPlotChartProps {
  stats: EnrichedZoneStat[];
  indicatorId: string;
}

export function BoxPlotChart({ stats, indicatorId }: BoxPlotChartProps) {
  const LAYER_COLORS: Record<string, string> = { full: '#3182CE', foreground: '#38A169', middleground: '#D69E2E', background: '#805AD5' };
  const layers = ['full', 'foreground', 'middleground', 'background'];

  const data = useMemo(() => {
    return layers.map(layer => {
      const vals = stats.filter(s => s.indicator_id === indicatorId && s.layer === layer && s.mean != null).map(s => s.mean!);
      if (vals.length === 0) return null;
      vals.sort((a, b) => a - b);
      const q1 = vals[Math.floor(vals.length * 0.25)] ?? 0;
      const median = vals[Math.floor(vals.length * 0.5)] ?? 0;
      const q3 = vals[Math.floor(vals.length * 0.75)] ?? 0;
      const min = vals[0];
      const max = vals[vals.length - 1];
      return { layer, min, q1, median, q3, max, n: vals.length };
    }).filter(Boolean) as { layer: string; min: number; q1: number; median: number; q3: number; max: number; n: number }[];
  }, [stats, indicatorId]);

  if (data.length === 0) return null;

  const svgW = 400;
  const svgH = 200;
  const plotL = 60, plotR = svgW - 20, plotT = 20, plotB = svgH - 40;
  const allVals = data.flatMap(d => [d.min, d.max]);
  const yMin = Math.min(...allVals);
  const yMax = Math.max(...allVals);
  const yRange = yMax - yMin || 1;
  const toY = (v: number) => plotB - ((v - yMin) / yRange) * (plotB - plotT);
  const boxW = Math.min(50, (plotR - plotL) / data.length - 10);

  return (
    <Box overflowX="auto">
      <svg width={svgW} height={svgH} style={{ fontFamily: 'system-ui, sans-serif' }}>
        {/* Y axis */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => {
          const v = yMin + t * yRange;
          const y = toY(v);
          return (
            <g key={t}>
              <line x1={plotL} y1={y} x2={plotR} y2={y} stroke="#E2E8F0" />
              <text x={plotL - 5} y={y + 4} textAnchor="end" fontSize={9} fill="#718096">{v.toFixed(2)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const cx = plotL + (i + 0.5) * ((plotR - plotL) / data.length);
          const color = LAYER_COLORS[d.layer] || '#718096';
          return (
            <g key={d.layer}>
              {/* Whisker line */}
              <line x1={cx} y1={toY(d.min)} x2={cx} y2={toY(d.max)} stroke={color} strokeWidth={1.5} />
              {/* Min/Max caps */}
              <line x1={cx - boxW / 4} y1={toY(d.min)} x2={cx + boxW / 4} y2={toY(d.min)} stroke={color} strokeWidth={1.5} />
              <line x1={cx - boxW / 4} y1={toY(d.max)} x2={cx + boxW / 4} y2={toY(d.max)} stroke={color} strokeWidth={1.5} />
              {/* Box Q1→Q3 */}
              <rect x={cx - boxW / 2} y={toY(d.q3)} width={boxW} height={toY(d.q1) - toY(d.q3)} fill={color} opacity={0.3} stroke={color} strokeWidth={1.5} rx={2} />
              {/* Median line */}
              <line x1={cx - boxW / 2} y1={toY(d.median)} x2={cx + boxW / 2} y2={toY(d.median)} stroke={color} strokeWidth={2.5} />
              {/* Label */}
              <text x={cx} y={plotB + 16} textAnchor="middle" fontSize={10} fill="#4A5568">{d.layer}</text>
              <text x={cx} y={plotB + 28} textAnchor="middle" fontSize={8} fill="#A0AEC0">n={d.n}</text>
            </g>
          );
        })}
      </svg>
    </Box>
  );
}


// ─── Per-Indicator Deep Dive (Cell 16 — bars + heatmap + stats + boxplot) ──

interface IndicatorDeepDiveProps {
  stats: EnrichedZoneStat[];
  indicatorId: string;
  indicatorName?: string;
  unit?: string;
  targetDirection?: string;
  /** When `image_level`, fall back to image-level Std/CV from globalStats. */
  analysisMode?: 'zone_level' | 'image_level';
  /** Per-indicator image-level stats (n=images, has by_layer.{N,Mean,Std}). */
  globalStats?: GlobalIndicatorStats;
}

const DD_LAYERS = ['full', 'foreground', 'middleground', 'background'] as const;
const DD_LAYER_LABELS: Record<string, string> = { full: 'Full', foreground: 'FG', middleground: 'MG', background: 'BG' };
const DD_LAYER_COLORS: Record<string, string> = { full: '#3182CE', foreground: '#E53E3E', middleground: '#38A169', background: '#805AD5' };

function viridisColor(t: number): string {
  // Linear approximation of the viridis colormap in 4 stops
  const stops = [
    [68, 1, 84],     // 0.0 dark purple
    [59, 82, 139],   // 0.33 blue
    [33, 145, 140],  // 0.66 teal
    [253, 231, 37],  // 1.0 yellow
  ];
  const clamped = Math.max(0, Math.min(1, t));
  const seg = clamped * (stops.length - 1);
  const i0 = Math.floor(seg);
  const i1 = Math.min(stops.length - 1, i0 + 1);
  const f = seg - i0;
  const r = Math.round(stops[i0][0] * (1 - f) + stops[i1][0] * f);
  const g = Math.round(stops[i0][1] * (1 - f) + stops[i1][1] * f);
  const b = Math.round(stops[i0][2] * (1 - f) + stops[i1][2] * f);
  return `rgb(${r},${g},${b})`;
}

export function IndicatorDeepDive({ stats, indicatorId, indicatorName, unit, targetDirection, analysisMode, globalStats }: IndicatorDeepDiveProps) {
  const derived = useMemo(() => {
    const indStats = stats.filter(s => s.indicator_id === indicatorId);
    if (indStats.length === 0) return null;

    // Unique zones
    const seen = new Map<string, string>();
    for (const s of indStats) if (!seen.has(s.zone_id)) seen.set(s.zone_id, s.zone_name);
    const zoneList = Array.from(seen.entries()).map(([id, name]) => ({ id, name }));

    const getVal = (zId: string, layer: string): number | null => {
      const rec = indStats.find(s => s.zone_id === zId && s.layer === layer);
      return rec?.mean != null ? rec.mean : null;
    };

    // Full-layer zone ranking bar
    const fullEntries = zoneList
      .map(z => ({ name: z.name, value: getVal(z.id, 'full') }))
      .filter(e => e.value != null) as { name: string; value: number }[];
    fullEntries.sort((a, b) => b.value - a.value);
    const maxV = fullEntries.length > 0 ? Math.max(...fullEntries.map(e => e.value)) : 0;
    const minV = fullEntries.length > 0 ? Math.min(...fullEntries.map(e => e.value)) : 0;

    // Layer statistics. With < 2 zones, the cross-zone std/cv collapse to 0
    // mathematically — fall back to image-level Std/CV (n = n_images) which
    // captures the meaningful within-zone dispersion.
    const useImageLevel = analysisMode === 'image_level' || zoneList.length < 2;
    const layerStats = DD_LAYERS.map(layer => {
      if (useImageLevel && globalStats) {
        const layerEntry = globalStats.by_layer?.[layer];
        if (layerEntry?.N != null && layerEntry.N > 0) {
          const mean = layerEntry.Mean ?? 0;
          const std = layerEntry.Std ?? 0;
          const cv = layer === 'full' && globalStats.cv_full != null
            ? globalStats.cv_full
            : (mean !== 0 ? (std / Math.abs(mean)) * 100 : 0);
          return { layer, n: layerEntry.N, mean, std, cv };
        }
      }
      const vals = zoneList.map(z => getVal(z.id, layer)).filter((v): v is number => v != null);
      if (vals.length === 0) return { layer, n: 0, mean: 0, std: 0, cv: 0 };
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      // ddof=1 (sample std) so a single value yields NaN, not 0.
      if (vals.length < 2) return { layer, n: vals.length, mean, std: NaN, cv: NaN };
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1);
      const std = Math.sqrt(variance);
      const cv = mean !== 0 ? (std / Math.abs(mean)) * 100 : 0;
      return { layer, n: vals.length, mean, std, cv };
    });

    return { fullEntries, maxV, minV, layerStats, useImageLevel };
  }, [stats, indicatorId, analysisMode, globalStats]);

  if (!derived) return null;
  const { fullEntries, maxV, minV, layerStats, useImageLevel } = derived;
  const range = maxV - minV || 1;
  const fmt = (v: number, digits: number) => (Number.isFinite(v) ? v.toFixed(digits) : '—');

  return (
    <Box>
      <Box mb={2}>
        <Text fontSize="sm" fontWeight="bold">
          {indicatorId}{indicatorName ? `: ${indicatorName}` : ''}
        </Text>
        {(unit || targetDirection) && (
          <Text fontSize="xs" color="gray.500">
            {unit ? `Unit: ${unit}` : ''}
            {unit && targetDirection ? ' | ' : ''}
            {targetDirection ? `Direction: ${targetDirection}` : ''}
          </Text>
        )}
      </Box>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
        {/* Zone ranking bar (full layer only) */}
        <Box>
          <Text fontSize="xs" fontWeight="bold" mb={1} color={DD_LAYER_COLORS.full}>Zone Ranking (Full Layer)</Text>
          {fullEntries.length === 0 ? (
            <Text fontSize="xs" color="gray.400">No data</Text>
          ) : (() => {
            const svgW = 260;
            const rowH = 18;
            const svgH = fullEntries.length * rowH + 6;
            const labelW = 80;
            const barAreaW = svgW - labelW - 50;
            return (
              <svg width={svgW} height={svgH} style={{ fontFamily: 'system-ui, sans-serif' }}>
                {fullEntries.map((e, i) => {
                  const w = ((e.value - minV) / range) * barAreaW;
                  const y = i * rowH + 2;
                  const t = range > 0 ? (e.value - minV) / range : 0.5;
                  return (
                    <g key={i}>
                      <text x={labelW - 4} y={y + rowH * 0.7} fontSize={9} textAnchor="end" fill="#4A5568">
                        {e.name.length > 12 ? e.name.slice(0, 12) + '...' : e.name}
                      </text>
                      <rect x={labelW} y={y + 1} width={Math.max(w, 2)} height={rowH - 4} fill={viridisColor(t)} rx={2} />
                      <text x={labelW + w + 4} y={y + rowH * 0.7} fontSize={8} fill="#718096">{e.value.toFixed(2)}</text>
                    </g>
                  );
                })}
              </svg>
            );
          })()}
        </Box>

        {/* Layer Statistics table */}
        <Box>
          <HStack justify="space-between" mb={1}>
            <Text fontSize="xs" fontWeight="bold">Layer Statistics</Text>
            {useImageLevel && (
              <Text fontSize="2xs" color="gray.500">
                (image-level, n = {layerStats.find(l => l.layer === 'full')?.n ?? '?'})
              </Text>
            )}
          </HStack>
          <Box as="table" fontSize="10px" width="100%" sx={{ borderCollapse: 'collapse' }}>
            <Box as="thead">
              <Box as="tr" bg="gray.50" fontWeight="bold">
                <Box as="th" px={2} py={1} textAlign="left">Layer</Box>
                <Box as="th" px={2} py={1} textAlign="right">N</Box>
                <Box as="th" px={2} py={1} textAlign="right">Mean</Box>
                <Box as="th" px={2} py={1} textAlign="right">Std</Box>
                <Box as="th" px={2} py={1} textAlign="right">CV%</Box>
              </Box>
            </Box>
            <Box as="tbody">
              {layerStats.map(ls => (
                <Box as="tr" key={ls.layer} borderTop="1px solid" borderColor="gray.100">
                  <Box as="td" px={2} py={1} color={DD_LAYER_COLORS[ls.layer]} fontWeight="bold">
                    {DD_LAYER_LABELS[ls.layer]}
                  </Box>
                  <Box as="td" px={2} py={1} textAlign="right">{ls.n}</Box>
                  <Box as="td" px={2} py={1} textAlign="right">{fmt(ls.mean, 3)}</Box>
                  <Box as="td" px={2} py={1} textAlign="right">{fmt(ls.std, 3)}</Box>
                  <Box as="td" px={2} py={1} textAlign="right">{fmt(ls.cv, 1)}</Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {/* BoxPlot by layer */}
        <Box>
          <Text fontSize="xs" fontWeight="bold" mb={1}>Distribution by Layer</Text>
          <BoxPlotChart stats={stats} indicatorId={indicatorId} />
        </Box>
      </SimpleGrid>
    </Box>
  );
}


// ─── Archetype Radar Chart (Cluster Centroids) ─────────────────────────────

interface ArchetypeRadarChartProps {
  archetypes: ArchetypeProfile[];
}

export function ArchetypeRadarChart({ archetypes }: ArchetypeRadarChartProps) {
  const { data, names } = useMemo(() => {
    if (!archetypes || archetypes.length === 0) return { data: [], names: [] };
    const allInds = Array.from(new Set(archetypes.flatMap(a => Object.keys(a.centroid_values)))).sort();
    const chartData = allInds.map(ind => {
      const row: Record<string, string | number> = { indicator: ind };
      for (const a of archetypes) {
        row[a.archetype_label] = Number((a.centroid_values[ind] ?? 0).toFixed(3));
      }
      return row;
    });
    return { data: chartData, names: archetypes.map(a => a.archetype_label) };
  }, [archetypes]);

  if (data.length === 0 || names.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={400}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
        <PolarGrid />
        <PolarAngleAxis dataKey="indicator" tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.length > 10 ? v.slice(0, 10) + '…' : v} />
        <PolarRadiusAxis tick={{ fontSize: 10 }} />
        {names.map((name, i) => (
          <Radar key={name} name={name} dataKey={name} stroke={getZoneColor(i)} fill={getZoneColor(i)} fillOpacity={0.15} />
        ))}
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Tooltip />
      </RadarChart>
    </ResponsiveContainer>
  );
}


// ─── Cluster Size Bar Chart ────────────────────────────────────────────────

interface ClusterSizeChartProps {
  archetypes: ArchetypeProfile[];
}

export function ClusterSizeChart({ archetypes }: ClusterSizeChartProps) {
  const data = useMemo(() => {
    return archetypes.map(a => ({
      name: a.archetype_label,
      count: a.point_count,
    }));
  }, [archetypes]);

  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} label={{ value: 'Points', angle: -90, position: 'insideLeft', fontSize: 10 }} />
        <Tooltip />
        <Bar dataKey="count" name="Points" barSize={40}>
          {data.map((_, i) => <Cell key={i} fill={getZoneColor(i)} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}


// ─── Spatial Scatter Map (points colored by value) ─────────────────────────

interface SpatialScatterMapProps {
  points: { lat: number; lng: number; value: number; label?: string }[];
  indicatorId?: string;
  /** Shared min/max for color scaling across sibling maps (e.g., per-layer grid). */
  vMin?: number;
  vMax?: number;
  /** Compact mode: smaller dimensions for grid layouts. */
  compact?: boolean;
}

export function SpatialScatterMap({ points, indicatorId, vMin: vMinProp, vMax: vMaxProp, compact }: SpatialScatterMapProps) {
  if (!points || points.length === 0) return null;

  const vals = points.map(p => p.value);
  const vMin = vMinProp ?? Math.min(...vals);
  const vMax = vMaxProp ?? Math.max(...vals);
  const vRange = vMax - vMin || 1;

  const svgW = compact ? 340 : 500;
  const svgH = compact ? 260 : 400;
  const margin = compact ? { l: 50, r: 16, t: 16, b: 40 } : { l: 60, r: 20, t: 20, b: 50 };
  const plotW = svgW - margin.l - margin.r;
  const plotH = svgH - margin.t - margin.b;

  const lngs = points.map(p => p.lng);
  const lats = points.map(p => p.lat);
  const lngMin = Math.min(...lngs), lngMax = Math.max(...lngs);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lngRange = lngMax - lngMin || 0.001;
  const latRange = latMax - latMin || 0.001;

  const toX = (lng: number) => margin.l + ((lng - lngMin) / lngRange) * plotW;
  const toYPos = (lat: number) => margin.t + plotH - ((lat - latMin) / latRange) * plotH;

  function valColor(v: number): string {
    const t = (v - vMin) / vRange;
    const r = Math.round(229 - t * 173);
    const g = Math.round(62 + t * 99);
    const b = Math.round(62 - t * 6);
    return `rgb(${r},${g},${b})`;
  }

  return (
    <Box overflowX="auto">
      <svg width={svgW} height={svgH} style={{ fontFamily: 'system-ui, sans-serif' }}>
        {/* Axes */}
        <line x1={margin.l} y1={margin.t} x2={margin.l} y2={margin.t + plotH} stroke="#CBD5E0" />
        <line x1={margin.l} y1={margin.t + plotH} x2={margin.l + plotW} y2={margin.t + plotH} stroke="#CBD5E0" />
        <text x={svgW / 2} y={svgH - 5} textAnchor="middle" fontSize={10} fill="#718096">Longitude</text>
        <text x={12} y={svgH / 2} textAnchor="middle" fontSize={10} fill="#718096" transform={`rotate(-90, 12, ${svgH / 2})`}>Latitude</text>
        {indicatorId && <text x={svgW / 2} y={14} textAnchor="middle" fontSize={11} fontWeight="bold" fill="#2D3748">{indicatorId}</text>}
        {/* Points */}
        {points.map((p, i) => (
          <circle key={i} cx={toX(p.lng)} cy={toYPos(p.lat)} r={compact ? 3.5 : 5} fill={valColor(p.value)} stroke="#fff" strokeWidth={0.5} opacity={0.85}>
            <title>{`${p.label || ''} (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}): ${p.value.toFixed(3)}`}</title>
          </circle>
        ))}
        {/* Legend */}
        <defs>
          <linearGradient id={`spatialGrad-${indicatorId ?? 'default'}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={valColor(vMin)} />
            <stop offset="100%" stopColor={valColor(vMax)} />
          </linearGradient>
        </defs>
        <rect x={margin.l + plotW - 120} y={margin.t + 5} width={100} height={10} fill={`url(#spatialGrad-${indicatorId ?? 'default'})`} rx={2} />
        <text x={margin.l + plotW - 122} y={margin.t + 14} textAnchor="end" fontSize={8} fill="#718096">{vMin.toFixed(2)}</text>
        <text x={margin.l + plotW - 18} y={margin.t + 14} textAnchor="start" fontSize={8} fill="#718096">{vMax.toFixed(2)}</text>
      </svg>
    </Box>
  );
}


// ─── Per-Indicator Spatial Scatter — All Layers Combined (Fig 7) ─────────

interface SpatialScatterByLayerProps {
  /** GPS-enabled images (has_gps && latitude != null && longitude != null). */
  gpsImages: UploadedImage[];
  indicatorId: string;
}

const LAYER_DEFS: { key: string; label: string; suffix: string }[] = [
  { key: 'full', label: 'Full', suffix: '' },
  { key: 'foreground', label: 'FG', suffix: '__foreground' },
  { key: 'middleground', label: 'MG', suffix: '__middleground' },
  { key: 'background', label: 'BG', suffix: '__background' },
];

const LAYER_SCATTER_COLORS: Record<string, string> = {
  full: '#718096',
  foreground: '#E53E3E',
  middleground: '#38A169',
  background: '#805AD5',
};

export function SpatialScatterByLayer({ gpsImages, indicatorId }: SpatialScatterByLayerProps) {
  // Per-layer point sets. With identical (lat,lng) across the 4 layers, an
  // overlaid single-canvas rendering hides every layer except the last drawn —
  // small multiples (one canvas per layer) removes the occlusion entirely.
  const layered = useMemo(() => {
    type Pt = { lat: number; lng: number; value: number; label: string };
    const out: Record<string, Pt[]> = { full: [], foreground: [], middleground: [], background: [] };
    for (const l of LAYER_DEFS) {
      const key = l.suffix ? `${indicatorId}${l.suffix}` : indicatorId;
      for (const img of gpsImages) {
        const v = img.metrics_results[key];
        if (v != null && img.latitude != null && img.longitude != null) {
          out[l.key].push({
            lat: img.latitude, lng: img.longitude, value: v,
            label: `${img.zone_id || img.filename}`,
          });
        }
      }
    }
    return out;
  }, [gpsImages, indicatorId]);

  // Shared lat/lng extent so all 4 panels align.
  const allPts = useMemo(
    () => Object.values(layered).flat(),
    [layered],
  );
  if (allPts.length === 0) return null;

  const lngs = allPts.map(p => p.lng);
  const lats = allPts.map(p => p.lat);
  const lngMin = Math.min(...lngs), lngMax = Math.max(...lngs);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lngRange = lngMax - lngMin || 0.001;
  const latRange = latMax - latMin || 0.001;

  const svgW = 280, svgH = 220;
  const margin = { l: 38, r: 10, t: 22, b: 28 };
  const plotW = svgW - margin.l - margin.r;
  const plotH = svgH - margin.t - margin.b;
  const toX = (lng: number) => margin.l + ((lng - lngMin) / lngRange) * plotW;
  const toY = (lat: number) => margin.t + plotH - ((lat - latMin) / latRange) * plotH;

  return (
    <Box>
      <Text fontSize="sm" fontWeight="bold" mb={2}>{indicatorId}</Text>
      <SimpleGrid columns={{ base: 1, sm: 2, lg: 4 }} spacing={2}>
        {LAYER_DEFS.map(l => {
          const pts = layered[l.key];
          const color = LAYER_SCATTER_COLORS[l.key] || '#A0AEC0';
          return (
            <Box key={l.key} borderWidth={1} borderColor="gray.200" borderRadius="md" p={1}>
              <svg width={svgW} height={svgH} style={{ fontFamily: 'system-ui, sans-serif' }}>
                <text x={svgW / 2} y={14} textAnchor="middle" fontSize={10} fontWeight="bold" fill={color}>
                  {l.label} (n={pts.length})
                </text>
                <line x1={margin.l} y1={margin.t} x2={margin.l} y2={margin.t + plotH} stroke="#CBD5E0" />
                <line x1={margin.l} y1={margin.t + plotH} x2={margin.l + plotW} y2={margin.t + plotH} stroke="#CBD5E0" />
                {pts.map((p, i) => (
                  <circle key={i} cx={toX(p.lng)} cy={toY(p.lat)} r={3.5}
                    fill={color} stroke="#fff" strokeWidth={0.5} opacity={0.85}>
                    <title>{`${p.label}: ${p.value.toFixed(3)}`}</title>
                  </circle>
                ))}
              </svg>
            </Box>
          );
        })}
      </SimpleGrid>
    </Box>
  );
}

// ─── Per-Indicator Value Spatial Distribution (Issue 4d) ───────────────────
// A heatmap over GPS points colored by indicator VALUE (not layer, not z).
// Complements:
//   • Fig 7 (Layer Coverage): "where does each layer have data?"
//   • Fig 8 (Z-Deviation):    "where does the indicator deviate from mean?"
//   • Value Heatmap:          "where is the indicator value high vs. low?"
// Especially useful for single-zone projects where the z-based views collapse.

interface ValueSpatialMapProps {
  gpsImages: UploadedImage[];
  indicatorId: string;
  /** Which layer's value to display (default 'full'). */
  layer?: 'full' | 'foreground' | 'middleground' | 'background';
  /** INCREASE = green-better, DECREASE = red-better, NEUTRAL = blue. */
  targetDirection?: string;
  colorblindMode?: boolean;
}

function gradientForDirection(t: number, dir: string, colorblindMode = false): string {
  return directionalColor(t, dir, colorblindMode);
}

export function ValueSpatialMap({
  gpsImages, indicatorId, layer = 'full', targetDirection = 'NEUTRAL', colorblindMode,
}: ValueSpatialMapProps) {
  const points = useMemo(() => {
    const suffix = LAYER_DEFS.find(l => l.key === layer)?.suffix ?? '';
    const key = suffix ? `${indicatorId}${suffix}` : indicatorId;
    const pts: { lat: number; lng: number; value: number; label: string }[] = [];
    for (const img of gpsImages) {
      const v = img.metrics_results[key];
      if (v != null && img.latitude != null && img.longitude != null) {
        pts.push({ lat: img.latitude, lng: img.longitude, value: v, label: img.filename });
      }
    }
    return pts;
  }, [gpsImages, indicatorId, layer]);

  if (points.length === 0) return null;

  // Robust value range using p5/p95 to avoid outliers compressing the gradient.
  const vals = [...points.map(p => p.value)].sort((a, b) => a - b);
  const p5 = vals[Math.floor(vals.length * 0.05)] ?? vals[0];
  const p95 = vals[Math.floor(vals.length * 0.95)] ?? vals[vals.length - 1];
  const valRange = p95 - p5 || 1;

  const svgW = 360, svgH = 260;
  const margin = { l: 50, r: 16, t: 28, b: 38 };
  const plotW = svgW - margin.l - margin.r;
  const plotH = svgH - margin.t - margin.b;
  const lngs = points.map(p => p.lng), lats = points.map(p => p.lat);
  const lngMin = Math.min(...lngs), lngMax = Math.max(...lngs);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lngRange = lngMax - lngMin || 0.001;
  const latRange = latMax - latMin || 0.001;
  const toX = (lng: number) => margin.l + ((lng - lngMin) / lngRange) * plotW;
  const toY = (lat: number) => margin.t + plotH - ((lat - latMin) / latRange) * plotH;

  return (
    <Box>
      <Text fontSize="sm" fontWeight="bold" mb={1}>{indicatorId}</Text>
      <Text fontSize="xs" color="gray.500" mb={1}>
        Color = indicator value ({layer} layer · {targetDirection.toLowerCase()} = better-darker · range p5–p95)
      </Text>
      <Box overflowX="auto" bg="gray.50" borderRadius="md" p={1}>
        <svg width={svgW} height={svgH} style={{ fontFamily: 'system-ui, sans-serif' }}>
          <line x1={margin.l} y1={margin.t} x2={margin.l} y2={margin.t + plotH} stroke="#CBD5E0" />
          <line x1={margin.l} y1={margin.t + plotH} x2={margin.l + plotW} y2={margin.t + plotH} stroke="#CBD5E0" />
          {points.map((p, i) => {
            const t = (p.value - p5) / valRange;
            return (
              <circle key={i} cx={toX(p.lng)} cy={toY(p.lat)} r={4.5}
                fill={gradientForDirection(t, targetDirection, colorblindMode)} stroke="#fff" strokeWidth={0.6} opacity={0.9}>
                <title>{`${p.label}: ${p.value.toFixed(3)}`}</title>
              </circle>
            );
          })}
          {/* Gradient legend */}
          <defs>
            <linearGradient id={`val-${indicatorId}-${layer}`} x1="0" x2="1">
              <stop offset="0%" stopColor={gradientForDirection(0, targetDirection, colorblindMode)} />
              <stop offset="50%" stopColor={gradientForDirection(0.5, targetDirection, colorblindMode)} />
              <stop offset="100%" stopColor={gradientForDirection(1, targetDirection, colorblindMode)} />
            </linearGradient>
          </defs>
          <rect x={margin.l + 4} y={6} width={120} height={8}
            fill={`url(#val-${indicatorId}-${layer})`} rx={2} />
          <text x={margin.l + 2} y={20} fontSize={8} fill="#718096">{p5.toFixed(2)}</text>
          <text x={margin.l + 124} y={20} textAnchor="end" fontSize={8} fill="#718096">{p95.toFixed(2)}</text>
        </svg>
      </Box>
    </Box>
  );
}


// ─── Cross-Indicator Spatial Maps (Fig 8) ──────────────────────────────────

interface CrossIndicatorSpatialMapsProps {
  gpsImages: UploadedImage[];
  indicatorIds: string[];
  colorblindMode?: boolean;
}

/** YlOrRd → Viridis when colorblindMode is on. `t` in [0, 1]. */
function ylOrRdColor(t: number, colorblindMode = false): string {
  return magnitudeColor(t, colorblindMode);
}

const CATEGORICAL_PALETTE = [
  '#3182CE', '#E53E3E', '#38A169', '#D69E2E',
  '#805AD5', '#DD6B20', '#0BC5EA', '#ED64A6',
  '#4A5568', '#F56565', '#48BB78', '#ECC94B',
];

interface CrossPoint {
  lat: number;
  lng: number;
  label?: string;
  meanAbsZ: number;
  mostDistinctive: string;
}

function renderCrossScatter(
  points: CrossPoint[],
  mode: 'gradient' | 'categorical',
  getColor: (p: CrossPoint) => string,
  valueFn: (p: CrossPoint) => string,
  colorblindMode = false,
) {
  if (points.length === 0) return null;
  const svgW = 340;
  const svgH = 260;
  const margin = { l: 50, r: 16, t: 14, b: 38 };
  const plotW = svgW - margin.l - margin.r;
  const plotH = svgH - margin.t - margin.b;

  const lngs = points.map(p => p.lng);
  const lats = points.map(p => p.lat);
  const lngMin = Math.min(...lngs), lngMax = Math.max(...lngs);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lngRange = lngMax - lngMin || 0.001;
  const latRange = latMax - latMin || 0.001;

  const toX = (lng: number) => margin.l + ((lng - lngMin) / lngRange) * plotW;
  const toY = (lat: number) => margin.t + plotH - ((lat - latMin) / latRange) * plotH;

  return (
    <svg width={svgW} height={svgH} style={{ fontFamily: 'system-ui, sans-serif' }}>
      <line x1={margin.l} y1={margin.t} x2={margin.l} y2={margin.t + plotH} stroke="#CBD5E0" />
      <line x1={margin.l} y1={margin.t + plotH} x2={margin.l + plotW} y2={margin.t + plotH} stroke="#CBD5E0" />
      <text x={svgW / 2} y={svgH - 4} textAnchor="middle" fontSize={9} fill="#718096">Longitude</text>
      <text x={12} y={svgH / 2} textAnchor="middle" fontSize={9} fill="#718096" transform={`rotate(-90, 12, ${svgH / 2})`}>Latitude</text>
      {points.map((p, i) => (
        <circle key={i} cx={toX(p.lng)} cy={toY(p.lat)} r={5.5} fill={getColor(p)} stroke="#fff" strokeWidth={0.8} opacity={0.85}>
          <title>{`${p.label || ''} (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}): ${valueFn(p)}`}</title>
        </circle>
      ))}
      {mode === 'gradient' && (
        <>
          <defs>
            <linearGradient id={`ylOrRd-${points.length}`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor={ylOrRdColor(0, colorblindMode)} />
              <stop offset="50%" stopColor={ylOrRdColor(0.5, colorblindMode)} />
              <stop offset="100%" stopColor={ylOrRdColor(1, colorblindMode)} />
            </linearGradient>
          </defs>
          <rect x={margin.l + plotW - 110} y={margin.t + 4} width={90} height={8} fill={`url(#ylOrRd-${points.length})`} rx={2} />
          <text x={margin.l + plotW - 112} y={margin.t + 11} textAnchor="end" fontSize={7} fill="#718096">0</text>
          <text x={margin.l + plotW - 16} y={margin.t + 11} textAnchor="start" fontSize={7} fill="#718096">2+</text>
        </>
      )}
    </svg>
  );
}

export function CrossIndicatorSpatialMaps({ gpsImages, indicatorIds, colorblindMode }: CrossIndicatorSpatialMapsProps) {
  // Compute only for full layer (aggregated view — per-layer breakdown in Deep Dive)
  const points = useMemo(() => {
    // Mean/std per indicator across all GPS points (full layer)
    const indStats: Record<string, { mean: number; std: number }> = {};
    for (const ind of indicatorIds) {
      const vals: number[] = [];
      for (const img of gpsImages) {
        const v = img.metrics_results[ind];
        if (v != null) vals.push(v);
      }
      if (vals.length < 3) continue;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1);
      const std = Math.sqrt(variance);
      if (std > 0) indStats[ind] = { mean, std };
    }

    // Per point: z-scores, mean_abs_z, most_distinctive
    const pts: CrossPoint[] = [];
    for (const img of gpsImages) {
      if (img.latitude == null || img.longitude == null) continue;
      let sumAbsZ = 0;
      let count = 0;
      let bestInd = '';
      let bestAbsZ = -1;
      for (const ind of indicatorIds) {
        const stats = indStats[ind];
        if (!stats) continue;
        const val = img.metrics_results[ind];
        if (val == null) continue;
        const z = (val - stats.mean) / stats.std;
        const absZ = Math.abs(z);
        sumAbsZ += absZ;
        count++;
        if (absZ > bestAbsZ) { bestAbsZ = absZ; bestInd = ind; }
      }
      if (count === 0) continue;
      pts.push({
        lat: img.latitude,
        lng: img.longitude,
        label: img.zone_id || img.filename,
        meanAbsZ: sumAbsZ / count,
        mostDistinctive: bestInd,
      });
    }
    return pts;
  }, [gpsImages, indicatorIds]);

  if (points.length === 0) {
    return (
      <Text fontSize="xs" color="gray.500">
        Cannot compute cross-indicator spatial maps: need at least 3 GPS images
        with indicator values that have non-zero variance.
      </Text>
    );
  }

  // Categorical color map for dominant indicators
  const allDominantInds = Array.from(
    new Set(points.map(p => p.mostDistinctive))
  ).sort();
  const indColor: Record<string, string> = {};
  allDominantInds.forEach((ind, i) => { indColor[ind] = CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]; });

  return (
    <Box>
      {/* Legend for dominant indicators */}
      <Box mb={3} display="flex" flexWrap="wrap" gap={2}>
        <Text fontSize="xs" fontWeight="bold" color="gray.600" mr={1}>Dominant indicator:</Text>
        {allDominantInds.map(ind => (
          <Box key={ind} display="inline-flex" alignItems="center" gap={1}>
            <Box w="10px" h="10px" borderRadius="sm" bg={indColor[ind]} />
            <Text fontSize="xs" color="gray.600">{ind.replace('IND_', '')}</Text>
          </Box>
        ))}
      </Box>

      <Text fontSize="xs" color="gray.500" mb={2}>n={points.length} GPS images</Text>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
        <Box>
          <Text fontSize="xs" textAlign="center" mb={1} color="gray.600">
            Deviation from Average (Mean |Z|)
          </Text>
          {renderCrossScatter(
            points,
            'gradient',
            p => ylOrRdColor(p.meanAbsZ / 2, colorblindMode),
            p => `Mean |Z| = ${p.meanAbsZ.toFixed(3)}`,
            colorblindMode,
          )}
        </Box>
        <Box>
          <Text fontSize="xs" textAlign="center" mb={1} color="gray.600">
            Most Distinctive Indicator
          </Text>
          {renderCrossScatter(
            points,
            'categorical',
            p => indColor[p.mostDistinctive] || '#A0AEC0',
            p => `${p.mostDistinctive} (|Z| highest)`,
          )}
        </Box>
      </SimpleGrid>
    </Box>
  );
}


// ─── Cluster Spatial Scatter (before vs after smoothing) ──────────────────

interface ClusterSpatialBeforeAfterProps {
  lats: number[];
  lngs: number[];
  labelsRaw: number[];
  labelsSmoothed: number[];
  archetypeLabels?: Record<number, string>;
}

export function ClusterSpatialBeforeAfter({
  lats, lngs, labelsRaw, labelsSmoothed, archetypeLabels = {},
}: ClusterSpatialBeforeAfterProps) {
  if (lats.length === 0 || lats.length !== lngs.length) return null;

  const uniqueLabels = Array.from(new Set([...labelsRaw, ...labelsSmoothed])).sort((a, b) => a - b);
  const colorMap: Record<number, string> = {};
  uniqueLabels.forEach((l, i) => { colorMap[l] = CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]; });

  const nChanged = labelsRaw.reduce((acc, r, i) => acc + (r !== labelsSmoothed[i] ? 1 : 0), 0);
  const pctChanged = labelsRaw.length > 0 ? (nChanged / labelsRaw.length) * 100 : 0;

  function renderMap(labels: number[], title: string) {
    const svgW = 340;
    const svgH = 280;
    const margin = { l: 50, r: 16, t: 14, b: 38 };
    const plotW = svgW - margin.l - margin.r;
    const plotH = svgH - margin.t - margin.b;

    const lngMin = Math.min(...lngs), lngMax = Math.max(...lngs);
    const latMin = Math.min(...lats), latMax = Math.max(...lats);
    const lngRange = lngMax - lngMin || 0.001;
    const latRange = latMax - latMin || 0.001;
    const toX = (lng: number) => margin.l + ((lng - lngMin) / lngRange) * plotW;
    const toY = (lat: number) => margin.t + plotH - ((lat - latMin) / latRange) * plotH;

    return (
      <Box>
        <Text fontSize="xs" textAlign="center" mb={1} color="gray.600" fontWeight="bold">{title}</Text>
        <svg width={svgW} height={svgH} style={{ fontFamily: 'system-ui, sans-serif' }}>
          <line x1={margin.l} y1={margin.t} x2={margin.l} y2={margin.t + plotH} stroke="#CBD5E0" />
          <line x1={margin.l} y1={margin.t + plotH} x2={margin.l + plotW} y2={margin.t + plotH} stroke="#CBD5E0" />
          <text x={svgW / 2} y={svgH - 4} textAnchor="middle" fontSize={9} fill="#718096">Longitude</text>
          <text x={12} y={svgH / 2} textAnchor="middle" fontSize={9} fill="#718096" transform={`rotate(-90, 12, ${svgH / 2})`}>Latitude</text>
          {lats.map((lat, i) => (
            <circle
              key={i}
              cx={toX(lngs[i])}
              cy={toY(lat)}
              r={3}
              fill={colorMap[labels[i]] || '#A0AEC0'}
              opacity={0.7}
              stroke="#fff"
              strokeWidth={0.3}
            >
              <title>{`Cluster ${labels[i]}${archetypeLabels[labels[i]] ? ': ' + archetypeLabels[labels[i]] : ''}`}</title>
            </circle>
          ))}
        </svg>
      </Box>
    );
  }

  return (
    <Box>
      <Text fontSize="xs" color="gray.600" mb={2}>
        Spatial smoothing changed <strong>{nChanged}</strong> labels ({pctChanged.toFixed(1)}% of {labelsRaw.length} points)
      </Text>
      {/* Legend */}
      <Box mb={3} display="flex" flexWrap="wrap" gap={2}>
        {uniqueLabels.map(l => (
          <Box key={l} display="inline-flex" alignItems="center" gap={1}>
            <Box w="10px" h="10px" borderRadius="sm" bg={colorMap[l]} />
            <Text fontSize="xs" color="gray.600">
              {archetypeLabels[l] || `Cluster ${l}`}
            </Text>
          </Box>
        ))}
      </Box>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
        {renderMap(labelsRaw, '(a) Before Smoothing')}
        {renderMap(labelsSmoothed, '(b) After Spatial Smoothing')}
      </SimpleGrid>
    </Box>
  );
}


// ─── Dendrogram (Ward hierarchical clustering tree) ───────────────────────

interface DendrogramProps {
  /** scipy linkage matrix: each row = [id1, id2, distance, count] */
  linkage: number[][];
  /** Show cut line at 85th percentile of merge distances (matches notebook Cell 23) */
  showCutLine?: boolean;
}

export function Dendrogram({ linkage, showCutLine = true }: DendrogramProps) {
  if (!linkage || linkage.length === 0) {
    return <Text fontSize="sm" color="gray.400">No dendrogram data</Text>;
  }

  const n = linkage.length + 1; // number of original samples
  const maxDist = Math.max(...linkage.map(row => row[2]));

  // Compute leaf display order via DFS (left-first)
  const leafOrder: number[] = [];
  function collect(nodeId: number) {
    if (nodeId < n) { leafOrder.push(nodeId); return; }
    const row = linkage[nodeId - n];
    collect(Math.round(row[0]));
    collect(Math.round(row[1]));
  }
  collect(n + linkage.length - 1);

  const leafX: Record<number, number> = {};
  leafOrder.forEach((leafId, idx) => { leafX[leafId] = idx; });

  // Compute position (x, y) for every node (leaves + internal)
  const nodes: { x: number; y: number }[] = new Array(n + linkage.length);
  for (let i = 0; i < n; i++) nodes[i] = { x: leafX[i], y: 0 };
  for (let i = 0; i < linkage.length; i++) {
    const [left, right, dist] = linkage[i];
    const ln = nodes[Math.round(left)];
    const rn = nodes[Math.round(right)];
    nodes[n + i] = { x: (ln.x + rn.x) / 2, y: dist };
  }

  const width = Math.min(1000, Math.max(400, n * 6));
  const height = 280;
  const marginL = 50, marginR = 16, marginT = 14, marginB = 28;
  const plotW = width - marginL - marginR;
  const plotH = height - marginT - marginB;

  const toX = (x: number) => marginL + (n > 1 ? (x / (n - 1)) * plotW : plotW / 2);
  const toY = (y: number) => marginT + plotH - (y / (maxDist || 1)) * plotH;

  // 85th percentile cut line
  const distances = linkage.map(r => r[2]).sort((a, b) => a - b);
  const cut = distances[Math.floor(distances.length * 0.85)];

  return (
    <Box overflowX="auto">
      <svg width={width} height={height} style={{ fontFamily: 'system-ui, sans-serif' }}>
        {/* Y-axis */}
        <line x1={marginL} y1={marginT} x2={marginL} y2={marginT + plotH} stroke="#CBD5E0" />
        {[0, 0.25, 0.5, 0.75, 1].map(t => {
          const v = t * maxDist;
          const y = toY(v);
          return (
            <g key={t}>
              <line x1={marginL - 3} y1={y} x2={marginL} y2={y} stroke="#CBD5E0" />
              <text x={marginL - 5} y={y + 3} textAnchor="end" fontSize={9} fill="#718096">{v.toFixed(1)}</text>
            </g>
          );
        })}
        <text x={12} y={marginT + plotH / 2} textAnchor="middle" fontSize={9} fill="#718096" transform={`rotate(-90, 12, ${marginT + plotH / 2})`}>
          Distance (Ward)
        </text>
        <text x={width / 2} y={height - 4} textAnchor="middle" fontSize={9} fill="#718096">
          Sample ({n} points)
        </text>
        {/* Cut line */}
        {showCutLine && (
          <>
            <line
              x1={marginL} y1={toY(cut)} x2={marginL + plotW} y2={toY(cut)}
              stroke="#E53E3E" strokeWidth={1} strokeDasharray="4 3" opacity={0.7}
            />
            <text x={marginL + plotW - 2} y={toY(cut) - 3} textAnchor="end" fontSize={8} fill="#E53E3E">
              85th pctl cut ({cut.toFixed(2)})
            </text>
          </>
        )}
        {/* Merge lines */}
        {linkage.map((row, i) => {
          const [left, right, dist] = row;
          const leftNode = nodes[Math.round(left)];
          const rightNode = nodes[Math.round(right)];
          const yTop = toY(dist);
          const xLeft = toX(leftNode.x);
          const xRight = toX(rightNode.x);
          const yLeft = toY(leftNode.y);
          const yRight = toY(rightNode.y);
          return (
            <g key={i}>
              <line x1={xLeft} y1={yLeft} x2={xLeft} y2={yTop} stroke="#4A5568" strokeWidth={0.8} />
              <line x1={xRight} y1={yRight} x2={xRight} y2={yTop} stroke="#4A5568" strokeWidth={0.8} />
              <line x1={xLeft} y1={yTop} x2={xRight} y2={yTop} stroke="#4A5568" strokeWidth={0.8} />
            </g>
          );
        })}
      </svg>
    </Box>
  );
}


// ─── Silhouette Score Curve ────────────────────────────────────────────────

interface SilhouetteCurveProps {
  scores: { k: number; silhouette: number }[];
  bestK: number;
}

export function SilhouetteCurve({ scores, bestK }: SilhouetteCurveProps) {
  if (!scores || scores.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={scores} margin={{ left: 10, right: 20, top: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="k" tick={{ fontSize: 11 }} label={{ value: 'Number of Clusters (K)', position: 'insideBottom', offset: -2, fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} label={{ value: 'Silhouette Score', angle: -90, position: 'insideLeft', fontSize: 11 }} domain={[0, 'auto']} />
        <Tooltip formatter={(v: number | undefined) => [v != null ? v.toFixed(4) : '—', 'Silhouette']} />
        <ReferenceLine x={bestK} stroke="#805AD5" strokeDasharray="5 5" label={{ value: `K=${bestK}`, position: 'top', fontSize: 10, fill: '#805AD5' }} />
        <Line type="monotone" dataKey="silhouette" stroke="#3182CE" strokeWidth={2} dot={{ r: 4, fill: '#3182CE' }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// v7.0 — New Tables & Figures
// ═══════════════════════════════════════════════════════════════════════════

// ─── Fig M1 / S1: Distribution Shape (Violin-like box-whisker) ───────────
//
// Recharts doesn't have a native violin — we approximate with a
// horizontal box-whisker (min/Q1/median/Q3/max) per layer, per indicator.

const VIOLIN_LAYERS = ['full', 'foreground', 'middleground', 'background'] as const;
const VIOLIN_LAYER_COLORS: Record<string, string> = {
  full: '#3182CE', foreground: '#E53E3E', middleground: '#38A169', background: '#805AD5',
};

interface ViolinChartProps {
  imageRecords: ImageRecord[];
  indicatorId: string;
  indicatorName?: string;
}

export function ViolinChart({ imageRecords, indicatorId, indicatorName }: ViolinChartProps) {
  const stats = useMemo(() => {
    return VIOLIN_LAYERS.map(layer => {
      const vals = imageRecords
        .filter(r => r.indicator_id === indicatorId && r.layer === layer)
        .map(r => r.value)
        .sort((a, b) => a - b);
      if (vals.length === 0) return null;
      const q = (p: number) => {
        const idx = p * (vals.length - 1);
        const lo = Math.floor(idx);
        const hi = Math.ceil(idx);
        return lo === hi ? vals[lo] : vals[lo] * (hi - idx) + vals[hi] * (idx - lo);
      };
      return {
        layer,
        n: vals.length,
        min: vals[0],
        q1: q(0.25),
        median: q(0.5),
        q3: q(0.75),
        max: vals[vals.length - 1],
        mean: vals.reduce((a, b) => a + b, 0) / vals.length,
      };
    }).filter(Boolean) as { layer: string; n: number; min: number; q1: number; median: number; q3: number; max: number; mean: number }[];
  }, [imageRecords, indicatorId]);

  if (stats.length === 0) return null;

  const svgW = 500;
  const svgH = 180;
  const plotL = 60, plotR = svgW - 20, plotT = 20, plotB = svgH - 35;
  const allVals = stats.flatMap(d => [d.min, d.max]);
  const yMin = Math.min(...allVals);
  const yMax = Math.max(...allVals);
  const yRange = yMax - yMin || 1;
  const toY = (v: number) => plotB - ((v - yMin) / yRange) * (plotB - plotT);
  const boxW = Math.min(60, (plotR - plotL) / stats.length - 10);

  return (
    <Box>
      {indicatorName && <Text fontSize="xs" fontWeight="bold" mb={1} textAlign="center">{indicatorName} ({indicatorId})</Text>}
      <Box overflowX="auto">
        <svg width={svgW} height={svgH} style={{ fontFamily: 'system-ui, sans-serif' }}>
          {/* Y-axis gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map(t => {
            const v = yMin + t * yRange;
            const y = toY(v);
            return (
              <g key={t}>
                <line x1={plotL} y1={y} x2={plotR} y2={y} stroke="#E2E8F0" />
                <text x={plotL - 5} y={y + 4} textAnchor="end" fontSize={9} fill="#718096">{v.toFixed(1)}</text>
              </g>
            );
          })}
          {stats.map((d, i) => {
            const cx = plotL + (i + 0.5) * ((plotR - plotL) / stats.length);
            const color = VIOLIN_LAYER_COLORS[d.layer] || '#718096';
            return (
              <g key={d.layer}>
                <line x1={cx} y1={toY(d.min)} x2={cx} y2={toY(d.max)} stroke={color} strokeWidth={1.5} />
                <line x1={cx - boxW / 4} y1={toY(d.min)} x2={cx + boxW / 4} y2={toY(d.min)} stroke={color} strokeWidth={1.5} />
                <line x1={cx - boxW / 4} y1={toY(d.max)} x2={cx + boxW / 4} y2={toY(d.max)} stroke={color} strokeWidth={1.5} />
                <rect x={cx - boxW / 2} y={toY(d.q3)} width={boxW} height={Math.max(1, toY(d.q1) - toY(d.q3))} fill={color} opacity={0.25} stroke={color} strokeWidth={1.5} rx={2} />
                <line x1={cx - boxW / 2} y1={toY(d.median)} x2={cx + boxW / 2} y2={toY(d.median)} stroke={color} strokeWidth={2.5} />
                {/* Mean diamond */}
                <polygon
                  points={`${cx},${toY(d.mean) - 4} ${cx + 4},${toY(d.mean)} ${cx},${toY(d.mean) + 4} ${cx - 4},${toY(d.mean)}`}
                  fill="white" stroke={color} strokeWidth={1.5}
                />
                <text x={cx} y={plotB + 14} textAnchor="middle" fontSize={10} fill="#4A5568">{d.layer === 'full' ? 'Full' : d.layer === 'foreground' ? 'FG' : d.layer === 'middleground' ? 'MG' : 'BG'}</text>
                <text x={cx} y={plotB + 26} textAnchor="middle" fontSize={8} fill="#A0AEC0">n={d.n}</text>
              </g>
            );
          })}
        </svg>
      </Box>
    </Box>
  );
}

// ─── Multi-indicator violin grid (Fig M1 full layout) ────────────────────

interface ViolinGridProps {
  imageRecords: ImageRecord[];
  indicatorDefs: Record<string, IndicatorDefinitionInput>;
}

export function ViolinGrid({ imageRecords, indicatorDefs }: ViolinGridProps) {
  const indicatorIds = useMemo(() => {
    const ids = new Set(imageRecords.map(r => r.indicator_id));
    return Array.from(ids).sort();
  }, [imageRecords]);

  if (indicatorIds.length === 0) return null;

  return (
    <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
      {indicatorIds.map(id => (
        <ViolinChart
          key={id}
          imageRecords={imageRecords}
          indicatorId={id}
          indicatorName={indicatorDefs[id]?.name}
        />
      ))}
    </SimpleGrid>
  );
}

// ─── Table M2: Global Descriptive Statistics ─────────────────────────────

interface GlobalStatsTableProps {
  stats: GlobalIndicatorStats[];
}

export function GlobalStatsTable({ stats }: GlobalStatsTableProps) {
  if (!stats || stats.length === 0) return null;

  const cellW = 70;
  const nameW = 140;
  const rowH = 28;
  const headerH = 50;
  const cols = ['Full', 'FG', 'MG', 'BG', 'CV%', 'Shapiro p', 'K-W p'];
  const svgW = nameW + cols.length * cellW;
  const svgH = headerH + stats.length * rowH + 4;

  function fmtP(p: number | null | undefined): string {
    if (p == null) return '-';
    if (p < 0.001) return '<.001';
    if (p < 0.01) return p.toFixed(3);
    return p.toFixed(2);
  }

  return (
    <Box overflowX="auto">
      <svg width={svgW} height={svgH} style={{ fontFamily: 'system-ui, sans-serif' }}>
        {/* Header */}
        {cols.map((c, ci) => (
          <text key={c} x={nameW + ci * cellW + cellW / 2} y={headerH - 8} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#4A5568">{c}</text>
        ))}
        <text x={4} y={headerH - 8} fontSize={9} fontWeight="bold" fill="#4A5568">Indicator</text>
        <line x1={0} y1={headerH} x2={svgW} y2={headerH} stroke="#CBD5E0" />

        {stats.map((s, ri) => {
          const y = headerH + ri * rowH;
          const layerKeys = ['full', 'foreground', 'middleground', 'background'];
          const layerVals = layerKeys.map(l => s.by_layer[l]);
          const cells: string[] = [
            ...layerVals.map(v =>
              v && v.Mean != null && v.Std != null
                ? `${v.Mean.toFixed(1)}±${v.Std.toFixed(1)}`
                : '—',
            ),
            s.cv_full != null ? `${s.cv_full.toFixed(0)}` : '—',
            fmtP(s.shapiro_p),
            fmtP(s.kruskal_p),
          ];
          const shapiroSig = s.shapiro_p != null && s.shapiro_p < 0.05;
          const kruskalSig = s.kruskal_p != null && s.kruskal_p < 0.05;

          return (
            <g key={s.indicator_id}>
              {ri % 2 === 0 && (
                <rect x={0} y={y} width={svgW} height={rowH} fill="#F7FAFC" />
              )}
              <text x={4} y={y + rowH / 2 + 4} fontSize={9} fill="#2D3748" fontWeight="bold">
                {s.indicator_id}
              </text>
              {cells.map((val, ci) => (
                <text
                  key={ci}
                  x={nameW + ci * cellW + cellW / 2}
                  y={y + rowH / 2 + 4}
                  textAnchor="middle"
                  fontSize={9}
                  fill={
                    (ci === 5 && shapiroSig) ? '#E53E3E' :
                    (ci === 6 && kruskalSig) ? '#E53E3E' :
                    '#4A5568'
                  }
                  fontWeight={(ci === 5 && shapiroSig) || (ci === 6 && kruskalSig) ? 'bold' : 'normal'}
                >
                  {val}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

// ─── Table M4: Data Quality Diagnostics ──────────────────────────────────

interface DataQualityTableProps {
  rows: DataQualityRow[];
}

export function DataQualityTable({ rows }: DataQualityTableProps) {
  if (!rows || rows.length === 0) return null;

  const cellW = 75;
  const nameW = 120;
  const rowH = 26;
  const headerH = 46;
  const cols = ['Total N', 'FG %', 'MG %', 'BG %', 'Normal?', 'Corr Method'];
  const svgW = nameW + cols.length * cellW;
  const svgH = headerH + rows.length * rowH + 4;

  return (
    <Box overflowX="auto">
      <svg width={svgW} height={svgH} style={{ fontFamily: 'system-ui, sans-serif' }}>
        {cols.map((c, ci) => (
          <text key={c} x={nameW + ci * cellW + cellW / 2} y={headerH - 8} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#4A5568">{c}</text>
        ))}
        <text x={4} y={headerH - 8} fontSize={9} fontWeight="bold" fill="#4A5568">Indicator</text>
        <line x1={0} y1={headerH} x2={svgW} y2={headerH} stroke="#CBD5E0" />

        {rows.map((r, ri) => {
          const y = headerH + ri * rowH;
          const cells: string[] = [
            String(r.total_images),
            r.fg_coverage_pct != null ? `${r.fg_coverage_pct.toFixed(0)}` : '—',
            r.mg_coverage_pct != null ? `${r.mg_coverage_pct.toFixed(0)}` : '—',
            r.bg_coverage_pct != null ? `${r.bg_coverage_pct.toFixed(0)}` : '—',
            r.is_normal == null ? '-' : r.is_normal ? 'Yes' : 'No',
            r.correlation_method,
          ];

          return (
            <g key={r.indicator_id}>
              {ri % 2 === 0 && <rect x={0} y={y} width={svgW} height={rowH} fill="#F7FAFC" />}
              <text x={4} y={y + rowH / 2 + 4} fontSize={9} fill="#2D3748" fontWeight="bold">{r.indicator_id}</text>
              {cells.map((val, ci) => (
                <text key={ci} x={nameW + ci * cellW + cellW / 2} y={y + rowH / 2 + 4}
                  textAnchor="middle" fontSize={9} fill="#4A5568">{val}</text>
              ))}
            </g>
          );
        })}
      </svg>
    </Box>
  );
}
