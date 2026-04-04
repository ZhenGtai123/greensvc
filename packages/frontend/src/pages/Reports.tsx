import { useMemo, useCallback, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Box,
  Heading,
  Button,
  VStack,
  HStack,
  SimpleGrid,
  Card,
  CardHeader,
  CardBody,
  Text,
  Badge,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Alert,
  AlertIcon,
  Divider,
  Wrap,
  WrapItem,
  Tag,
  TagLabel,
  Icon,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  TabPanels,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Tooltip,
} from '@chakra-ui/react';
import { Download, FileText, FileImage, CheckCircle, AlertTriangle, Sparkles, RefreshCw } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { generateReport } from '../utils/generateReport';
import { useGenerateReport, useRunDesignStrategies, useRunClustering } from '../hooks/useApi';
import useAppToast from '../hooks/useAppToast';
import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import {
  RadarProfileChart,
  ZonePriorityChart,
  CorrelationHeatmap,
  IndicatorComparisonChart,
  PriorityHeatmap,
  DescriptiveStatsChart,
  ZScoreHeatmap,
  ArchetypeRadarChart,
  ClusterSizeChart,
  SpatialScatterByLayer,
  SilhouetteCurve,
  IndicatorDeepDive,
  CrossIndicatorSpatialMaps,
  Dendrogram,
  ClusterSpatialBeforeAfter,
} from '../components/AnalysisCharts';
import type { ReportRequest, EnrichedZoneStat, ZoneDiagnostic, ZoneDesignOutput, ClusteringResponse } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LAYERS = ['full', 'foreground', 'middleground', 'background'];
const LAYER_LABELS: Record<string, string> = { full: 'Full', foreground: 'FG', middleground: 'MG', background: 'BG' };
// v6.0: deviation-based coloring (purely descriptive)
function deviationBgColor(meanAbsZ: number): string {
  if (meanAbsZ >= 1.5) return 'red.50';
  if (meanAbsZ >= 1.0) return 'orange.50';
  if (meanAbsZ >= 0.5) return 'yellow.50';
  return 'green.50';
}

function deviationColorScheme(meanAbsZ: number): string {
  if (meanAbsZ >= 1.5) return 'red';
  if (meanAbsZ >= 1.0) return 'orange';
  if (meanAbsZ >= 0.5) return 'yellow';
  return 'green';
}

function formatNum(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return '-';
  return v.toFixed(decimals);
}

function significanceStars(p: number | undefined): string {
  if (p === undefined || p === null) return '';
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

// ---------------------------------------------------------------------------
// Simple markdown renderer (no external dependency)
// ---------------------------------------------------------------------------

function renderMarkdown(md: string) {
  const lines = md.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      elements.push(<Heading key={i} size="sm" mt={4} mb={2}>{line.slice(4)}</Heading>);
    } else if (line.startsWith('## ')) {
      elements.push(<Heading key={i} size="md" mt={5} mb={2} borderBottom="1px solid" borderColor="gray.200" pb={1}>{line.slice(3)}</Heading>);
    } else if (line.startsWith('# ')) {
      elements.push(<Heading key={i} size="lg" mt={6} mb={3}>{line.slice(2)}</Heading>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <Text key={i} fontSize="sm" pl={4} position="relative" _before={{ content: '"•"', position: 'absolute', left: '4px' }}>
          {line.slice(2)}
        </Text>
      );
    } else if (line.startsWith('> ')) {
      elements.push(
        <Box key={i} borderLeft="3px solid" borderColor="blue.300" pl={3} py={1} my={1} bg="blue.50" borderRadius="sm">
          <Text fontSize="sm" fontStyle="italic">{line.slice(2)}</Text>
        </Box>
      );
    } else if (line.startsWith('|') && line.includes('|')) {
      // Collect table rows
      const tableRows: string[] = [line];
      while (i + 1 < lines.length && lines[i + 1].startsWith('|')) {
        i++;
        tableRows.push(lines[i]);
      }
      const dataRows = tableRows.filter(r => !r.match(/^\|[\s-:|]+\|$/));
      if (dataRows.length > 0) {
        const headers = dataRows[0].split('|').filter(c => c.trim()).map(c => c.trim());
        const body = dataRows.slice(1).map(r => r.split('|').filter(c => c.trim()).map(c => c.trim()));
        elements.push(
          <Box key={i} overflowX="auto" my={2} maxW="100%">
            <Table size="sm" variant="simple" w="auto">
              <Thead><Tr>{headers.map((h, hi) => <Th key={hi} fontSize="xs" whiteSpace="nowrap">{h}</Th>)}</Tr></Thead>
              <Tbody>
                {body.map((row, ri) => (
                  <Tr key={ri}>{row.map((cell, ci) => <Td key={ci} fontSize="xs">{cell}</Td>)}</Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        );
      }
    } else if (line.trim() === '') {
      elements.push(<Box key={i} h={2} />);
    } else {
      // Apply inline formatting
      const formatted = line
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>');
      elements.push(
        <Text key={i} fontSize="sm" dangerouslySetInnerHTML={{ __html: formatted }} sx={{ '& code': { bg: 'gray.100', px: 1, borderRadius: 'sm', fontFamily: 'mono', fontSize: 'xs' }, '& strong': { fontWeight: 'bold' } }} />
      );
    }
    i++;
  }

  return <VStack align="stretch" spacing={0} w="100%" minW={0} sx={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{elements}</VStack>;
}

// ---------------------------------------------------------------------------
// Reports Component
// ---------------------------------------------------------------------------

function Reports() {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const toast = useAppToast();

  const {
    currentProject,
    recommendations,
    selectedIndicators,
    indicatorRelationships,
    recommendationSummary,
    zoneAnalysisResult,
    designStrategyResult,
    pipelineResult,
    aiReport,
    setAiReport,
    aiReportMeta,
    setAiReportMeta,
  } = useAppStore();

  const projectName = currentProject?.project_name || pipelineResult?.project_name || 'Unknown Project';

  // Agent C report
  const generateReportMutation = useGenerateReport();

  // Clustering + retry strategies
  const clusteringMutation = useRunClustering();
  const designStrategiesMutation = useRunDesignStrategies();
  const [clusteringResult, setClusteringResult] = useState<ClusteringResponse | null>(null);

  // Layer tabs
  const [selectedLayer, setSelectedLayer] = useState(0);

  // Check if Stage 3 failed in pipeline
  const stage3Failed = pipelineResult?.steps?.some(s => s.step === 'design_strategies' && s.status === 'failed') ?? false;
  const stage3Error = stage3Failed
    ? pipelineResult?.steps?.find(s => s.step === 'design_strategies')?.detail ?? 'Unknown error'
    : null;

  const handleRetryStagе3 = useCallback(async () => {
    if (!zoneAnalysisResult) return;
    toast({ title: 'Retrying design strategies...', status: 'info', duration: 3000 });
    try {
      const result = await designStrategiesMutation.mutateAsync({
        zone_analysis: zoneAnalysisResult,
        use_llm: true,
      });
      useAppStore.getState().setDesignStrategyResult(result);
      toast({ title: 'Design strategies generated', status: 'success' });
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || 'Strategy generation failed'
        : 'Strategy generation failed';
      toast({ title: msg, status: 'error' });
    }
  }, [zoneAnalysisResult, designStrategiesMutation, toast]);

  const handleRunClustering = useCallback(async () => {
    if (!zoneAnalysisResult) return;
    try {
      const pointMetrics = zoneAnalysisResult.zone_statistics
        .filter(s => s.layer === 'full')
        .map(s => ({ zone_id: s.zone_id, zone_name: s.zone_name, indicator_id: s.indicator_id, value: s.mean }));
      const result = await clusteringMutation.mutateAsync({
        point_metrics: pointMetrics,
        indicator_definitions: zoneAnalysisResult.indicator_definitions,
        layer: 'full',
      });
      setClusteringResult(result);
      if (result.skipped) {
        toast({ title: `Clustering skipped: ${result.reason}`, status: 'info' });
      } else if (result.clustering) {
        useAppStore.getState().setZoneAnalysisResult({
          ...zoneAnalysisResult,
          clustering: result.clustering,
          segment_diagnostics: result.segment_diagnostics,
        });
        toast({ title: `${result.clustering.k} archetypes found (silhouette: ${result.clustering.silhouette_score.toFixed(2)})`, status: 'success' });
      }
    } catch {
      toast({ title: 'Clustering failed', status: 'error' });
    }
  }, [zoneAnalysisResult, clusteringMutation, toast]);

  const handleGenerateAiReport = useCallback(async () => {
    if (!zoneAnalysisResult) return;
    toast({ title: 'Generating AI report...', status: 'info', duration: 3000 });
    try {
      const request: ReportRequest = {
        zone_analysis: zoneAnalysisResult,
        design_strategies: designStrategyResult ?? undefined,
        stage1_recommendations: recommendations.length > 0 ? recommendations : undefined,
        project_context: currentProject ? {
          project: { name: currentProject.project_name, location: currentProject.project_location },
          context: {
            climate: { koppen_zone_id: currentProject.koppen_zone_id },
            urban_form: { space_type_id: currentProject.space_type_id, lcz_type_id: currentProject.lcz_type_id },
            user: { age_group_id: currentProject.age_group_id },
          },
          performance_query: {
            design_brief: currentProject.design_brief,
            dimensions: currentProject.performance_dimensions,
          },
        } : undefined,
        format: 'markdown',
      };
      const result = await generateReportMutation.mutateAsync(request);
      setAiReport(result.content);
      setAiReportMeta(result.metadata);
      toast({ title: `AI report generated — ${result.metadata.word_count || '?'} words`, status: 'success' });
    } catch {
      toast({ title: 'AI report generation failed', status: 'error' });
    }
  }, [zoneAnalysisResult, designStrategyResult, recommendations, currentProject, generateReportMutation, toast]);

  // Completion status
  const hasVision = (currentProject?.uploaded_images?.length ?? 0) > 0;
  const hasIndicators = recommendations.length > 0;
  const hasAnalysis = zoneAnalysisResult !== null;
  const hasDesign = designStrategyResult !== null || pipelineResult?.design_strategies !== null && pipelineResult?.design_strategies !== undefined;
  const isEmpty = !hasIndicators && !hasAnalysis && !hasDesign;

  const steps = [
    { name: 'Vision', done: hasVision },
    { name: 'Indicators', done: hasIndicators },
    { name: 'Analysis', done: hasAnalysis },
    { name: 'Design', done: hasDesign },
  ];
  const completedSteps = steps.filter(s => s.done).length;

  // Derived data
  const sortedDiagnostics = useMemo(() => {
    if (!zoneAnalysisResult) return [];
    return [...zoneAnalysisResult.zone_diagnostics].sort((a, b) => b.mean_abs_z - a.mean_abs_z);
  }, [zoneAnalysisResult]);

  const filteredStats = useMemo(() => {
    if (!zoneAnalysisResult) return [];
    const layer = LAYERS[selectedLayer];
    return zoneAnalysisResult.zone_statistics.filter(s => s.layer === layer);
  }, [zoneAnalysisResult, selectedLayer]);

  const correlationData = useMemo(() => {
    if (!zoneAnalysisResult) return null;
    const layer = LAYERS[selectedLayer];
    const corr = zoneAnalysisResult.correlation_by_layer?.[layer];
    const pval = zoneAnalysisResult.pvalue_by_layer?.[layer];
    if (!corr) return null;
    return { indicators: Object.keys(corr), corr, pval };
  }, [zoneAnalysisResult, selectedLayer]);

  // Downloads
  const handleDownloadMarkdown = () => {
    if (!zoneAnalysisResult) return;
    const md = generateReport({
      projectName,
      pipelineResult,
      zoneResult: zoneAnalysisResult,
      designResult: designStrategyResult,
      radarProfiles: zoneAnalysisResult.radar_profiles ?? null,
      correlationByLayer: zoneAnalysisResult.correlation_by_layer ?? null,
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}_report.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Report downloaded', status: 'success' });
  };

  const handleExportJson = () => {
    const data = {
      project_name: projectName,
      exported_at: new Date().toISOString(),
      recommendations,
      selected_indicators: selectedIndicators,
      zone_analysis: zoneAnalysisResult,
      design_strategies: designStrategyResult,
      pipeline_result: pipelineResult,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}_data.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'JSON exported', status: 'success' });
  };

  const handleDownloadAiReportPdf = useCallback(async () => {
    if (!aiReport) return;
    toast({ title: 'Generating PDF...', status: 'info', duration: 2000 });
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const margin = 15;
      const pageW = 210 - margin * 2;
      const pageH = 297 - margin * 2;
      let y = margin;

      const addText = (text: string, size: number, style: 'normal' | 'bold' = 'normal') => {
        pdf.setFontSize(size);
        pdf.setFont('helvetica', style);
        const lines = pdf.splitTextToSize(text, pageW);
        for (const line of lines) {
          if (y + size * 0.4 > margin + pageH) {
            pdf.addPage();
            y = margin;
          }
          pdf.text(line, margin, y);
          y += size * 0.45;
        }
      };

      for (const line of aiReport.split('\n')) {
        if (line.startsWith('### ')) {
          y += 2;
          addText(line.slice(4), 12, 'bold');
          y += 1;
        } else if (line.startsWith('## ')) {
          y += 3;
          addText(line.slice(3), 14, 'bold');
          y += 1;
        } else if (line.startsWith('# ')) {
          y += 4;
          addText(line.slice(2), 16, 'bold');
          y += 2;
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          addText(`  \u2022 ${line.slice(2)}`, 10);
        } else if (line.trim() === '') {
          y += 3;
        } else {
          // Strip markdown bold/italic for PDF
          const clean = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1');
          addText(clean, 10);
        }
      }

      pdf.save(`${projectName.replace(/\s+/g, '_')}_ai_report.pdf`);
      toast({ title: 'PDF downloaded', status: 'success' });
    } catch {
      toast({ title: 'PDF generation failed', status: 'error' });
    }
  }, [aiReport, projectName, toast]);

  return (
    <PageShell>
      <PageHeader title="Results & Report">
        <HStack spacing={2}>
          <Button size="sm" leftIcon={<Download size={14} />} onClick={handleDownloadMarkdown} isDisabled={!hasAnalysis} colorScheme="blue">
            MD
          </Button>
          <Button size="sm" leftIcon={<FileText size={14} />} onClick={handleExportJson} isDisabled={isEmpty}>
            JSON
          </Button>
        </HStack>
      </PageHeader>

      {isEmpty ? (
        <EmptyState
          icon={AlertTriangle}
          title="No results yet"
          description="Run the analysis pipeline first, then come back here to view results and generate reports."
        />
      ) : (
        <Box>
          {/* Pipeline Overview */}
          <Card mb={6}>
            <CardHeader>
              <HStack justify="space-between">
                <Heading size="md">Pipeline Overview</Heading>
                <Text fontSize="sm" color="gray.500">{completedSteps}/{steps.length} steps</Text>
              </HStack>
            </CardHeader>
            <CardBody>
              <HStack spacing={4} flexWrap="wrap" mb={3}>
                {steps.map(s => (
                  <HStack key={s.name} spacing={1}>
                    <Icon as={s.done ? CheckCircle : AlertTriangle} color={s.done ? 'green.500' : 'gray.400'} boxSize={4} />
                    <Text fontSize="sm" color={s.done ? 'green.600' : 'gray.500'}>{s.name}</Text>
                  </HStack>
                ))}
              </HStack>
              {pipelineResult && (
                <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
                  <Box><Text fontSize="xs" color="gray.500">Images</Text><Text fontWeight="bold">{pipelineResult.zone_assigned_images}/{pipelineResult.total_images}</Text></Box>
                  <Box><Text fontSize="xs" color="gray.500">Calculations</Text><Text fontWeight="bold" color="green.600">{pipelineResult.calculations_succeeded} OK</Text></Box>
                  <Box><Text fontSize="xs" color="gray.500">Zone Stats</Text><Text fontWeight="bold">{pipelineResult.zone_statistics_count}</Text></Box>
                  <Box><Text fontSize="xs" color="gray.500">Zones</Text><Text fontWeight="bold">{sortedDiagnostics.length}</Text></Box>
                </SimpleGrid>
              )}
            </CardBody>
          </Card>

          {/* AI Report Section — always visible when analysis exists */}
          {hasAnalysis && (
            <Card mb={6} borderColor={aiReport ? 'purple.300' : 'gray.200'} borderWidth={aiReport ? 2 : 1} overflow="hidden">
              <CardHeader>
                <VStack align="stretch" spacing={3}>
                  <HStack spacing={2}>
                    <Icon as={Sparkles} color="purple.500" boxSize={5} />
                    <Heading size="md">AI Report</Heading>
                    {!aiReport && <Badge colorScheme="gray" variant="subtle">Not generated</Badge>}
                    {aiReportMeta && (
                      <Badge colorScheme="purple" variant="subtle">
                        {String(aiReportMeta.word_count || '?')} words
                      </Badge>
                    )}
                  </HStack>
                  <HStack spacing={2} flexWrap="wrap">
                    <Button
                      size="sm"
                      leftIcon={<Sparkles size={14} />}
                      onClick={handleGenerateAiReport}
                      isLoading={generateReportMutation.isPending}
                      loadingText="Generating..."
                      colorScheme="purple"
                    >
                      {aiReport ? 'Regenerate' : 'Generate AI Report'}
                    </Button>
                    {aiReport && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => {
                          const blob = new Blob([aiReport], { type: 'text/markdown' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${projectName.replace(/\s+/g, '_')}_ai_report.md`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}>
                          Download MD
                        </Button>
                        <Button size="sm" colorScheme="green" variant="outline" leftIcon={<FileImage size={12} />} onClick={handleDownloadAiReportPdf}>
                          Download PDF
                        </Button>
                      </>
                    )}
                  </HStack>
                </VStack>
              </CardHeader>
              {aiReport && (
                <CardBody pt={0}>
                  <Box maxH="70vh" overflowY="auto" p={4} bg="white" borderRadius="md" border="1px solid" borderColor="gray.100">
                    {renderMarkdown(aiReport)}
                  </Box>
                </CardBody>
              )}
            </Card>
          )}

          {/* Main Tabs */}
          <Tabs colorScheme="blue" variant="enclosed" mb={6}>
            <TabList>
              <Tab>Diagnostics</Tab>
              <Tab>Statistics</Tab>
              {hasAnalysis && <Tab>Design Strategies {stage3Failed && <Badge colorScheme="red" ml={1} fontSize="2xs">failed</Badge>}</Tab>}
              <Tab>Indicators</Tab>
            </TabList>

            <TabPanels>
              {/* ── Tab: Diagnostics ── */}
              <TabPanel px={0}>
                {sortedDiagnostics.length > 0 && (
                  <VStack spacing={6} align="stretch">
                    {/* Zone Cards */}
                    <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing={4}>
                      {sortedDiagnostics.map((diag: ZoneDiagnostic) => (
                        <Card key={diag.zone_id} bg={deviationBgColor(diag.mean_abs_z)}>
                          <CardBody>
                            <VStack align="stretch" spacing={2}>
                              <HStack justify="space-between">
                                <HStack spacing={1}>
                                  {diag.rank > 0 && <Badge colorScheme="purple" fontSize="xs">#{diag.rank}</Badge>}
                                  <Text fontWeight="bold" fontSize="sm" noOfLines={1}>{diag.zone_name}</Text>
                                </HStack>
                                <Badge colorScheme={deviationColorScheme(diag.mean_abs_z)}>|z|={diag.mean_abs_z?.toFixed(2) ?? '-'}</Badge>
                              </HStack>
                              <HStack justify="space-between"><Text fontSize="xs" color="gray.600">Mean |Z-score|</Text><Text fontWeight="bold">{diag.mean_abs_z?.toFixed(2) ?? '-'}</Text></HStack>
                              <HStack justify="space-between"><Text fontSize="xs" color="gray.600">Points</Text><Text fontWeight="bold">{diag.point_count}</Text></HStack>
                            </VStack>
                          </CardBody>
                        </Card>
                      ))}
                    </SimpleGrid>

                    {/* Charts */}
                    <Card>
                      <CardHeader><Heading size="sm">Zone Deviation Overview</Heading></CardHeader>
                      <CardBody><ZonePriorityChart diagnostics={sortedDiagnostics} /></CardBody>
                    </Card>

                    <Card>
                      <CardHeader><Heading size="sm">Priority Heatmap</Heading></CardHeader>
                      <CardBody><PriorityHeatmap diagnostics={sortedDiagnostics} layer="full" /></CardBody>
                    </Card>

                    {/* Z-Score Heatmaps (2x2 grid — one per layer, matches Stage2 Fig 2) */}
                    {zoneAnalysisResult && (
                      <Card>
                        <CardHeader><Heading size="sm">Z-Score Heatmaps by Layer</Heading></CardHeader>
                        <CardBody>
                          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                            {LAYERS.map(layer => (
                              <Box key={layer}>
                                <Text fontSize="sm" fontWeight="bold" mb={2} color="gray.600">
                                  {LAYER_LABELS[layer]} Layer
                                </Text>
                                <ZScoreHeatmap stats={zoneAnalysisResult.zone_statistics} layer={layer} />
                              </Box>
                            ))}
                          </SimpleGrid>
                        </CardBody>
                      </Card>
                    )}

                    {/* Spatial Distribution by Layer (Fig 7 — 2x2 grid per indicator) */}
                    {currentProject && (() => {
                      const gpsImages = currentProject.uploaded_images.filter(img => img.has_gps && img.latitude != null && img.longitude != null);
                      if (gpsImages.length === 0) return null;
                      // Get all indicator IDs that have metrics (any layer)
                      const indIds = Array.from(new Set(gpsImages.flatMap(img =>
                        Object.keys(img.metrics_results)
                          .filter(k => img.metrics_results[k] != null)
                          .map(k => k.split('__')[0])
                      ))).sort();
                      if (indIds.length === 0) return null;
                      return (
                        <>
                          <Card>
                            <CardHeader>
                              <HStack justify="space-between">
                                <Heading size="sm">Spatial Distribution by Layer (Fig 7)</Heading>
                                <Badge colorScheme="green">{gpsImages.length} GPS images</Badge>
                              </HStack>
                            </CardHeader>
                            <CardBody>
                              <VStack align="stretch" spacing={6}>
                                {indIds.map(ind => (
                                  <SpatialScatterByLayer key={ind} gpsImages={gpsImages} indicatorId={ind} />
                                ))}
                              </VStack>
                            </CardBody>
                          </Card>

                          <Card>
                            <CardHeader>
                              <Heading size="sm">Cross-Indicator Spatial Maps (Fig 8)</Heading>
                            </CardHeader>
                            <CardBody>
                              <CrossIndicatorSpatialMaps gpsImages={gpsImages} indicatorIds={indIds} />
                            </CardBody>
                          </Card>
                        </>
                      );
                    })()}

                    {/* Radar */}
                    {zoneAnalysisResult?.radar_profiles && Object.keys(zoneAnalysisResult.radar_profiles).length > 0 && (
                      <Card>
                        <CardHeader><Heading size="sm">Radar Profiles</Heading></CardHeader>
                        <CardBody><RadarProfileChart radarProfiles={zoneAnalysisResult.radar_profiles} /></CardBody>
                      </Card>
                    )}

                    {/* Clustering */}
                    <Card variant="outline">
                      <CardBody>
                        <HStack justify="space-between" flexWrap="wrap" gap={2}>
                          <VStack align="start" spacing={0}>
                            <Text fontWeight="bold" fontSize="sm">SVC Archetype Clustering</Text>
                            <Text fontSize="xs" color="gray.500">
                              Discover spatial archetypes via KMeans clustering (requires 20+ data points)
                            </Text>
                          </VStack>
                          <HStack>
                            {clusteringResult?.clustering && (
                              <Badge colorScheme="green">
                                k={clusteringResult.clustering.k} silhouette={clusteringResult.clustering.silhouette_score.toFixed(2)}
                              </Badge>
                            )}
                            {clusteringResult?.skipped && (
                              <Badge colorScheme="yellow">{clusteringResult.reason}</Badge>
                            )}
                            <Button
                              size="sm"
                              colorScheme="teal"
                              variant="outline"
                              onClick={handleRunClustering}
                              isLoading={clusteringMutation.isPending}
                            >
                              {clusteringResult?.clustering ? 'Re-run' : 'Run Clustering'}
                            </Button>
                          </HStack>
                        </HStack>
                        {clusteringResult?.clustering && clusteringResult.clustering.archetype_profiles.length > 0 && (
                          <Wrap spacing={2} mt={3}>
                            {clusteringResult.clustering.archetype_profiles.map(a => (
                              <WrapItem key={a.archetype_id}>
                                <Tag size="sm" colorScheme="teal" variant="subtle">
                                  <TagLabel>Archetype {a.archetype_id}: {a.archetype_label} ({a.point_count} pts)</TagLabel>
                                </Tag>
                              </WrapItem>
                            ))}
                          </Wrap>
                        )}
                      </CardBody>
                    </Card>

                    {/* Cluster Charts */}
                    {(clusteringResult?.clustering || zoneAnalysisResult?.clustering) && (() => {
                      const cl = clusteringResult?.clustering || zoneAnalysisResult?.clustering;
                      if (!cl || cl.archetype_profiles.length === 0) return null;
                      return (
                        <>
                          {cl.silhouette_scores && cl.silhouette_scores.length > 1 && (
                            <Card>
                              <CardHeader><Heading size="sm">Silhouette Score Curve</Heading></CardHeader>
                              <CardBody><SilhouetteCurve scores={cl.silhouette_scores} bestK={cl.k} /></CardBody>
                            </Card>
                          )}
                          {cl.dendrogram_linkage && cl.dendrogram_linkage.length > 0 && (
                            <Card>
                              <CardHeader><Heading size="sm">Ward Hierarchical Clustering</Heading></CardHeader>
                              <CardBody><Dendrogram linkage={cl.dendrogram_linkage} /></CardBody>
                            </Card>
                          )}
                          {cl.point_lats && cl.point_lats.length > 0 && cl.labels_raw && cl.labels_raw.length > 0 && (
                            <Card>
                              <CardHeader><Heading size="sm">Cluster Spatial Smoothing</Heading></CardHeader>
                              <CardBody>
                                <ClusterSpatialBeforeAfter
                                  lats={cl.point_lats}
                                  lngs={cl.point_lngs}
                                  labelsRaw={cl.labels_raw}
                                  labelsSmoothed={cl.labels_smoothed}
                                  archetypeLabels={Object.fromEntries(cl.archetype_profiles.map(a => [a.archetype_id, a.archetype_label]))}
                                />
                              </CardBody>
                            </Card>
                          )}
                          <Card>
                            <CardHeader><Heading size="sm">Archetype Radar Profiles</Heading></CardHeader>
                            <CardBody><ArchetypeRadarChart archetypes={cl.archetype_profiles} /></CardBody>
                          </Card>
                          <Card>
                            <CardHeader><Heading size="sm">Cluster Size Distribution</Heading></CardHeader>
                            <CardBody><ClusterSizeChart archetypes={cl.archetype_profiles} /></CardBody>
                          </Card>
                        </>
                      );
                    })()}
                  </VStack>
                )}
              </TabPanel>

              {/* ── Tab: Statistics ── */}
              <TabPanel px={0}>
                {hasAnalysis && (
                  <Tabs index={selectedLayer} onChange={setSelectedLayer} colorScheme="green" variant="soft-rounded" mb={4}>
                    <TabList>
                      {LAYERS.map(l => <Tab key={l}>{LAYER_LABELS[l]}</Tab>)}
                    </TabList>
                  </Tabs>
                )}

                {/* Descriptive Statistics */}
                {zoneAnalysisResult && filteredStats.length > 0 && (
                  <Card mb={6}>
                    <CardHeader><Heading size="sm">Descriptive Statistics — {LAYER_LABELS[LAYERS[selectedLayer]]}</Heading></CardHeader>
                    <CardBody><DescriptiveStatsChart stats={zoneAnalysisResult.zone_statistics} layer={LAYERS[selectedLayer]} /></CardBody>
                  </Card>
                )}

                {/* Indicator Comparison */}
                {zoneAnalysisResult && filteredStats.length > 0 && (
                  <Card mb={6}>
                    <CardHeader><Heading size="sm">Indicator Comparison — {LAYER_LABELS[LAYERS[selectedLayer]]}</Heading></CardHeader>
                    <CardBody><IndicatorComparisonChart stats={zoneAnalysisResult.zone_statistics} layer={LAYERS[selectedLayer]} /></CardBody>
                  </Card>
                )}

                {/* Statistics Table */}
                {filteredStats.length > 0 && (
                  <Card mb={6}>
                    <CardHeader><Heading size="sm">Zone Statistics — {LAYER_LABELS[LAYERS[selectedLayer]]}</Heading></CardHeader>
                    <CardBody p={0}>
                      <Box overflowX="auto">
                        <Table size="sm">
                          <Thead>
                            <Tr><Th>Zone</Th><Th>Indicator</Th><Th isNumeric>Mean</Th><Th isNumeric>Std</Th><Th isNumeric>Z-score</Th><Th isNumeric>Percentile</Th></Tr>
                          </Thead>
                          <Tbody>
                            {filteredStats.map((stat: EnrichedZoneStat, idx: number) => (
                              <Tr key={idx}>
                                <Td fontSize="xs">{stat.zone_name}</Td>
                                <Td fontSize="xs">{stat.indicator_id}</Td>
                                <Td isNumeric fontSize="xs">{formatNum(stat.mean)}</Td>
                                <Td isNumeric fontSize="xs">{formatNum(stat.std)}</Td>
                                <Td isNumeric fontSize="xs" color={stat.z_score != null ? (stat.z_score < 0 ? 'blue.600' : 'orange.600') : undefined} fontWeight={stat.z_score != null ? 'bold' : undefined}>
                                  {formatNum(stat.z_score)}
                                </Td>
                                <Td isNumeric fontSize="xs">{formatNum(stat.percentile, 0)}</Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </Box>
                    </CardBody>
                  </Card>
                )}

                {/* Correlation Matrix */}
                {correlationData && (
                  <>
                    <Card mb={6}>
                      <CardHeader><Heading size="sm">Correlation Matrix — {LAYER_LABELS[LAYERS[selectedLayer]]}</Heading></CardHeader>
                      <CardBody p={0}>
                        <Box overflowX="auto">
                          <Table size="sm">
                            <Thead>
                              <Tr>
                                <Th />
                                {correlationData.indicators.map(ind => (
                                  <Th key={ind} fontSize="xs" textAlign="center"><Tooltip label={ind}><Text noOfLines={1} maxW="60px">{ind}</Text></Tooltip></Th>
                                ))}
                              </Tr>
                            </Thead>
                            <Tbody>
                              {correlationData.indicators.map(row => (
                                <Tr key={row}>
                                  <Td fontSize="xs" fontWeight="bold"><Tooltip label={row}><Text noOfLines={1} maxW="80px">{row}</Text></Tooltip></Td>
                                  {correlationData.indicators.map(col => {
                                    const val = correlationData.corr[row]?.[col];
                                    const pval = correlationData.pval?.[row]?.[col];
                                    const stars = significanceStars(pval);
                                    const intensity = val != null ? Math.round(Math.abs(val) * 5) * 100 : 0;
                                    const clampedIntensity = Math.max(50, Math.min(intensity, 500));
                                    const bg = val != null && intensity > 0 ? (val > 0 ? `blue.${clampedIntensity}` : `red.${clampedIntensity}`) : undefined;
                                    return (
                                      <Td key={col} isNumeric fontSize="xs" bg={bg || undefined} color={bg ? 'white' : undefined} textAlign="center">
                                        {val != null ? `${val.toFixed(2)}${stars}` : '-'}
                                      </Td>
                                    );
                                  })}
                                </Tr>
                              ))}
                            </Tbody>
                          </Table>
                        </Box>
                      </CardBody>
                    </Card>

                    {correlationData.indicators.length > 0 && (
                      <Card>
                        <CardHeader><Heading size="sm">Correlation Heatmap — {LAYER_LABELS[LAYERS[selectedLayer]]}</Heading></CardHeader>
                        <CardBody><CorrelationHeatmap corr={correlationData.corr} pval={correlationData.pval} indicators={correlationData.indicators} /></CardBody>
                      </Card>
                    )}
                  </>
                )}

                {/* Radar Profiles Table */}
                {zoneAnalysisResult?.radar_profiles && Object.keys(zoneAnalysisResult.radar_profiles).length > 0 && (() => {
                  const zones = Object.keys(zoneAnalysisResult.radar_profiles);
                  const allIndicators = Array.from(new Set(zones.flatMap(z => Object.keys(zoneAnalysisResult.radar_profiles[z])))).sort();
                  return (
                    <Card mt={6}>
                      <CardHeader><Heading size="sm">Radar Profiles (Percentiles)</Heading></CardHeader>
                      <CardBody p={0}>
                        <Box overflowX="auto">
                          <Table size="sm">
                            <Thead><Tr><Th>Zone</Th>{allIndicators.map(ind => <Th key={ind} isNumeric>{ind}</Th>)}</Tr></Thead>
                            <Tbody>
                              {zones.map(zone => (
                                <Tr key={zone}>
                                  <Td fontSize="xs" fontWeight="medium">{zone}</Td>
                                  {allIndicators.map(ind => {
                                    const val = zoneAnalysisResult.radar_profiles[zone]?.[ind];
                                    return <Td key={ind} isNumeric fontSize="xs" bg={val != null ? (val >= 75 ? 'green.50' : val <= 25 ? 'red.50' : undefined) : undefined}>{val != null ? val.toFixed(1) : '-'}</Td>;
                                  })}
                                </Tr>
                              ))}
                            </Tbody>
                          </Table>
                        </Box>
                      </CardBody>
                    </Card>
                  );
                })()}

                {/* Per-Indicator Deep Dive (Cell 16) */}
                {zoneAnalysisResult && (() => {
                  const indIds = Array.from(new Set(zoneAnalysisResult.zone_statistics.map(s => s.indicator_id))).sort();
                  if (indIds.length === 0) return null;
                  const indDefs = zoneAnalysisResult.indicator_definitions || {};
                  return (
                    <Card mt={6}>
                      <CardHeader><Heading size="sm">Per-Indicator Deep Dive</Heading></CardHeader>
                      <CardBody>
                        <VStack align="stretch" spacing={8} divider={<Box borderTopWidth="1px" borderColor="gray.200" />}>
                          {indIds.map(ind => {
                            const def = indDefs[ind];
                            return (
                              <IndicatorDeepDive
                                key={ind}
                                stats={zoneAnalysisResult.zone_statistics}
                                indicatorId={ind}
                                indicatorName={def?.name}
                                unit={def?.unit}
                                targetDirection={def?.target_direction}
                              />
                            );
                          })}
                        </VStack>
                      </CardBody>
                    </Card>
                  );
                })()}
              </TabPanel>

              {/* ── Tab: Design Strategies ── */}
              {hasAnalysis && (
                <TabPanel px={0}>
                  {/* Stage 3 failed — show retry */}
                  {(stage3Failed || !hasDesign) && (
                    <Alert status={stage3Failed ? 'error' : 'info'} mb={4} borderRadius="md">
                      <AlertIcon />
                      <Box flex="1">
                        <Text fontWeight="bold" fontSize="sm">
                          {stage3Failed ? 'Design strategy generation failed' : 'No design strategies yet'}
                        </Text>
                        {stage3Error && <Text fontSize="xs" color="gray.600" mt={1}>{stage3Error}</Text>}
                      </Box>
                      <Button
                        size="sm"
                        leftIcon={<RefreshCw size={14} />}
                        colorScheme={stage3Failed ? 'red' : 'blue'}
                        variant="outline"
                        onClick={handleRetryStagе3}
                        isLoading={designStrategiesMutation.isPending}
                        loadingText="Running..."
                        ml={3}
                        flexShrink={0}
                      >
                        {stage3Failed ? 'Retry Stage 3' : 'Generate Strategies'}
                      </Button>
                    </Alert>
                  )}

                  {hasDesign && <Accordion allowMultiple defaultIndex={[0]}>
                    {Object.entries(designStrategyResult!.zones).map(([zoneId, zone]: [string, ZoneDesignOutput]) => (
                      <AccordionItem key={zoneId}>
                        <AccordionButton>
                          <HStack flex="1" justify="space-between" pr={2}>
                            <HStack spacing={3}>
                              <Text fontWeight="bold">{zone.zone_name}</Text>
                              <Badge colorScheme={deviationColorScheme(zone.mean_abs_z)}>|z|={zone.mean_abs_z?.toFixed(2) ?? '-'}</Badge>
                            </HStack>
                            <Text fontSize="sm" color="gray.500">{zone.design_strategies.length} strategies</Text>
                          </HStack>
                          <AccordionIcon />
                        </AccordionButton>
                        <AccordionPanel>
                          <VStack align="stretch" spacing={4}>
                            {zone.overall_assessment && (
                              <Alert status="info" variant="left-accent"><AlertIcon /><Text fontSize="sm">{zone.overall_assessment}</Text></Alert>
                            )}

                            {zone.design_strategies.map((strategy, idx) => (
                              <Card key={idx} variant="outline">
                                <CardBody>
                                  <VStack align="stretch" spacing={3}>
                                    <HStack justify="space-between">
                                      <HStack spacing={2}>
                                        <Badge colorScheme="purple">P{strategy.priority}</Badge>
                                        <Text fontWeight="bold" fontSize="sm">{strategy.strategy_name}</Text>
                                      </HStack>
                                      <Badge colorScheme={strategy.confidence === 'High' ? 'green' : strategy.confidence === 'Medium' ? 'yellow' : 'gray'}>
                                        {strategy.confidence}
                                      </Badge>
                                    </HStack>

                                    <Wrap>{strategy.target_indicators.map(ind => <WrapItem key={ind}><Tag size="sm" colorScheme="blue"><TagLabel>{ind}</TagLabel></Tag></WrapItem>)}</Wrap>

                                    {strategy.spatial_location && (
                                      <Text fontSize="xs" color="gray.600"><Text as="span" fontWeight="bold">Location:</Text> {strategy.spatial_location}</Text>
                                    )}

                                    <Box bg="gray.50" p={3} borderRadius="md">
                                      <Text fontSize="xs" fontWeight="bold" mb={1}>Intervention</Text>
                                      <SimpleGrid columns={2} spacing={1} fontSize="xs">
                                        <Text><strong>Object:</strong> {strategy.intervention.object}</Text>
                                        <Text><strong>Action:</strong> {strategy.intervention.action}</Text>
                                        <Text><strong>Variable:</strong> {strategy.intervention.variable}</Text>
                                      </SimpleGrid>
                                      {strategy.intervention.specific_guidance && <Text fontSize="xs" mt={1} fontStyle="italic">{strategy.intervention.specific_guidance}</Text>}
                                    </Box>

                                    {strategy.signatures && strategy.signatures.length > 0 && (
                                      <Box>
                                        <Text fontSize="xs" fontWeight="bold" mb={1}>Signatures</Text>
                                        <Wrap>
                                          {strategy.signatures.slice(0, 4).map((sig, si) => (
                                            <WrapItem key={si}>
                                              <Tag size="sm" colorScheme="teal" variant="subtle">
                                                <TagLabel>{sig.operation?.name || '?'} x {sig.semantic_layer?.name || '?'} @ {sig.spatial_layer?.name || '?'} / {sig.morphological_layer?.name || '?'}</TagLabel>
                                              </Tag>
                                            </WrapItem>
                                          ))}
                                        </Wrap>
                                      </Box>
                                    )}

                                    {strategy.pathway?.mechanism_description && (
                                      <Text fontSize="xs" color="blue.600" fontStyle="italic">
                                        <Text as="span" fontWeight="bold">Pathway:</Text> {strategy.pathway.pathway_type?.name ? `(${strategy.pathway.pathway_type.name}) ` : ''}{strategy.pathway.mechanism_description}
                                      </Text>
                                    )}

                                    {strategy.expected_effects.length > 0 && (
                                      <Box>
                                        <Text fontSize="xs" fontWeight="bold" mb={1}>Expected Effects</Text>
                                        <Wrap>{strategy.expected_effects.map((eff, i) => <WrapItem key={i}><Tag size="sm" colorScheme={eff.direction === 'increase' ? 'green' : 'red'}><TagLabel>{eff.indicator} {eff.direction} ({eff.magnitude})</TagLabel></Tag></WrapItem>)}</Wrap>
                                      </Box>
                                    )}

                                    {strategy.potential_tradeoffs && <Text fontSize="xs" color="orange.600"><Text as="span" fontWeight="bold">Tradeoffs:</Text> {strategy.potential_tradeoffs}</Text>}
                                    {strategy.boundary_effects && <Text fontSize="xs" color="purple.600"><Text as="span" fontWeight="bold">Boundary Effects:</Text> {strategy.boundary_effects}</Text>}
                                    {strategy.implementation_guidance && (
                                      <Box bg="green.50" p={2} borderRadius="md">
                                        <Text fontSize="xs" fontWeight="bold" color="green.700" mb={1}>Implementation Guidance</Text>
                                        <Text fontSize="xs" color="green.800">{strategy.implementation_guidance}</Text>
                                      </Box>
                                    )}

                                    {strategy.supporting_ioms.length > 0 && (
                                      <Box>
                                        <Text fontSize="xs" fontWeight="bold" mb={1}>Supporting IOMs</Text>
                                        <Wrap>{strategy.supporting_ioms.map((iom, i) => <WrapItem key={i}><Tag size="sm" variant="outline" colorScheme="gray"><TagLabel>{iom}</TagLabel></Tag></WrapItem>)}</Wrap>
                                      </Box>
                                    )}
                                  </VStack>
                                </CardBody>
                              </Card>
                            ))}

                            <Divider />
                            {zone.implementation_sequence && <Box><Text fontSize="xs" fontWeight="bold">Implementation Sequence</Text><Text fontSize="xs">{zone.implementation_sequence}</Text></Box>}
                            {zone.synergies && <Box><Text fontSize="xs" fontWeight="bold">Synergies</Text><Text fontSize="xs">{zone.synergies}</Text></Box>}
                          </VStack>
                        </AccordionPanel>
                      </AccordionItem>
                    ))}
                  </Accordion>}
                </TabPanel>
              )}

              {/* ── Tab: Indicators ── */}
              <TabPanel px={0}>
                <VStack spacing={6} align="stretch">
                  {recommendations.length > 0 && (
                    <Card>
                      <CardHeader>
                        <HStack justify="space-between">
                          <Heading size="sm">Recommended Indicators ({recommendations.length})</Heading>
                          <Badge colorScheme="blue">{selectedIndicators.length} selected</Badge>
                        </HStack>
                      </CardHeader>
                      <CardBody>
                        <Wrap spacing={3}>
                          {recommendations.map(rec => {
                            const selected = selectedIndicators.some(s => s.indicator_id === rec.indicator_id);
                            return (
                              <WrapItem key={rec.indicator_id}>
                                <Tag size="lg" colorScheme={selected ? 'green' : 'gray'} variant={selected ? 'solid' : 'outline'}>
                                  <TagLabel>{rec.indicator_id} {(rec.relevance_score * 100).toFixed(0)}%</TagLabel>
                                </Tag>
                              </WrapItem>
                            );
                          })}
                        </Wrap>
                      </CardBody>
                    </Card>
                  )}

                  {indicatorRelationships.length > 0 && (
                    <Card>
                      <CardHeader><Heading size="sm">Indicator Relationships</Heading></CardHeader>
                      <CardBody>
                        <VStack align="stretch" spacing={2}>
                          {indicatorRelationships.map((rel, i) => (
                            <HStack key={i} fontSize="sm" spacing={2}>
                              <Badge colorScheme="blue">{rel.indicator_a}</Badge>
                              <Badge colorScheme={rel.relationship_type === 'synergistic' ? 'green' : rel.relationship_type === 'inverse' ? 'red' : 'gray'}>{rel.relationship_type}</Badge>
                              <Badge colorScheme="blue">{rel.indicator_b}</Badge>
                              {rel.explanation && <Text fontSize="xs" color="gray.500" noOfLines={1} flex={1}>{rel.explanation}</Text>}
                            </HStack>
                          ))}
                        </VStack>
                      </CardBody>
                    </Card>
                  )}

                  {recommendationSummary && (
                    <Card>
                      <CardHeader><Heading size="sm">Recommendation Summary</Heading></CardHeader>
                      <CardBody>
                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                          {recommendationSummary.key_findings.length > 0 && (
                            <Box>
                              <Text fontSize="sm" fontWeight="bold" mb={1}>Key Findings</Text>
                              <VStack align="stretch" spacing={1}>
                                {recommendationSummary.key_findings.map((f, i) => <Text key={i} fontSize="sm">&#x2713; {f}</Text>)}
                              </VStack>
                            </Box>
                          )}
                          {recommendationSummary.evidence_gaps.length > 0 && (
                            <Box>
                              <Text fontSize="sm" fontWeight="bold" mb={1}>Evidence Gaps</Text>
                              <VStack align="stretch" spacing={1}>
                                {recommendationSummary.evidence_gaps.map((g, i) => <Text key={i} fontSize="sm">&#x26A0; {g}</Text>)}
                              </VStack>
                            </Box>
                          )}
                        </SimpleGrid>
                      </CardBody>
                    </Card>
                  )}
                </VStack>
              </TabPanel>

            </TabPanels>
          </Tabs>
        </Box>
      )}

      {/* Navigation */}
      {routeProjectId && (
        <HStack justify="space-between" mt={6}>
          <Button as={Link} to={`/projects/${routeProjectId}/analysis`} variant="outline">
            Back: Analysis
          </Button>
          <Button as={Link} to={`/projects/${routeProjectId}`} colorScheme="green">
            Back to Project
          </Button>
        </HStack>
      )}
    </PageShell>
  );
}

export default Reports;
