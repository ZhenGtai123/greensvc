import { useMemo } from 'react';
import { Box, Text, Tooltip as ChakraTooltip } from '@chakra-ui/react';
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
} from 'recharts';
import type { EnrichedZoneStat, ZoneDiagnostic } from '../types';

// Shared color palette for zones
const ZONE_COLORS = [
  '#3182CE', '#38A169', '#D69E2E', '#E53E3E', '#805AD5',
  '#DD6B20', '#319795', '#D53F8C', '#2B6CB0', '#276749',
];

function getZoneColor(index: number): string {
  return ZONE_COLORS[index % ZONE_COLORS.length];
}

const STATUS_BAR_COLORS: Record<string, string> = {
  Critical: '#E53E3E',
  Poor: '#DD6B20',
  Moderate: '#D69E2E',
  Good: '#38A169',
};

function statusBarColor(status: string): string {
  for (const [key, color] of Object.entries(STATUS_BAR_COLORS)) {
    if (status.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return '#A0AEC0';
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
        <PolarAngleAxis dataKey="indicator" tick={{ fontSize: 11 }} />
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

// ─── Zone Priority Bar Chart ────────────────────────────────────────────────

interface ZonePriorityChartProps {
  diagnostics: ZoneDiagnostic[];
}

export function ZonePriorityChart({ diagnostics }: ZonePriorityChartProps) {
  const data = useMemo(() => {
    return [...diagnostics]
      .sort((a, b) => b.composite_zscore - a.composite_zscore)
      .map(d => ({
        zone: d.zone_name,
        composite_zscore: Number(d.composite_zscore?.toFixed(2) ?? 0),
        total_priority: d.total_priority,
        status: d.status,
      }));
  }, [diagnostics]);

  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 50)}>
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
            name === 'composite_zscore' ? 'Composite Z-score' : 'Total Priority',
          ]}
        />
        <Bar dataKey="composite_zscore" name="Composite Z-score" barSize={20}>
          {data.map((entry, i) => (
            <Cell key={i} fill={statusBarColor(entry.status)} />
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
  const cellSize = 48;
  const labelWidth = 80;
  const labelHeight = 80;
  const n = indicators.length;

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
            {ind.length > 12 ? ind.slice(0, 11) + '…' : ind}
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
              {row.length > 12 ? row.slice(0, 11) + '…' : row}
            </text>
            {indicators.map((col, ci) => {
              const val = corr[row]?.[col];
              const p = pval?.[row]?.[col];
              const stars = significanceStars(p);
              return (
                <ChakraTooltip
                  key={`${row}-${col}`}
                  label={`${row} × ${col}: ${val != null ? val.toFixed(3) : '-'}${stars ? ` (p${stars})` : ''}`}
                  fontSize="xs"
                >
                  <g>
                    <rect
                      x={labelWidth + ci * cellSize}
                      y={labelHeight + ri * cellSize}
                      width={cellSize - 2}
                      height={cellSize - 2}
                      rx={3}
                      fill={val != null ? corrColor(val) : '#EDF2F7'}
                      stroke="#E2E8F0"
                      strokeWidth={0.5}
                    />
                    <text
                      x={labelWidth + ci * cellSize + (cellSize - 2) / 2}
                      y={labelHeight + ri * cellSize + (cellSize - 2) / 2 + 4}
                      textAnchor="middle"
                      fontSize={9}
                      fill={val != null && Math.abs(val) > 0.6 ? '#fff' : '#2D3748'}
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
                      >
                        {stars}
                      </text>
                    )}
                  </g>
                </ChakraTooltip>
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
        <XAxis dataKey="indicator" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
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
