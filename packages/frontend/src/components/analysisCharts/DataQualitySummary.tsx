import {
  Card,
  CardBody,
  CardHeader,
  Heading,
  HStack,
  SimpleGrid,
  Box,
  Text,
  Badge,
  Tooltip,
  Icon,
} from '@chakra-ui/react';
import { ShieldCheck, AlertTriangle, Info } from 'lucide-react';
import type { ChartContext } from './ChartContext';

interface DataQualitySummaryProps {
  ctx: ChartContext;
  /** Free-text warning surfaced by the report-generation pipeline. */
  reportWarning?: string | null;
}

interface QualityCell {
  label: string;
  value: string;
  hint?: string;
  status: 'ok' | 'warn' | 'info';
}

function pickColorScheme(status: QualityCell['status']) {
  return status === 'ok' ? 'green' : status === 'warn' ? 'orange' : 'blue';
}

export function DataQualitySummary({ ctx, reportWarning }: DataQualitySummaryProps) {
  const {
    analysisMode,
    zoneSource,
    zoneAnalysisResult,
    globalIndicatorStats,
    dataQuality,
    imageRecords,
  } = ctx;

  if (!zoneAnalysisResult) return null;

  // ── Mode cell ─────────────────────────────────────────────────────────
  const modeLabel =
    analysisMode === 'zone_level'
      ? 'Zone-Level'
      : zoneSource === 'cluster'
        ? 'Sub-Zone (Clustered)'
        : 'Image-Level';
  const modeStatus: QualityCell['status'] = analysisMode === 'zone_level' ? 'ok' : 'warn';

  // ── Layer coverage cell ──────────────────────────────────────────────
  // Average FG/MG/BG coverage across indicators (treats undefined as 0).
  let avgLayerCoverage = 0;
  if (dataQuality.length > 0) {
    const total = dataQuality.reduce((acc, row) => {
      const fg = row.fg_coverage_pct ?? 0;
      const mg = row.mg_coverage_pct ?? 0;
      const bg = row.bg_coverage_pct ?? 0;
      return acc + (fg + mg + bg) / 3;
    }, 0);
    avgLayerCoverage = total / dataQuality.length;
  }
  const coverageStatus: QualityCell['status'] =
    avgLayerCoverage >= 80 ? 'ok' : avgLayerCoverage >= 50 ? 'warn' : 'info';

  // ── Indicators with NaN cell ─────────────────────────────────────────
  const totalIndicators = globalIndicatorStats.length;
  const indicatorsWithNan = globalIndicatorStats.filter((s) => {
    const fullStats = s.by_layer?.full;
    if (!fullStats) return true;
    return fullStats.Mean == null || fullStats.N == null || fullStats.N === 0;
  }).length;
  const nanStatus: QualityCell['status'] =
    indicatorsWithNan === 0 ? 'ok' : indicatorsWithNan <= totalIndicators * 0.2 ? 'warn' : 'info';

  // ── Images analyzed cell ─────────────────────────────────────────────
  const uniqueImages = new Set(imageRecords.map((r) => r.image_id)).size;

  const cells: QualityCell[] = [
    {
      label: 'Analysis Mode',
      value: modeLabel,
      hint:
        analysisMode === 'zone_level'
          ? 'Cross-zone z-scores active'
          : 'Single zone — falling back to image-level statistics',
      status: modeStatus,
    },
    {
      label: 'Avg Layer Coverage',
      value: dataQuality.length > 0 ? `${avgLayerCoverage.toFixed(0)}%` : '—',
      hint: 'Mean of FG/MG/BG mask coverage across indicators',
      status: coverageStatus,
    },
    {
      label: 'Indicators OK',
      value:
        totalIndicators > 0 ? `${totalIndicators - indicatorsWithNan}/${totalIndicators}` : '—',
      hint:
        indicatorsWithNan > 0
          ? `${indicatorsWithNan} indicator(s) have NaN means in the full layer`
          : 'All indicators produced valid means',
      status: nanStatus,
    },
    {
      label: 'Images Analyzed',
      value: uniqueImages > 0 ? uniqueImages.toLocaleString() : '—',
      hint: 'Unique images contributing to image-level statistics',
      status: 'info',
    },
  ];

  const overallStatus: QualityCell['status'] = reportWarning
    ? 'warn'
    : cells.some((c) => c.status === 'warn')
      ? 'warn'
      : 'ok';

  return (
    <Card mb={6} borderColor={overallStatus === 'ok' ? 'green.200' : 'orange.200'} borderWidth={1}>
      <CardHeader pb={2}>
        <HStack justify="space-between">
          <HStack spacing={2}>
            <Icon
              as={overallStatus === 'ok' ? ShieldCheck : AlertTriangle}
              color={overallStatus === 'ok' ? 'green.500' : 'orange.500'}
              boxSize={5}
            />
            <Heading size="sm">Data Quality Summary</Heading>
          </HStack>
          <Badge colorScheme={overallStatus === 'ok' ? 'green' : 'orange'} variant="subtle">
            {overallStatus === 'ok' ? 'Looks good' : 'Caveats below'}
          </Badge>
        </HStack>
      </CardHeader>
      <CardBody pt={2}>
        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
          {cells.map((c) => (
            <Tooltip key={c.label} label={c.hint} placement="top" hasArrow>
              <Box>
                <Text fontSize="xs" color="gray.500">
                  {c.label}
                </Text>
                <HStack spacing={2} align="baseline">
                  <Text fontWeight="bold" fontSize="md">
                    {c.value}
                  </Text>
                  <Badge size="sm" colorScheme={pickColorScheme(c.status)} variant="subtle">
                    {c.status === 'ok' ? 'OK' : c.status === 'warn' ? 'Watch' : 'Info'}
                  </Badge>
                </HStack>
              </Box>
            </Tooltip>
          ))}
        </SimpleGrid>
        {reportWarning && (
          <HStack mt={3} spacing={2} align="start">
            <Icon as={Info} color="orange.500" mt={0.5} />
            <Text fontSize="xs" color="orange.700">
              {reportWarning}
            </Text>
          </HStack>
        )}
      </CardBody>
    </Card>
  );
}
