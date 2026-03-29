import { useState, useCallback, useMemo } from 'react';
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
  Spinner,
  Divider,
  Switch,
  FormControl,
  FormLabel,
  NumberInput,
  NumberInputField,
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
  Tag,
  TagLabel,
  Wrap,
  WrapItem,
  Tooltip,
} from '@chakra-ui/react';
import {
  useRunDesignStrategies,
  useRunProjectPipeline,
  useRunClustering,
  useCalculators,
} from '../hooks/useApi';
import type {
  ZoneAnalysisResult,
  DesignStrategyResult,
  EnrichedZoneStat,
  ZoneDiagnostic,
  ZoneDesignOutput,
  ProjectPipelineResult,
  ProjectPipelineProgress,
  ClusteringResponse,
} from '../types';
import { generateReport } from '../utils/generateReport';
import useAppStore from '../store/useAppStore';
import useAppToast from '../hooks/useAppToast';
import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';
import {
  RadarProfileChart,
  ZonePriorityChart,
  CorrelationHeatmap,
  IndicatorComparisonChart,
  PriorityHeatmap,
} from '../components/AnalysisCharts';

const LAYERS = ['full', 'foreground', 'middleground', 'background'];
const LAYER_LABELS: Record<string, string> = {
  full: 'Full',
  foreground: 'FG',
  middleground: 'MG',
  background: 'BG',
};

const STATUS_COLORS: Record<string, string> = {
  Critical: 'red',
  Poor: 'orange',
  Moderate: 'yellow',
  Good: 'green',
};

const PRIORITY_COLORS: Record<number, string> = {
  0: 'green.100',
  1: 'green.200',
  2: 'yellow.100',
  3: 'yellow.300',
  4: 'orange.200',
  5: 'red.200',
};

const STEP_STATUS_COLORS: Record<string, string> = {
  completed: 'green',
  skipped: 'gray',
  failed: 'red',
};

function statusBgColor(status: string): string {
  if (status.toLowerCase().includes('critical')) return 'red.100';
  if (status.toLowerCase().includes('poor')) return 'orange.100';
  if (status.toLowerCase().includes('moderate')) return 'yellow.100';
  return 'green.100';
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

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as { response?: { data?: { detail?: string } } };
    if (axiosErr.response?.data?.detail) return axiosErr.response.data.detail;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

function Analysis() {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const toast = useAppToast();
  const {
    selectedIndicators,
    zoneAnalysisResult, setZoneAnalysisResult,
    designStrategyResult, setDesignStrategyResult,
    pipelineResult: storePipelineResult, setPipelineResult: setStorePipelineResult,
  } = useAppStore();

  // Pipeline results from store (persist across navigation)
  const pipelineResult = storePipelineResult;
  const setPipelineResult = (r: ProjectPipelineResult | null) => setStorePipelineResult(r);
  const zoneResult = zoneAnalysisResult;
  const setZoneResult = (r: ZoneAnalysisResult | null) => setZoneAnalysisResult(r);
  const designResult = designStrategyResult;
  const setDesignResult = (r: DesignStrategyResult | null) => setDesignStrategyResult(r);

  // Config state
  const [zscoreModerate, setZscoreModerate] = useState(0.5);
  const [zscoreSignificant, setZscoreSignificant] = useState(1.0);
  const [zscoreCritical, setZscoreCritical] = useState(1.5);
  const [useLlm, setUseLlm] = useState(true);

  // Selected layer for filtering
  const [selectedLayer, setSelectedLayer] = useState(0);

  // Queries
  const { data: calculators } = useCalculators();

  // Derive project and indicator IDs from route and store
  const selectedProjectId = routeProjectId || '';
  const selectedIndicatorIds = useMemo(() => {
    if (!calculators || calculators.length === 0) return [];
    return selectedIndicators
      .map(i => i.indicator_id)
      .filter(id => calculators.some(c => c.id === id));
  }, [selectedIndicators, calculators]);

  // Mutations
  const zoneAnalysis = useRunZoneAnalysis();
  const designStrategies = useRunDesignStrategies();
  const fullAnalysis = useRunFullAnalysis();
  const projectPipeline = useRunProjectPipeline();
  const clusteringMutation = useRunClustering();
  const [clusteringResult, setClusteringResult] = useState<ClusteringResponse | null>(null);

  // Selected project info
  const selectedProject = useMemo(() => {
    if (!selectedProjectId || !projects) return null;
    return projects.find(p => p.id === selectedProjectId) ?? null;
  }, [selectedProjectId, projects]);

  const projectSummary = useMemo(() => {
    if (!selectedProject) return null;
    const totalImages = selectedProject.uploaded_images.length;
    const assignedImages = selectedProject.uploaded_images.filter(img => img.zone_id).length;
    const zones = selectedProject.spatial_zones.length;
    return { totalImages, assignedImages, zones };
  }, [selectedProject]);

  // Run project pipeline
  const handleRunPipeline = useCallback(async () => {
    if (!selectedProjectId || selectedIndicatorIds.length === 0) return;
    try {
      const result = await projectPipeline.mutateAsync({
        project_id: selectedProjectId,
        indicator_ids: selectedIndicatorIds,
        run_stage3: true,
        use_llm: useLlm,
        zscore_moderate: zscoreModerate,
        zscore_significant: zscoreSignificant,
        zscore_critical: zscoreCritical,
      });
      setPipelineResult(result);
      if (result.zone_analysis) setZoneResult(result.zone_analysis);
      if (result.design_strategies) setDesignResult(result.design_strategies);
      toast({ title: 'Project pipeline complete', status: 'success', duration: 3000 });
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, 'Project pipeline failed');
      toast({ title: msg, status: 'error' });
    }
  }, [selectedProjectId, selectedIndicatorIds, useLlm, zscoreModerate, zscoreSignificant, zscoreCritical, projectPipeline, toast]);

  // Generate strategies from existing zone analysis result
  const handleGenerateStrategies = useCallback(async () => {
    if (!zoneResult) return;
    try {
      const result = await designStrategies.mutateAsync({
        zone_analysis: zoneResult,
        use_llm: useLlm,
      });
      setDesignResult(result);
      toast({ title: 'Design strategies generated', status: 'success', duration: 3000 });
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, 'Strategy generation failed');
      toast({ title: msg, status: 'error' });
    }
  }, [zoneResult, useLlm, designStrategies, toast]);

  // Run clustering on zone analysis results
  const handleRunClustering = useCallback(async () => {
    if (!zoneResult) return;
    try {
      // Build point_metrics from zone_statistics (each row is a point)
      const pointMetrics = zoneResult.zone_statistics
        .filter(s => s.layer === 'full')
        .map(s => ({
          zone_id: s.zone_id,
          zone_name: s.zone_name,
          indicator_id: s.indicator_id,
          value: s.mean,
        }));
      const result = await clusteringMutation.mutateAsync({
        point_metrics: pointMetrics,
        indicator_definitions: zoneResult.indicator_definitions,
        layer: 'full',
      });
      setClusteringResult(result);
      if (result.skipped) {
        toast({ title: `Clustering skipped: ${result.reason}`, status: 'info' });
      } else if (result.clustering) {
        // Merge segment_diagnostics into zone result
        const updated = {
          ...zoneResult,
          clustering: result.clustering,
          segment_diagnostics: result.segment_diagnostics,
        };
        setZoneResult(updated);
        toast({
          title: `Clustering complete: ${result.clustering.k} archetypes (silhouette: ${result.clustering.silhouette_score.toFixed(2)})`,
          status: 'success',
        });
      }
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, 'Clustering failed');
      toast({ title: msg, status: 'error' });
    }
  }, [zoneResult, clusteringMutation, toast]);

  // Download Markdown report
  const handleDownloadReport = useCallback(() => {
    if (!zoneResult) return;
    const md = generateReport({
      projectName: pipelineResult?.project_name,
      pipelineResult,
      zoneResult,
      designResult,
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis_report_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [zoneResult, designResult, pipelineResult]);

  // Export JSON
  const handleExport = useCallback(() => {
    const exportData = {
      zone_analysis: zoneResult,
      design_strategies: designResult,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis_results_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [zoneResult, designResult]);

  // Filtered zone statistics by layer
  const filteredStats = useMemo(() => {
    if (!zoneResult) return [];
    const layer = LAYERS[selectedLayer];
    return zoneResult.zone_statistics.filter(s => s.layer === layer);
  }, [zoneResult, selectedLayer]);

  // Sorted diagnostics
  const sortedDiagnostics = useMemo(() => {
    if (!zoneResult) return [];
    return [...zoneResult.zone_diagnostics].sort((a, b) => b.total_priority - a.total_priority);
  }, [zoneResult]);

  // Correlation data for selected layer
  const correlationData = useMemo(() => {
    if (!zoneResult) return null;
    const layer = LAYERS[selectedLayer];
    const corr = zoneResult.correlation_by_layer?.[layer];
    const pval = zoneResult.pvalue_by_layer?.[layer];
    if (!corr) return null;
    const indicators = Object.keys(corr);
    return { indicators, corr, pval };
  }, [zoneResult, selectedLayer]);

  const isRunning = designStrategies.isPending || projectPipeline.isPending;

  return (
    <PageShell>
      <PageHeader title="Analysis Dashboard">
        {(zoneResult || designResult) && (
          <HStack spacing={2}>
            <Button size="sm" onClick={handleDownloadReport}>
              Download Report
            </Button>
            <Button size="sm" variant="outline" onClick={handleExport}>
              Export JSON
            </Button>
          </HStack>
        )}
      </PageHeader>

      {/* Input Section with Tabs */}
      <Card mb={6}>
        <CardHeader>
          <Heading size="md">Pipeline Configuration</Heading>
        </CardHeader>
        <CardBody>
          {/* Project info (read-only) */}
          <Text fontWeight="bold" mb={3}>
            Project: {selectedProject?.project_name || routeProjectId || 'No project'}
          </Text>

          {projectSummary && (
            <Alert status={projectSummary.assignedImages > 0 ? 'info' : 'warning'} mb={4}>
              <AlertIcon />
              {projectSummary.assignedImages} of {projectSummary.totalImages} images assigned to {projectSummary.zones} zones
            </Alert>
          )}

          {/* Selected indicators (from Indicators step, read-only) */}
          <Box mb={4}>
            <Text fontSize="sm" fontWeight="bold" mb={2}>
              Selected Indicators ({selectedIndicatorIds.length})
            </Text>
            <Wrap>
              {selectedIndicatorIds.map(id => (
                <WrapItem key={id}>
                  <Tag size="sm" colorScheme="blue"><TagLabel>{id}</TagLabel></Tag>
                </WrapItem>
              ))}
            </Wrap>
            {selectedIndicatorIds.length === 0 && (
              <Text fontSize="sm" color="orange.500">
                No indicators selected. Go back to the Indicators step to select indicators.
              </Text>
            )}
          </Box>

          <Divider mb={4} />

          {/* Analysis parameters */}
          <Text fontSize="xs" fontWeight="semibold" color="gray.500" textTransform="uppercase" letterSpacing="wide" mb={2}>
            Analysis Parameters
          </Text>
          <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4} alignItems="end" mb={4}>
            <FormControl>
              <Tooltip label="Indicators deviating beyond this threshold are flagged as moderate concerns. Lower values flag more indicators." placement="top" hasArrow>
                <FormLabel fontSize="sm" cursor="help" borderBottom="1px dashed" borderColor="gray.300" display="inline-block">
                  Z-score Moderate
                </FormLabel>
              </Tooltip>
              <NumberInput
                value={zscoreModerate}
                onChange={(_, val) => setZscoreModerate(isNaN(val) ? 0.5 : val)}
                step={0.1}
                min={0}
                size="sm"
              >
                <NumberInputField />
              </NumberInput>
            </FormControl>
            <FormControl>
              <Tooltip label="Indicators beyond this threshold are flagged as significant problems requiring attention in design strategies." placement="top" hasArrow>
                <FormLabel fontSize="sm" cursor="help" borderBottom="1px dashed" borderColor="gray.300" display="inline-block">
                  Z-score Significant
                </FormLabel>
              </Tooltip>
              <NumberInput
                value={zscoreSignificant}
                onChange={(_, val) => setZscoreSignificant(isNaN(val) ? 1.0 : val)}
                step={0.1}
                min={0}
                size="sm"
              >
                <NumberInputField />
              </NumberInput>
            </FormControl>
            <FormControl>
              <Tooltip label="Indicators beyond this threshold are flagged as critical — top priority for intervention. Higher values mean only extreme deviations are flagged." placement="top" hasArrow>
                <FormLabel fontSize="sm" cursor="help" borderBottom="1px dashed" borderColor="gray.300" display="inline-block">
                  Z-score Critical
                </FormLabel>
              </Tooltip>
              <NumberInput
                value={zscoreCritical}
                onChange={(_, val) => setZscoreCritical(isNaN(val) ? 1.5 : val)}
                step={0.1}
                min={0}
                size="sm"
              >
                <NumberInputField />
              </NumberInput>
            </FormControl>
            <FormControl display="flex" alignItems="center">
              <Tooltip
                label="When enabled, Stage 3 uses an LLM (e.g. Gemini, GPT, Claude) to generate context-aware design strategies based on zone diagnostics. When disabled, strategies are generated using rule-based matching — faster but less tailored."
                placement="top"
                hasArrow
                maxW="320px"
              >
                <FormLabel fontSize="sm" mb={0} cursor="help" borderBottom="1px dashed" borderColor="gray.300">
                  Use LLM (Stage 3)
                </FormLabel>
              </Tooltip>
              <Switch isChecked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} colorScheme="green" />
            </FormControl>
          </SimpleGrid>

          {/* Run pipeline button */}
          <Button
            colorScheme="green"
            onClick={handleRunPipeline}
            isLoading={projectPipeline.isPending}
            isDisabled={!selectedProjectId || selectedIndicatorIds.length === 0 || isRunning}
            mt={4}
          >
            Run Pipeline
          </Button>

          {/* Pipeline result summary */}
          {pipelineResult && (
            <Card variant="outline" mt={4}>
              <CardBody>
                <VStack spacing={3} align="stretch">
                  <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
                    <Box>
                      <Text fontSize="xs" color="gray.500">Images</Text>
                      <Text fontWeight="bold">{pipelineResult.zone_assigned_images} / {pipelineResult.total_images}</Text>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="gray.500">Calculations OK</Text>
                      <Text fontWeight="bold" color="green.600">{pipelineResult.calculations_succeeded}</Text>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="gray.500">Failed</Text>
                      <Text fontWeight="bold" color={pipelineResult.calculations_failed > 0 ? 'red.600' : undefined}>
                        {pipelineResult.calculations_failed}
                      </Text>
                    </Box>
                    <Box>
                      <Text fontSize="xs" color="gray.500">Zone Stats</Text>
                      <Text fontWeight="bold">{pipelineResult.zone_statistics_count}</Text>
                    </Box>
                  </SimpleGrid>
                  <Wrap spacing={2}>
                    {pipelineResult.steps.map((step: ProjectPipelineProgress, idx: number) => (
                      <WrapItem key={idx}>
                        <Tooltip label={step.detail}>
                          <Badge colorScheme={STEP_STATUS_COLORS[step.status] || 'gray'} variant="subtle" px={2} py={1}>
                            {step.step}: {step.status}
                          </Badge>
                        </Tooltip>
                      </WrapItem>
                    ))}
                  </Wrap>
                </VStack>
              </CardBody>
            </Card>
          )}
        </CardBody>
      </Card>

      {/* Loading indicator */}
      {isRunning && (
        <Card mb={6}>
          <CardBody textAlign="center" py={10}>
            <Spinner size="xl" color="green.500" />
            <Text mt={4}>Running analysis pipeline...</Text>
          </CardBody>
        </Card>
      )}

      {/* Stage 2.5 Results */}
      {zoneResult && (
        <>
          {/* Zone Diagnostics Cards */}
          <Heading size="md" mb={4}>Zone Diagnostics</Heading>
          <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing={4} mb={6}>
            {sortedDiagnostics.map((diag: ZoneDiagnostic) => (
              <Card key={diag.zone_id} bg={statusBgColor(diag.status)}>
                <CardBody>
                  <VStack align="stretch" spacing={2}>
                    <HStack justify="space-between">
                      <HStack spacing={1}>
                        {diag.rank > 0 && (
                          <Badge colorScheme="purple" fontSize="xs">#{diag.rank}</Badge>
                        )}
                        <Text fontWeight="bold" fontSize="sm" noOfLines={1}>{diag.zone_name}</Text>
                      </HStack>
                      <Badge colorScheme={STATUS_COLORS[diag.status] || 'gray'}>
                        {diag.status}
                      </Badge>
                    </HStack>
                    <HStack justify="space-between">
                      <Text fontSize="xs" color="gray.600">Total Priority</Text>
                      <Text fontWeight="bold">{diag.total_priority}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text fontSize="xs" color="gray.600">Composite Z</Text>
                      <Text fontWeight="bold">{diag.composite_zscore?.toFixed(2) ?? '-'}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text fontSize="xs" color="gray.600">Problems (P{'\u2265'}4)</Text>
                      <Text fontWeight="bold">
                        {Object.values(diag.problems_by_layer)
                          .flat()
                          .filter(p => p.priority >= 4).length}
                      </Text>
                    </HStack>
                  </VStack>
                </CardBody>
              </Card>
            ))}
          </SimpleGrid>

          {/* Zone Priority Chart */}
          {sortedDiagnostics.length > 0 && (
            <Card mb={6}>
              <CardHeader>
                <Heading size="sm">Zone Priority Overview</Heading>
              </CardHeader>
              <CardBody>
                <ZonePriorityChart diagnostics={sortedDiagnostics} />
              </CardBody>
            </Card>
          )}

          {/* Priority Heatmap */}
          {sortedDiagnostics.length > 0 && (
            <Card mb={6}>
              <CardHeader>
                <Heading size="sm">Priority Heatmap</Heading>
              </CardHeader>
              <CardBody>
                <PriorityHeatmap diagnostics={sortedDiagnostics} layer="full" />
              </CardBody>
            </Card>
          )}

          {/* Statistics Table + Correlation Matrix with shared layer tabs */}
          <Tabs index={selectedLayer} onChange={setSelectedLayer} colorScheme="green" mb={6}>
            <TabList>
              {LAYERS.map(l => <Tab key={l}>{LAYER_LABELS[l]}</Tab>)}
            </TabList>

            <TabPanels>
              {LAYERS.map((layer) => (
                <TabPanel key={layer} px={0}>
                  {/* Indicator Comparison Chart */}
                  {zoneResult && zoneResult.zone_statistics.filter(s => s.layer === layer).length > 0 && (
                    <Card mb={6}>
                      <CardHeader>
                        <Heading size="sm">Indicator Comparison — {LAYER_LABELS[layer]}</Heading>
                      </CardHeader>
                      <CardBody>
                        <IndicatorComparisonChart stats={zoneResult.zone_statistics} layer={layer} />
                      </CardBody>
                    </Card>
                  )}

                  {/* Statistics Table */}
                  <Card mb={6}>
                    <CardHeader>
                      <Heading size="sm">Zone Statistics — {LAYER_LABELS[layer]}</Heading>
                    </CardHeader>
                    <CardBody p={0}>
                      <Box overflowX="auto">
                        <Table size="sm">
                          <Thead>
                            <Tr>
                              <Th>Zone</Th>
                              <Th>Indicator</Th>
                              <Th isNumeric>Mean</Th>
                              <Th isNumeric>Std</Th>
                              <Th isNumeric>Z-score</Th>
                              <Th isNumeric>Percentile</Th>
                              <Th isNumeric>Priority</Th>
                              <Th>Classification</Th>
                            </Tr>
                          </Thead>
                          <Tbody>
                            {filteredStats.map((stat: EnrichedZoneStat, idx: number) => (
                              <Tr key={idx}>
                                <Td fontSize="xs">{stat.zone_name}</Td>
                                <Td fontSize="xs">{stat.indicator_id}</Td>
                                <Td isNumeric fontSize="xs">{formatNum(stat.mean)}</Td>
                                <Td isNumeric fontSize="xs">{formatNum(stat.std)}</Td>
                                <Td
                                  isNumeric
                                  fontSize="xs"
                                  color={
                                    stat.z_score != null
                                      ? stat.z_score < 0
                                        ? 'red.600'
                                        : 'green.600'
                                      : undefined
                                  }
                                  fontWeight={stat.z_score != null ? 'bold' : undefined}
                                >
                                  {formatNum(stat.z_score)}
                                </Td>
                                <Td isNumeric fontSize="xs">{formatNum(stat.percentile, 0)}</Td>
                                <Td isNumeric>
                                  <Badge bg={PRIORITY_COLORS[stat.priority] || 'gray.100'} fontSize="xs">
                                    {stat.priority}
                                  </Badge>
                                </Td>
                                <Td fontSize="xs">{stat.classification}</Td>
                              </Tr>
                            ))}
                          </Tbody>
                        </Table>
                      </Box>
                    </CardBody>
                  </Card>

                  {/* Correlation Matrix */}
                  {correlationData && (
                    <Card mb={6}>
                      <CardHeader>
                        <Heading size="sm">Correlation Matrix — {LAYER_LABELS[layer]}</Heading>
                      </CardHeader>
                      <CardBody p={0}>
                        <Box overflowX="auto">
                          <Table size="sm">
                            <Thead>
                              <Tr>
                                <Th />
                                {correlationData.indicators.map(ind => (
                                  <Th key={ind} fontSize="xs" textAlign="center">
                                    <Tooltip label={ind}>
                                      <Text noOfLines={1} maxW="60px">{ind}</Text>
                                    </Tooltip>
                                  </Th>
                                ))}
                              </Tr>
                            </Thead>
                            <Tbody>
                              {correlationData.indicators.map(row => (
                                <Tr key={row}>
                                  <Td fontSize="xs" fontWeight="bold">
                                    <Tooltip label={row}>
                                      <Text noOfLines={1} maxW="80px">{row}</Text>
                                    </Tooltip>
                                  </Td>
                                  {correlationData.indicators.map(col => {
                                    const val = correlationData.corr[row]?.[col];
                                    const pval = correlationData.pval?.[row]?.[col];
                                    const stars = significanceStars(pval);
                                    const intensity = val != null ? Math.round(Math.abs(val) * 5) * 100 : 0;
                                    const clampedIntensity = Math.max(50, Math.min(intensity, 500));
                                    const bg = val != null && intensity > 0
                                      ? val > 0
                                        ? `blue.${clampedIntensity}`
                                        : `red.${clampedIntensity}`
                                      : undefined;
                                    return (
                                      <Td
                                        key={col}
                                        isNumeric
                                        fontSize="xs"
                                        bg={bg || undefined}
                                        color={bg ? 'white' : undefined}
                                        textAlign="center"
                                      >
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
                  )}

                  {/* Correlation Heatmap Chart */}
                  {correlationData && correlationData.indicators.length > 0 && (
                    <Card>
                      <CardHeader>
                        <Heading size="sm">Correlation Heatmap — {LAYER_LABELS[layer]}</Heading>
                      </CardHeader>
                      <CardBody>
                        <CorrelationHeatmap
                          corr={correlationData.corr}
                          pval={correlationData.pval}
                          indicators={correlationData.indicators}
                        />
                      </CardBody>
                    </Card>
                  )}
                </TabPanel>
              ))}
            </TabPanels>
          </Tabs>

          {/* Radar Profiles (full-layer percentiles per zone) */}
          {zoneResult?.radar_profiles && Object.keys(zoneResult.radar_profiles).length > 0 && (() => {
            const zones = Object.keys(zoneResult.radar_profiles);
            const allIndicators = Array.from(new Set(zones.flatMap(z => Object.keys(zoneResult.radar_profiles[z])))).sort();
            return (
              <Card mb={6}>
                <CardHeader>
                  <Heading size="sm">Radar Profiles (Full Layer Percentiles)</Heading>
                </CardHeader>
                <CardBody p={0}>
                  <Box overflowX="auto">
                    <Table size="sm">
                      <Thead>
                        <Tr>
                          <Th>Zone</Th>
                          {allIndicators.map(ind => <Th key={ind} isNumeric>{ind}</Th>)}
                        </Tr>
                      </Thead>
                      <Tbody>
                        {zones.map(zone => (
                          <Tr key={zone}>
                            <Td fontSize="xs" fontWeight="medium">{zone}</Td>
                            {allIndicators.map(ind => {
                              const val = zoneResult.radar_profiles[zone]?.[ind];
                              return (
                                <Td key={ind} isNumeric fontSize="xs"
                                  bg={val != null ? (val >= 75 ? 'green.50' : val <= 25 ? 'red.50' : undefined) : undefined}
                                >
                                  {val != null ? val.toFixed(1) : '-'}
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
            );
          })()}

          {/* Radar Profile Chart */}
          {zoneResult?.radar_profiles && Object.keys(zoneResult.radar_profiles).length > 0 && (
            <Card mb={6}>
              <CardHeader>
                <Heading size="sm">Radar Profile Chart</Heading>
              </CardHeader>
              <CardBody>
                <RadarProfileChart radarProfiles={zoneResult.radar_profiles} />
              </CardBody>
            </Card>
          )}

          {/* Clustering (optional step before Stage 3) */}
          <Card mb={6} variant="outline">
            <CardBody>
              <HStack justify="space-between" flexWrap="wrap" gap={2}>
                <VStack align="start" spacing={0}>
                  <Text fontWeight="bold" fontSize="sm">SVC Archetype Clustering</Text>
                  <Text fontSize="xs" color="gray.500">
                    Discover spatial archetypes via KMeans clustering (requires 20+ points)
                  </Text>
                </VStack>
                <HStack>
                  {clusteringResult?.clustering && (
                    <Badge colorScheme="green">
                      k={clusteringResult.clustering.k} · silhouette={clusteringResult.clustering.silhouette_score.toFixed(2)}
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
                    isDisabled={isRunning}
                  >
                    {clusteringResult?.clustering ? 'Re-run Clustering' : 'Run Clustering'}
                  </Button>
                </HStack>
              </HStack>
              {clusteringResult?.clustering && clusteringResult.clustering.archetype_profiles.length > 0 && (
                <Box mt={3}>
                  <Wrap spacing={2}>
                    {clusteringResult.clustering.archetype_profiles.map(a => (
                      <WrapItem key={a.archetype_id}>
                        <Tag size="sm" colorScheme="teal" variant="subtle">
                          <TagLabel>
                            Archetype {a.archetype_id}: {a.archetype_label} ({a.point_count} pts)
                          </TagLabel>
                        </Tag>
                      </WrapItem>
                    ))}
                  </Wrap>
                </Box>
              )}
            </CardBody>
          </Card>

          {/* Generate Strategies button (if no design results yet) */}
          {!designResult && (
            <HStack mb={6}>
              <Button
                colorScheme="green"
                variant="outline"
                onClick={handleGenerateStrategies}
                isLoading={designStrategies.isPending}
                isDisabled={isRunning}
              >
                Generate Design Strategies
              </Button>
            </HStack>
          )}
        </>
      )}

      {/* Stage 3 Results — Design Strategies */}
      {designResult && (
        <Box mb={6}>
          <Heading size="md" mb={4}>Design Strategies</Heading>
          <Accordion allowMultiple>
            {Object.entries(designResult.zones).map(([zoneId, zone]: [string, ZoneDesignOutput]) => (
              <AccordionItem key={zoneId}>
                <AccordionButton>
                  <HStack flex="1" justify="space-between" pr={2}>
                    <HStack spacing={3}>
                      <Text fontWeight="bold">{zone.zone_name}</Text>
                      <Badge colorScheme={STATUS_COLORS[zone.status] || 'gray'}>
                        {zone.status}
                      </Badge>
                    </HStack>
                    <Text fontSize="sm" color="gray.500">
                      {zone.design_strategies.length} strategies
                    </Text>
                  </HStack>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel>
                  <VStack align="stretch" spacing={4}>
                    {/* Overall assessment */}
                    {zone.overall_assessment && (
                      <Alert status="info" variant="left-accent">
                        <AlertIcon />
                        <Text fontSize="sm">{zone.overall_assessment}</Text>
                      </Alert>
                    )}

                    {/* Strategy cards */}
                    {zone.design_strategies.map((strategy, idx) => (
                      <Card key={idx} variant="outline">
                        <CardBody>
                          <VStack align="stretch" spacing={3}>
                            <HStack justify="space-between">
                              <HStack spacing={2}>
                                <Badge colorScheme="purple">P{strategy.priority}</Badge>
                                <Text fontWeight="bold" fontSize="sm">{strategy.strategy_name}</Text>
                              </HStack>
                              <HStack spacing={1}>
                                {strategy.transferability_note && (
                                  <Badge colorScheme={
                                    strategy.transferability_note.includes('high') ? 'green' :
                                    strategy.transferability_note.includes('moderate') ? 'yellow' :
                                    strategy.transferability_note.includes('low') ? 'red' : 'gray'
                                  } variant="subtle" fontSize="2xs">
                                    {strategy.transferability_note.length > 30
                                      ? strategy.transferability_note.slice(0, 30) + '...'
                                      : strategy.transferability_note}
                                  </Badge>
                                )}
                                <Badge colorScheme={
                                  strategy.confidence === 'High' ? 'green' :
                                  strategy.confidence === 'Medium' ? 'yellow' : 'gray'
                                }>
                                  {strategy.confidence}
                                </Badge>
                              </HStack>
                            </HStack>

                            {/* Target indicators */}
                            <Wrap>
                              {strategy.target_indicators.map(ind => (
                                <WrapItem key={ind}>
                                  <Tag size="sm" colorScheme="blue">
                                    <TagLabel>{ind}</TagLabel>
                                  </Tag>
                                </WrapItem>
                              ))}
                            </Wrap>

                            {/* Spatial location */}
                            <Text fontSize="xs" color="gray.600">
                              <Text as="span" fontWeight="bold">Location:</Text> {strategy.spatial_location}
                            </Text>

                            {/* Intervention */}
                            <Box bg="gray.50" p={3} borderRadius="md">
                              <Text fontSize="xs" fontWeight="bold" mb={1}>Intervention</Text>
                              <SimpleGrid columns={2} spacing={1} fontSize="xs">
                                <Text><strong>Object:</strong> {strategy.intervention.object}</Text>
                                <Text><strong>Action:</strong> {strategy.intervention.action}</Text>
                                <Text><strong>Variable:</strong> {strategy.intervention.variable}</Text>
                              </SimpleGrid>
                              {strategy.intervention.specific_guidance && (
                                <Text fontSize="xs" mt={1} fontStyle="italic">
                                  {strategy.intervention.specific_guidance}
                                </Text>
                              )}
                            </Box>

                            {/* Signatures (v5.0) */}
                            {strategy.signatures && strategy.signatures.length > 0 && (
                              <Box>
                                <Text fontSize="xs" fontWeight="bold" mb={1}>Signatures (I-SVCs)</Text>
                                <Wrap>
                                  {strategy.signatures.slice(0, 4).map((sig, si) => (
                                    <WrapItem key={si}>
                                      <Tag size="sm" colorScheme="teal" variant="subtle">
                                        <TagLabel>
                                          {sig.operation?.name || sig.operation?.id || '?'} x{' '}
                                          {sig.semantic_layer?.name || '?'} @{' '}
                                          {sig.spatial_layer?.name || '?'} /{' '}
                                          {sig.morphological_layer?.name || '?'}
                                        </TagLabel>
                                      </Tag>
                                    </WrapItem>
                                  ))}
                                </Wrap>
                              </Box>
                            )}

                            {/* Pathway (v5.0) */}
                            {strategy.pathway?.mechanism_description && (
                              <Text fontSize="xs" color="blue.600" fontStyle="italic">
                                <Text as="span" fontWeight="bold">Pathway:</Text>{' '}
                                {strategy.pathway.pathway_type?.name ? `(${strategy.pathway.pathway_type.name}) ` : ''}
                                {strategy.pathway.mechanism_description}
                              </Text>
                            )}

                            {/* Expected effects */}
                            {strategy.expected_effects.length > 0 && (
                              <Box>
                                <Text fontSize="xs" fontWeight="bold" mb={1}>Expected Effects</Text>
                                <Wrap>
                                  {strategy.expected_effects.map((eff, i) => (
                                    <WrapItem key={i}>
                                      <Tag size="sm" colorScheme={eff.direction === 'increase' ? 'green' : 'red'}>
                                        <TagLabel>{eff.indicator} {eff.direction} ({eff.magnitude})</TagLabel>
                                      </Tag>
                                    </WrapItem>
                                  ))}
                                </Wrap>
                              </Box>
                            )}

                            {/* Tradeoffs */}
                            {strategy.potential_tradeoffs && (
                              <Text fontSize="xs" color="orange.600">
                                <Text as="span" fontWeight="bold">Tradeoffs:</Text> {strategy.potential_tradeoffs}
                              </Text>
                            )}

                            {/* Boundary effects (v5.0) */}
                            {strategy.boundary_effects && (
                              <Text fontSize="xs" color="purple.600">
                                <Text as="span" fontWeight="bold">Boundary Effects:</Text> {strategy.boundary_effects}
                              </Text>
                            )}

                            {/* Implementation guidance (v5.0) */}
                            {strategy.implementation_guidance && (
                              <Box bg="green.50" p={2} borderRadius="md">
                                <Text fontSize="xs" fontWeight="bold" color="green.700" mb={1}>Implementation Guidance</Text>
                                <Text fontSize="xs" color="green.800">{strategy.implementation_guidance}</Text>
                              </Box>
                            )}

                            {/* Supporting IOMs */}
                            {strategy.supporting_ioms.length > 0 && (
                              <Box>
                                <Text fontSize="xs" fontWeight="bold" mb={1}>Supporting IOMs</Text>
                                <Wrap>
                                  {strategy.supporting_ioms.map((iom, i) => (
                                    <WrapItem key={i}>
                                      <Tag size="sm" variant="outline" colorScheme="gray">
                                        <TagLabel>{iom}</TagLabel>
                                      </Tag>
                                    </WrapItem>
                                  ))}
                                </Wrap>
                              </Box>
                            )}
                          </VStack>
                        </CardBody>
                      </Card>
                    ))}

                    {/* Footer: implementation sequence + synergies */}
                    <Divider />
                    {zone.implementation_sequence && (
                      <Box>
                        <Text fontSize="xs" fontWeight="bold">Implementation Sequence</Text>
                        <Text fontSize="xs">{zone.implementation_sequence}</Text>
                      </Box>
                    )}
                    {zone.synergies && (
                      <Box>
                        <Text fontSize="xs" fontWeight="bold">Synergies</Text>
                        <Text fontSize="xs">{zone.synergies}</Text>
                      </Box>
                    )}
                  </VStack>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </Box>
      )}

      {/* Empty state */}
      {!zoneResult && !isRunning && (
        <Card>
          <CardBody textAlign="center" py={10}>
            <Text color="gray.500">
              Select a project and run the pipeline, or paste zone statistics JSON to start the analysis.
            </Text>
          </CardBody>
        </Card>
      )}

      {/* Navigation buttons for pipeline mode */}
      {routeProjectId && (
        <HStack justify="space-between" mt={6}>
          <Button as={Link} to={`/projects/${routeProjectId}/vision`} variant="outline">
            Back: Prepare
          </Button>
          <Button as={Link} to={`/projects/${routeProjectId}/reports`} colorScheme="blue">
            Next: Reports
          </Button>
        </HStack>
      )}
    </PageShell>
  );
}

export default Analysis;
