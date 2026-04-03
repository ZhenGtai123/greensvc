import { useMemo } from 'react';
import { Box, Text } from '@chakra-ui/react';
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
import type { EnrichedZoneStat, ZoneDiagnostic, ArchetypeProfile } from '../types';

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
}

export function SpatialScatterMap({ points, indicatorId }: SpatialScatterMapProps) {
  if (!points || points.length === 0) return null;

  const vals = points.map(p => p.value);
  const vMin = Math.min(...vals);
  const vMax = Math.max(...vals);
  const vRange = vMax - vMin || 1;

  const svgW = 500;
  const svgH = 400;
  const margin = { l: 60, r: 20, t: 20, b: 50 };
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
          <circle key={i} cx={toX(p.lng)} cy={toYPos(p.lat)} r={5} fill={valColor(p.value)} stroke="#fff" strokeWidth={0.5} opacity={0.85}>
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
