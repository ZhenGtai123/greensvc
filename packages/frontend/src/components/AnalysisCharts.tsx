import { useMemo } from 'react';
import { Box, Text, SimpleGrid } from '@chakra-ui/react';
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
  ScatterChart,
  Scatter,
  ZAxis,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts';
import type { EnrichedZoneStat, ZoneDiagnostic, ArchetypeProfile, UploadedImage } from '../types';

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
          formatter={(value: number, name: string) => [
            value,
            name === 'mean_abs_z' ? 'Mean |Z-score|' : 'Points',
          ]}
        />
        <Bar dataKey="mean_abs_z" name="Mean |Z-score|" barSize={20}>
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
}

function corrColor(val: number): string {
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

export function CorrelationHeatmap({ corr, pval, indicators }: CorrelationHeatmapProps) {
  const n = indicators.length;
  const cellSize = Math.max(36, Math.min(48, 400 / Math.max(n, 1)));
  const labelWidth = 100;
  const labelHeight = 100;

  if (n === 0) return null;

  const svgWidth = labelWidth + n * cellSize;
  const svgHeight = labelHeight + n * cellSize;

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
            fontSize={10}
            transform={`rotate(-45, ${labelWidth + col * cellSize + cellSize / 2}, ${labelHeight - 6})`}
          >
            {ind.length > 10 ? ind.slice(0, 10) + '…' : ind}
          </text>
        ))}

        {/* Row labels (left) + cells */}
        {indicators.map((row, ri) => (
          <g key={`row-${row}`}>
            <text
              x={labelWidth - 6}
              y={labelHeight + ri * cellSize + cellSize / 2 + 4}
              textAnchor="end"
              fontSize={10}
            >
              {row.length > 10 ? row.slice(0, 10) + '…' : row}
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
                    fill={val != null ? corrColor(val) : '#EDF2F7'}
                    stroke="#E2E8F0"
                    strokeWidth={0.5}
                  >
                    <title>{`${row} × ${col}: ${val != null ? val.toFixed(3) : '-'}${stars ? ` (p${stars})` : ''}`}</title>
                  </rect>
                  <text
                    x={labelWidth + ci * cellSize + (cellSize - 2) / 2}
                    y={labelHeight + ri * cellSize + (cellSize - 2) / 2 + 4}
                    textAnchor="middle"
                    fontSize={9}
                    fill={val != null && Math.abs(val) > 0.6 ? '#fff' : '#2D3748'}
                    pointerEvents="none"
                  >
                    {val != null ? val.toFixed(2) : '-'}
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

        {/* Color legend */}
        <g transform={`translate(${labelWidth}, ${svgHeight - 16})`}>
          <rect width={12} height={12} fill="rgba(229, 62, 62, 0.85)" rx={2} />
          <text x={16} y={10} fontSize={9} fill="#4A5568">-1</text>
          <rect x={40} width={12} height={12} fill="rgba(160, 174, 192, 0.2)" rx={2} />
          <text x={56} y={10} fontSize={9} fill="#4A5568">0</text>
          <rect x={72} width={12} height={12} fill="rgba(49, 130, 206, 0.85)" rx={2} />
          <text x={88} y={10} fontSize={9} fill="#4A5568">+1</text>
        </g>
      </svg>
    </Box>
  );
}

// ─── Z-Score Heatmap (Zone × Indicator) — v6.0 descriptive ─────────────────

function zScoreCellColor(z: number): string {
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
}

export function PriorityHeatmap({ diagnostics, layer = 'full' }: PriorityHeatmapProps) {
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
  const labelW = 120;
  const labelH = 90;
  const svgW = labelW + indicators.length * cellW;
  const svgH = labelH + zones.length * cellH + 30;

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
            fontSize={9}
            transform={`rotate(-45, ${labelW + ci * cellW + cellW / 2}, ${labelH - 6})`}
          >
            {ind.length > 12 ? ind.slice(0, 12) + '...' : ind}
          </text>
        ))}
        {/* Rows */}
        {zones.map((zone, ri) => (
          <g key={zone}>
            <text x={labelW - 6} y={labelH + ri * cellH + cellH / 2 + 4} textAnchor="end" fontSize={10}>
              {zone.length > 14 ? zone.slice(0, 14) + '...' : zone}
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
                    fill={zScoreCellColor(zs)}
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
        {/* Legend */}
        <g transform={`translate(${labelW}, ${svgH - 22})`}>
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
        <Tooltip formatter={(v: number, name: string) => [v.toFixed(3), name]} />
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

export function IndicatorDeepDive({ stats, indicatorId, indicatorName, unit, targetDirection }: IndicatorDeepDiveProps) {
  const derived = useMemo(() => {
    const indStats = stats.filter(s => s.indicator_id === indicatorId);
    if (indStats.length === 0) return null;

    // Unique zones (preserve first-seen name)
    const seen = new Map<string, string>();
    for (const s of indStats) if (!seen.has(s.zone_id)) seen.set(s.zone_id, s.zone_name);
    const zoneList = Array.from(seen.entries()).map(([id, name]) => ({ id, name }));

    const getVal = (zId: string, layer: string): number | null => {
      const rec = indStats.find(s => s.zone_id === zId && s.layer === layer);
      return rec?.mean != null ? rec.mean : null;
    };

    // Bar charts per layer
    const barCharts = DD_LAYERS.map(layer => {
      const entries = zoneList
        .map(z => ({ name: z.name, value: getVal(z.id, layer) }))
        .filter(e => e.value != null) as { name: string; value: number }[];
      entries.sort((a, b) => b.value - a.value);
      const maxV = entries.length > 0 ? Math.max(...entries.map(e => e.value)) : 0;
      const minV = entries.length > 0 ? Math.min(...entries.map(e => e.value)) : 0;
      return { layer, entries, maxV, minV };
    });

    // Zone × Layer heatmap matrix
    const matrix = zoneList.map(z => ({
      zoneName: z.name,
      values: DD_LAYERS.map(l => getVal(z.id, l)),
    }));
    const allHmVals = matrix.flatMap(r => r.values.filter((v): v is number => v != null));
    const hmMin = allHmVals.length > 0 ? Math.min(...allHmVals) : 0;
    const hmMax = allHmVals.length > 0 ? Math.max(...allHmVals) : 1;

    // Layer statistics (aggregated across zones)
    const layerStats = DD_LAYERS.map(layer => {
      const vals = zoneList.map(z => getVal(z.id, layer)).filter((v): v is number => v != null);
      if (vals.length === 0) return { layer, n: 0, mean: 0, std: 0, cv: 0 };
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
      const std = Math.sqrt(variance);
      const cv = mean !== 0 ? (std / Math.abs(mean)) * 100 : 0;
      return { layer, n: vals.length, mean, std, cv };
    });

    return { barCharts, matrix, hmMin, hmMax, layerStats };
  }, [stats, indicatorId]);

  if (!derived) return null;
  const { barCharts, matrix, hmMin, hmMax, layerStats } = derived;
  const hmRange = hmMax - hmMin || 1;

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
            {targetDirection ? `Direction: ${targetDirection} (informational)` : ''}
          </Text>
        )}
      </Box>

      {/* Top row: 4 horizontal zone bar charts, one per layer */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={2} mb={3}>
        {barCharts.map(bc => (
          <Box key={bc.layer}>
            <Text fontSize="xs" fontWeight="bold" mb={1} textAlign="center" color={DD_LAYER_COLORS[bc.layer]}>
              {DD_LAYER_LABELS[bc.layer]}
            </Text>
            {bc.entries.length === 0 ? (
              <Box h="80px" display="flex" alignItems="center" justifyContent="center" bg="gray.50" borderRadius="md">
                <Text fontSize="xs" color="gray.400">No data</Text>
              </Box>
            ) : (() => {
              const svgW = 220;
              const rowH = 16;
              const svgH = bc.entries.length * rowH + 10;
              const labelW = 70;
              const barAreaW = svgW - labelW - 44;
              const range = bc.maxV - bc.minV || 1;
              return (
                <svg width={svgW} height={svgH} style={{ fontFamily: 'system-ui, sans-serif' }}>
                  {bc.entries.map((e, i) => {
                    const w = ((e.value - bc.minV) / range) * barAreaW;
                    const y = i * rowH + 3;
                    const t = range > 0 ? (e.value - bc.minV) / range : 0.5;
                    return (
                      <g key={i}>
                        <text x={labelW - 4} y={y + rowH * 0.7} fontSize={9} textAnchor="end" fill="#4A5568">
                          {e.name.length > 10 ? e.name.slice(0, 10) + '…' : e.name}
                        </text>
                        <rect x={labelW} y={y + 1} width={Math.max(w, 1)} height={rowH - 4} fill={viridisColor(t)} rx={1} />
                        <text x={labelW + w + 3} y={y + rowH * 0.7} fontSize={8} fill="#718096">
                          {e.value.toFixed(2)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
          </Box>
        ))}
      </SimpleGrid>

      {/* Bottom row: Zone × Layer heatmap | Layer Stats | BoxPlot */}
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
        {/* Zone × Layer Heatmap */}
        <Box>
          <Text fontSize="xs" fontWeight="bold" mb={1}>Zone × Layer ({unit || 'value'})</Text>
          {(() => {
            const cellW = 42;
            const cellH = 22;
            const labelW = 85;
            const headerH = 18;
            const svgW = labelW + DD_LAYERS.length * cellW + 4;
            const svgH = headerH + matrix.length * cellH + 4;
            return (
              <Box overflowX="auto">
                <svg width={svgW} height={svgH} style={{ fontFamily: 'system-ui, sans-serif' }}>
                  {DD_LAYERS.map((l, j) => (
                    <text key={l} x={labelW + (j + 0.5) * cellW} y={13} fontSize={9} textAnchor="middle" fill="#2D3748" fontWeight="bold">
                      {DD_LAYER_LABELS[l]}
                    </text>
                  ))}
                  {matrix.map((row, i) => (
                    <g key={i}>
                      <text x={labelW - 4} y={headerH + (i + 0.65) * cellH} fontSize={9} textAnchor="end" fill="#4A5568">
                        {row.zoneName.length > 12 ? row.zoneName.slice(0, 12) + '…' : row.zoneName}
                      </text>
                      {row.values.map((v, j) => {
                        const t = v != null ? (v - hmMin) / hmRange : 0;
                        return (
                          <g key={j}>
                            <rect
                              x={labelW + j * cellW}
                              y={headerH + i * cellH}
                              width={cellW}
                              height={cellH}
                              fill={v != null ? viridisColor(t) : '#F7FAFC'}
                              stroke="#fff"
                              strokeWidth={0.5}
                            />
                            {v != null && (
                              <text
                                x={labelW + (j + 0.5) * cellW}
                                y={headerH + i * cellH + cellH * 0.65}
                                fontSize={8}
                                textAnchor="middle"
                                fill={t > 0.55 ? '#1A202C' : '#FFFFFF'}
                                fontWeight="bold"
                              >
                                {v.toFixed(2)}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  ))}
                </svg>
              </Box>
            );
          })()}
        </Box>

        {/* Layer Statistics */}
        <Box>
          <Text fontSize="xs" fontWeight="bold" mb={1}>Layer Statistics</Text>
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
                  <Box as="td" px={2} py={1} textAlign="right">{ls.mean.toFixed(3)}</Box>
                  <Box as="td" px={2} py={1} textAlign="right">{ls.std.toFixed(3)}</Box>
                  <Box as="td" px={2} py={1} textAlign="right">{ls.cv.toFixed(1)}</Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {/* BoxPlot */}
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
          <linearGradient id="spatialGrad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={valColor(vMin)} />
            <stop offset="100%" stopColor={valColor(vMax)} />
          </linearGradient>
        </defs>
        <rect x={margin.l + plotW - 120} y={margin.t + 5} width={100} height={10} fill="url(#spatialGrad)" rx={2} />
        <text x={margin.l + plotW - 122} y={margin.t + 14} textAnchor="end" fontSize={8} fill="#718096">{vMin.toFixed(2)}</text>
        <text x={margin.l + plotW - 18} y={margin.t + 14} textAnchor="start" fontSize={8} fill="#718096">{vMax.toFixed(2)}</text>
      </svg>
    </Box>
  );
}


// ─── Per-Indicator Spatial Scatter by Layer (Fig 7: 2x2 grid) ──────────────

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

export function SpatialScatterByLayer({ gpsImages, indicatorId }: SpatialScatterByLayerProps) {
  const layerPoints = LAYER_DEFS.map(l => {
    const key = l.suffix ? `${indicatorId}${l.suffix}` : indicatorId;
    const points = gpsImages
      .filter(img => img.metrics_results[key] != null)
      .map(img => ({
        lat: img.latitude!,
        lng: img.longitude!,
        value: img.metrics_results[key]!,
        label: img.zone_id || img.filename,
      }));
    return { ...l, points };
  });

  // Shared color scale across all 4 layers for cross-layer comparability
  const allValues = layerPoints.flatMap(lp => lp.points.map(p => p.value));
  if (allValues.length === 0) return null;
  const vMin = Math.min(...allValues);
  const vMax = Math.max(...allValues);

  return (
    <Box>
      <Text fontSize="sm" fontWeight="bold" mb={2}>
        {indicatorId}: Spatial Distribution by Layer
      </Text>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
        {layerPoints.map(lp => (
          <Box key={lp.key}>
            <Text fontSize="xs" fontWeight="bold" mb={1} color="gray.600" textAlign="center">
              {lp.label} (n={lp.points.length})
            </Text>
            {lp.points.length > 0 ? (
              <SpatialScatterMap points={lp.points} vMin={vMin} vMax={vMax} compact />
            ) : (
              <Box h="260px" display="flex" alignItems="center" justifyContent="center" bg="gray.50" borderRadius="md">
                <Text fontSize="xs" color="gray.400">No data</Text>
              </Box>
            )}
          </Box>
        ))}
      </SimpleGrid>
    </Box>
  );
}


// ─── Cross-Indicator Spatial Maps (Fig 8) ──────────────────────────────────

interface CrossIndicatorSpatialMapsProps {
  gpsImages: UploadedImage[];
  indicatorIds: string[];
}

/** YlOrRd-ish gradient: yellow → orange → red. `t` in [0, 1]. */
function ylOrRdColor(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const stops = [
    [255, 255, 178], // yellow
    [253, 141, 60],  // orange
    [189, 0, 38],    // red
  ];
  const seg = clamped * (stops.length - 1);
  const i0 = Math.floor(seg);
  const i1 = Math.min(stops.length - 1, i0 + 1);
  const f = seg - i0;
  const r = Math.round(stops[i0][0] * (1 - f) + stops[i1][0] * f);
  const g = Math.round(stops[i0][1] * (1 - f) + stops[i1][1] * f);
  const b = Math.round(stops[i0][2] * (1 - f) + stops[i1][2] * f);
  return `rgb(${r},${g},${b})`;
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
        <circle key={i} cx={toX(p.lng)} cy={toY(p.lat)} r={3.5} fill={getColor(p)} stroke="#fff" strokeWidth={0.4} opacity={0.85}>
          <title>{`${p.label || ''} (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}): ${valueFn(p)}`}</title>
        </circle>
      ))}
      {mode === 'gradient' && (
        <>
          <defs>
            <linearGradient id={`ylOrRd-${points.length}`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor={ylOrRdColor(0)} />
              <stop offset="50%" stopColor={ylOrRdColor(0.5)} />
              <stop offset="100%" stopColor={ylOrRdColor(1)} />
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

export function CrossIndicatorSpatialMaps({ gpsImages, indicatorIds }: CrossIndicatorSpatialMapsProps) {
  const perLayer = useMemo(() => {
    return DD_LAYERS.map(layer => {
      // Compute mean/std per indicator across all points in this layer
      const indStats: Record<string, { mean: number; std: number }> = {};
      for (const ind of indicatorIds) {
        const key = layer === 'full' ? ind : `${ind}__${layer}`;
        const vals: number[] = [];
        for (const img of gpsImages) {
          const v = img.metrics_results[key];
          if (v != null) vals.push(v);
        }
        if (vals.length < 2) continue;
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
        const std = Math.sqrt(variance);
        if (std > 0) indStats[ind] = { mean, std };
      }

      // Per point: compute z-scores, mean_abs_z, most_distinctive
      const points: CrossPoint[] = [];
      for (const img of gpsImages) {
        if (img.latitude == null || img.longitude == null) continue;
        let sumAbsZ = 0;
        let count = 0;
        let bestInd = '';
        let bestAbsZ = -1;
        for (const ind of indicatorIds) {
          const stats = indStats[ind];
          if (!stats) continue;
          const key = layer === 'full' ? ind : `${ind}__${layer}`;
          const val = img.metrics_results[key];
          if (val == null) continue;
          const z = (val - stats.mean) / stats.std;
          const absZ = Math.abs(z);
          sumAbsZ += absZ;
          count++;
          if (absZ > bestAbsZ) { bestAbsZ = absZ; bestInd = ind; }
        }
        if (count === 0) continue;
        points.push({
          lat: img.latitude,
          lng: img.longitude,
          label: img.zone_id || img.filename,
          meanAbsZ: sumAbsZ / count,
          mostDistinctive: bestInd,
        });
      }

      return { layer, points };
    }).filter(l => l.points.length > 0);
  }, [gpsImages, indicatorIds]);

  if (perLayer.length === 0) return null;

  // Categorical color map for dominant indicators (consistent across layers)
  const allDominantInds = Array.from(
    new Set(perLayer.flatMap(l => l.points.map(p => p.mostDistinctive)))
  ).sort();
  const indColor: Record<string, string> = {};
  allDominantInds.forEach((ind, i) => { indColor[ind] = CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]; });

  return (
    <Box>
      {/* Shared legend for dominant indicators */}
      <Box mb={3} display="flex" flexWrap="wrap" gap={2}>
        <Text fontSize="xs" fontWeight="bold" color="gray.600" mr={1}>Dominant indicator:</Text>
        {allDominantInds.map(ind => (
          <Box key={ind} display="inline-flex" alignItems="center" gap={1}>
            <Box w="10px" h="10px" borderRadius="sm" bg={indColor[ind]} />
            <Text fontSize="xs" color="gray.600">{ind.replace('IND_', '')}</Text>
          </Box>
        ))}
      </Box>

      <Box display="flex" flexDirection="column" gap={4}>
        {perLayer.map(({ layer, points }) => (
          <Box key={layer}>
            <Text fontSize="sm" fontWeight="bold" color={DD_LAYER_COLORS[layer]} mb={1}>
              {DD_LAYER_LABELS[layer]} (n={points.length})
            </Text>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <Box>
                <Text fontSize="xs" textAlign="center" mb={1} color="gray.600">
                  Deviation from Average (Mean |Z|)
                </Text>
                {renderCrossScatter(
                  points,
                  'gradient',
                  p => ylOrRdColor(p.meanAbsZ / 2),  // matches notebook vmax=2
                  p => `Mean |Z| = ${p.meanAbsZ.toFixed(3)}`,
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
        ))}
      </Box>
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
        <Tooltip formatter={(v: number) => [v.toFixed(4), 'Silhouette']} />
        <ReferenceLine x={bestK} stroke="#805AD5" strokeDasharray="5 5" label={{ value: `K=${bestK}`, position: 'top', fontSize: 10, fill: '#805AD5' }} />
        <Line type="monotone" dataKey="silhouette" stroke="#3182CE" strokeWidth={2} dot={{ r: 4, fill: '#3182CE' }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
