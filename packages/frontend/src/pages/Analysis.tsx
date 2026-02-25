import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
  Textarea,
  Alert,
  AlertIcon,
  /* useToast — replaced by useAppToast */
  Spinner,
  Divider,
  Switch,
  FormControl,
  FormLabel,
  NumberInput,
  NumberInputField,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
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
  Select,
  Checkbox,
  CheckboxGroup,
} from '@chakra-ui/react';
import {
  useRunZoneAnalysis,
  useRunDesignStrategies,
  useRunFullAnalysis,
  useRunProjectPipeline,
  useProjects,
  useCalculators,
} from '../hooks/useApi';
import type {
  ZoneAnalysisRequest,
  FullAnalysisRequest,
  ZoneAnalysisResult,
  DesignStrategyResult,
  IndicatorLayerValue,
  IndicatorDefinitionInput,
  EnrichedZoneStat,
  ZoneDiagnostic,
  ZoneDesignOutput,
  ProjectPipelineResult,
  ProjectPipelineProgress,
} from '../types';
import { generateReport } from '../utils/generateReport';
import useAppStore from '../store/useAppStore';
import useAppToast from '../hooks/useAppToast';
import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';

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

  // Input mode tab
  const [inputMode, setInputMode] = useState(0);

  // Manual JSON input state
  const [inputJson, setInputJson] = useState('');
  const [parsedData, setParsedData] = useState<ZoneAnalysisRequest | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Pipeline state
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedIndicatorIds, setSelectedIndicatorIds] = useState<string[]>([]);
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
  const [useLlm, setUseLlm] = useState(false);

  // Selected layer for filtering
  const [selectedLayer, setSelectedLayer] = useState(0);

  // Queries
  const { data: projects } = useProjects();
  const { data: calculators } = useCalculators();

  // Auto-select project and switch to pipeline tab from route
  useEffect(() => {
    if (routeProjectId) {
      setSelectedProjectId(routeProjectId);
      setInputMode(0); // Switch to Project Pipeline tab
    }
  }, [routeProjectId]);

  // Initialize indicator selection from store once (set by Indicators page)
  const indicatorsSynced = useRef(false);
  useEffect(() => {
    if (indicatorsSynced.current) return;
    if (selectedIndicators.length > 0 && calculators && calculators.length > 0) {
      const validIds = selectedIndicators
        .map(i => i.indicator_id)
        .filter(id => calculators.some(c => c.id === id));
      if (validIds.length > 0) {
        setSelectedIndicatorIds(validIds);
        indicatorsSynced.current = true;
      }
    }
  }, [selectedIndicators, calculators]);

  // Mutations
  const zoneAnalysis = useRunZoneAnalysis();
  const designStrategies = useRunDesignStrategies();
  const fullAnalysis = useRunFullAnalysis();
  const projectPipeline = useRunProjectPipeline();

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

  // Parse summary
  const parsedSummary = useMemo(() => {
    if (!parsedData) return null;
    const zones = new Set(parsedData.zone_statistics.map(s => s.zone_id));
    const indicators = new Set(parsedData.zone_statistics.map(s => s.indicator_id));
    const layers = new Set(parsedData.zone_statistics.map(s => s.layer));
    return { zones: zones.size, indicators: indicators.size, layers: layers.size };
  }, [parsedData]);

  // Parse JSON input
  const handleParseJson = useCallback(() => {
    setParseError(null);
    setParsedData(null);

    if (!inputJson.trim()) return;

    try {
      const json = JSON.parse(inputJson);

      if (json.indicator_definitions && json.zone_statistics) {
        const zoneStats = Array.isArray(json.zone_statistics)
          ? json.zone_statistics
          : Object.values(json.zone_statistics);
        setParsedData({
          indicator_definitions: json.indicator_definitions,
          zone_statistics: zoneStats as IndicatorLayerValue[],
        });
        return;
      }

      if (Array.isArray(json) || (json.zone_statistics && Array.isArray(json.zone_statistics))) {
        const arr: Record<string, unknown>[] = Array.isArray(json) ? json : json.zone_statistics;

        if (arr.length > 0 && ('Indicator' in arr[0] || 'indicator_id' in arr[0])) {
          const indicatorDefs: Record<string, IndicatorDefinitionInput> = {};
          const zoneStats: IndicatorLayerValue[] = arr.map((row: Record<string, unknown>) => {
            const indicatorId = ((row.Indicator ?? row.indicator_id) as string) || '';
            const indicatorName = ((row.indicator_name ?? row.Indicator) as string) || indicatorId;
            if (!indicatorDefs[indicatorId]) {
              indicatorDefs[indicatorId] = {
                id: indicatorId,
                name: indicatorName,
                unit: ((row.unit ?? row.Unit) as string) || '',
                target_direction: ((row.target_direction ?? row.TargetDirection) as string) || 'INCREASE',
              };
            }
            return {
              zone_id: ((row.Zone ?? row.zone_id) as string) || '',
              zone_name: ((row.zone_name ?? row.Zone) as string) || '',
              indicator_id: indicatorId,
              layer: ((row.Layer ?? row.layer) as string) || 'full',
              n_images: (row.n_images ?? row.N ?? undefined) as number | undefined,
              mean: (row.Mean ?? row.mean ?? null) as number | null,
              std: (row.Std ?? row.std ?? null) as number | null,
              min: (row.Min ?? row.min ?? null) as number | null,
              max: (row.Max ?? row.max ?? null) as number | null,
              unit: ((row.unit ?? row.Unit) as string) || '',
              area_sqm: (row.area_sqm ?? row.Area ?? 0) as number,
            };
          });

          setParsedData({ indicator_definitions: indicatorDefs, zone_statistics: zoneStats });
          return;
        }
      }

      setParseError('Unrecognized JSON format. Expected { indicator_definitions, zone_statistics } or flat array with Indicator/Zone/Layer/Mean fields.');
    } catch (e) {
      setParseError(`Invalid JSON: ${(e as Error).message}`);
    }
  }, [inputJson]);

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

  // Run Stage 2.5 only
  const handleRunStage25 = useCallback(async () => {
    if (!parsedData) return;
    try {
      const result = await zoneAnalysis.mutateAsync({
        ...parsedData,
        zscore_moderate: zscoreModerate,
        zscore_significant: zscoreSignificant,
        zscore_critical: zscoreCritical,
      });
      setZoneResult(result);
      setDesignResult(null);
      toast({ title: 'Stage 2.5 analysis complete', status: 'success', duration: 3000 });
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, 'Analysis failed');
      toast({ title: msg, status: 'error' });
    }
  }, [parsedData, zscoreModerate, zscoreSignificant, zscoreCritical, zoneAnalysis, toast]);

  // Run full pipeline
  const handleRunFull = useCallback(async () => {
    if (!parsedData) return;
    try {
      const request: FullAnalysisRequest = {
        ...parsedData,
        zscore_moderate: zscoreModerate,
        zscore_significant: zscoreSignificant,
        zscore_critical: zscoreCritical,
        use_llm: useLlm,
      };
      const result = await fullAnalysis.mutateAsync(request);
      setZoneResult(result.zone_analysis);
      setDesignResult(result.design_strategies);
      toast({ title: 'Full pipeline complete', status: 'success', duration: 3000 });
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, 'Full pipeline failed');
      toast({ title: msg, status: 'error' });
    }
  }, [parsedData, zscoreModerate, zscoreSignificant, zscoreCritical, useLlm, fullAnalysis, toast]);

  // Generate strategies from existing Stage 2.5 result
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

  const isRunning = zoneAnalysis.isPending || fullAnalysis.isPending || designStrategies.isPending || projectPipeline.isPending;

  // Indicator selection helpers
  const handleSelectAllIndicators = useCallback(() => {
    if (calculators) {
      setSelectedIndicatorIds(calculators.map(c => c.id));
    }
  }, [calculators]);

  const handleClearIndicators = useCallback(() => {
    setSelectedIndicatorIds([]);
  }, []);

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
          <Heading size="md">Input Data</Heading>
        </CardHeader>
        <CardBody>
          <Tabs variant="enclosed" index={inputMode} onChange={setInputMode} colorScheme="green" mb={4}>
            <TabList>
              <Tab>Project Pipeline</Tab>
              <Tab>Manual JSON</Tab>
            </TabList>

            <TabPanels>
              {/* Tab 1: Project Pipeline */}
              <TabPanel px={0}>
                <VStack spacing={4} align="stretch">
                  {/* Project selector */}
                  <FormControl>
                    <FormLabel fontSize="sm">Project</FormLabel>
                    {routeProjectId ? (
                      <Text fontWeight="bold" py={2}>
                        {selectedProject?.project_name || routeProjectId}
                      </Text>
                    ) : (
                      <Select
                        placeholder="Select a project..."
                        value={selectedProjectId}
                        onChange={e => setSelectedProjectId(e.target.value)}
                      >
                        {projects?.map(p => {
                          const zones = p.spatial_zones.length;
                          const imgs = p.uploaded_images.length;
                          return (
                            <option key={p.id} value={p.id}>
                              {p.project_name} ({zones} zones, {imgs} images)
                            </option>
                          );
                        })}
                      </Select>
                    )}
                  </FormControl>

                  {/* Project summary */}
                  {projectSummary && (
                    <Alert status={projectSummary.assignedImages > 0 ? 'info' : 'warning'}>
                      <AlertIcon />
                      {projectSummary.assignedImages} of {projectSummary.totalImages} images assigned to {projectSummary.zones} zones
                      {projectSummary.assignedImages === 0 && ' — assign images to zones before running the pipeline'}
                    </Alert>
                  )}

                  {/* Calculator selection */}
                  <FormControl>
                    <HStack justify="space-between" mb={2}>
                      <FormLabel fontSize="sm" mb={0}>Indicators</FormLabel>
                      <HStack spacing={2}>
                        <Button size="xs" variant="ghost" onClick={handleSelectAllIndicators}>
                          Select All
                        </Button>
                        <Button size="xs" variant="ghost" onClick={handleClearIndicators}>
                          Clear All
                        </Button>
                      </HStack>
                    </HStack>
                    <CheckboxGroup value={selectedIndicatorIds} onChange={vals => setSelectedIndicatorIds(vals as string[])}>
                      <VStack align="stretch" maxH="200px" overflowY="auto" spacing={1} p={2} borderWidth="1px" borderRadius="md">
                        {calculators?.map(c => (
                          <Checkbox key={c.id} value={c.id} size="sm">
                            <Text fontSize="sm">
                              {c.name} <Text as="span" color="gray.500">({c.id})</Text>
                            </Text>
                          </Checkbox>
                        ))}
                        {(!calculators || calculators.length === 0) && (
                          <Text fontSize="sm" color="gray.500">No calculators available</Text>
                        )}
                      </VStack>
                    </CheckboxGroup>
                  </FormControl>

                  {/* Run button */}
                  <Button
                    colorScheme="green"
                    onClick={handleRunPipeline}
                    isLoading={projectPipeline.isPending}
                    isDisabled={!selectedProjectId || selectedIndicatorIds.length === 0 || isRunning}
                  >
                    Run Project Pipeline
                  </Button>

                  {/* Pipeline result summary */}
                  {pipelineResult && (
                    <Card variant="outline">
                      <CardBody>
                        <VStack spacing={3} align="stretch">
                          <Heading size="sm">Pipeline Result: {pipelineResult.project_name}</Heading>
                          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
                            <Box>
                              <Text fontSize="xs" color="gray.500">Images Processed</Text>
                              <Text fontWeight="bold">{pipelineResult.zone_assigned_images} / {pipelineResult.total_images}</Text>
                            </Box>
                            <Box>
                              <Text fontSize="xs" color="gray.500">Calculations OK</Text>
                              <Text fontWeight="bold" color="green.600">{pipelineResult.calculations_succeeded}</Text>
                            </Box>
                            <Box>
                              <Text fontSize="xs" color="gray.500">Calculations Failed</Text>
                              <Text fontWeight="bold" color={pipelineResult.calculations_failed > 0 ? 'red.600' : undefined}>
                                {pipelineResult.calculations_failed}
                              </Text>
                            </Box>
                            <Box>
                              <Text fontSize="xs" color="gray.500">Zone Statistics</Text>
                              <Text fontWeight="bold">{pipelineResult.zone_statistics_count}</Text>
                            </Box>
                          </SimpleGrid>

                          <Divider />

                          {/* Step progress */}
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
                </VStack>
              </TabPanel>

              {/* Tab 2: Manual JSON */}
              <TabPanel px={0}>
                <VStack spacing={4} align="stretch">
                  <Textarea
                    placeholder="Paste zone statistics JSON here..."
                    value={inputJson}
                    onChange={(e) => setInputJson(e.target.value)}
                    fontFamily="mono"
                    fontSize="sm"
                    rows={10}
                    resize="vertical"
                  />

                  <Button size="sm" onClick={handleParseJson} isDisabled={!inputJson.trim()}>
                    Parse JSON
                  </Button>

                  {parseError && (
                    <Alert status="error">
                      <AlertIcon />
                      {parseError}
                    </Alert>
                  )}

                  {parsedSummary && (
                    <Alert status="success">
                      <AlertIcon />
                      Loaded: {parsedSummary.zones} zones x {parsedSummary.indicators} indicators x {parsedSummary.layers} layers
                    </Alert>
                  )}
                </VStack>
              </TabPanel>
            </TabPanels>
          </Tabs>

          <Divider mb={4} />

          {/* Shared configuration row */}
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

          {/* Manual mode action buttons */}
          {inputMode === 1 && (
            <HStack spacing={4}>
              <Button
                colorScheme="green"
                variant="outline"
                onClick={handleRunStage25}
                isLoading={zoneAnalysis.isPending}
                isDisabled={!parsedData || isRunning}
              >
                Run Stage 2.5 Only
              </Button>
              <Button
                colorScheme="green"
                onClick={handleRunFull}
                isLoading={fullAnalysis.isPending}
                isDisabled={!parsedData || isRunning}
              >
                Run Full Pipeline
              </Button>
            </HStack>
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
                      <Text fontWeight="bold" fontSize="sm" noOfLines={1}>{diag.zone_name}</Text>
                      <Badge colorScheme={STATUS_COLORS[diag.status] || 'gray'}>
                        {diag.status}
                      </Badge>
                    </HStack>
                    <HStack justify="space-between">
                      <Text fontSize="xs" color="gray.600">Total Priority</Text>
                      <Text fontWeight="bold">{diag.total_priority}</Text>
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

          {/* Statistics Table + Correlation Matrix with shared layer tabs */}
          <Tabs index={selectedLayer} onChange={setSelectedLayer} colorScheme="green" mb={6}>
            <TabList>
              {LAYERS.map(l => <Tab key={l}>{LAYER_LABELS[l]}</Tab>)}
            </TabList>

            <TabPanels>
              {LAYERS.map((layer) => (
                <TabPanel key={layer} px={0}>
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
                    <Card>
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
                </TabPanel>
              ))}
            </TabPanels>
          </Tabs>

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
                Generate Design Strategies (Stage 3)
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
                              <Badge colorScheme={
                                strategy.confidence === 'High' ? 'green' :
                                strategy.confidence === 'Medium' ? 'yellow' : 'gray'
                              }>
                                {strategy.confidence}
                              </Badge>
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
          <Button as={Link} to={`/projects/${routeProjectId}/indicators`} variant="outline">
            Back: Indicators
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
