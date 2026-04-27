import { useState, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
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
  Alert,
  AlertIcon,
  Progress,
  Divider,
  Switch,
  FormControl,
  FormLabel,
  Tag,
  TagLabel,
  Wrap,
  WrapItem,
  Tooltip,
} from '@chakra-ui/react';
import { BarChart3, ArrowRight } from 'lucide-react';
import {
  useCalculators,
  useProjects,
} from '../hooks/useApi';
import type {
  ProjectPipelineProgress,
} from '../types';
import useAppStore from '../store/useAppStore';
import useAppToast from '../hooks/useAppToast';
import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';

const STEP_STATUS_COLORS: Record<string, string> = {
  completed: 'green',
  skipped: 'gray',
  failed: 'red',
};

function Analysis() {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const toast = useAppToast();
  const {
    selectedIndicators,
    pipelineResult,
    zoneAnalysisResult,
    pipelineRun,
    startPipeline,
    cancelPipeline,
  } = useAppStore();

  // Config state
  const [useLlm, setUseLlm] = useState(true);

  // Queries
  const { data: projects } = useProjects();
  const { data: calculators } = useCalculators();

  const selectedProjectId = routeProjectId || '';
  const selectedIndicatorIds = useMemo(() => {
    if (!calculators || calculators.length === 0) return [];
    return selectedIndicators
      .map(i => i.indicator_id)
      .filter(id => calculators.some(c => c.id === id));
  }, [selectedIndicators, calculators]);

  // A pipeline is "running for *this* project" iff the global run state is
  // active and pinned to this projectId. If another project's pipeline is in
  // flight we treat this view as idle but disable the Run button below.
  const isRunningHere = pipelineRun.isRunning && pipelineRun.projectId === selectedProjectId;
  const isRunningElsewhere = pipelineRun.isRunning && pipelineRun.projectId !== selectedProjectId;
  const streamSteps = isRunningHere ? pipelineRun.steps : [];
  const imageProgress = isRunningHere ? pipelineRun.imageProgress : null;
  const streamStartedAt = isRunningHere ? pipelineRun.startedAt : null;
  // After run_calculations completes the per-image counters stop updating,
  // so the determinate "X / Y · 100%" bar would falsely look done while
  // aggregate / zone_analysis / design_strategies are still running. Use
  // this flag to swap to an indeterminate "running stage…" indicator.
  const calcDone = streamSteps.some(s => s.step === 'run_calculations' && s.status === 'completed');
  const activeStage = streamSteps.find(s => s.status === 'running') ?? streamSteps[streamSteps.length - 1];

  const selectedProject = useMemo(() => {
    if (!selectedProjectId || !projects) return null;
    return projects.find(p => p.id === selectedProjectId) ?? null;
  }, [selectedProjectId, projects]);

  const projectSummary = useMemo(() => {
    if (!selectedProject) return null;
    const totalImages = selectedProject.uploaded_images.length;
    const assigned = selectedProject.uploaded_images.filter(img => img.zone_id);
    const assignedImages = assigned.length;
    const analyzedImages = assigned.filter(img => {
      const mp = img.mask_filepaths;
      return !!(mp?.semantic_map || mp?.front_semantic_map || mp?.left_semantic_map || mp?.right_semantic_map);
    }).length;
    const zones = selectedProject.spatial_zones.length;
    return { totalImages, assignedImages, analyzedImages, zones };
  }, [selectedProject]);

  const handleRunPipeline = useCallback(async () => {
    if (!selectedProjectId || selectedIndicatorIds.length === 0) return;
    const projectName = selectedProject?.project_name || routeProjectId || 'Unknown';
    await startPipeline({
      projectId: selectedProjectId,
      projectName,
      indicatorIds: selectedIndicatorIds,
      useLlm,
      onComplete: () => toast({ title: 'Pipeline complete', status: 'success', duration: 3000 }),
      onError: (msg) => toast({ title: msg, status: 'error' }),
    });
  }, [selectedProjectId, selectedIndicatorIds, useLlm, selectedProject, routeProjectId, startPipeline, toast]);

  const handleCancelPipeline = useCallback(() => {
    cancelPipeline();
    toast({ title: 'Pipeline cancelled', status: 'info' });
  }, [cancelPipeline, toast]);

  // Pipeline ran successfully — user can proceed to Reports even if zone_analysis
  // is empty (e.g. n_zones=1 with nothing to compare). Reports page handles nulls.
  const hasResults = pipelineResult !== null;

  // ETA estimation from the live per-image counter
  const etaSeconds = useMemo(() => {
    if (!imageProgress || !streamStartedAt || imageProgress.current === 0) return null;
    const elapsed = (Date.now() - streamStartedAt) / 1000;
    const perImage = elapsed / imageProgress.current;
    const remaining = imageProgress.total - imageProgress.current;
    return Math.round(perImage * remaining);
  }, [imageProgress, streamStartedAt]);

  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }

  return (
    <PageShell>
      <PageHeader title="Analysis Pipeline" />

      {/* Pipeline Configuration */}
      <Card mb={6}>
        <CardHeader>
          <Heading size="md">Pipeline Configuration</Heading>
        </CardHeader>
        <CardBody>
          <Text fontWeight="bold" mb={3}>
            Project: {selectedProject?.project_name || routeProjectId || 'No project'}
          </Text>

          {isRunningElsewhere && (
            <Alert status="warning" mb={4}>
              <AlertIcon />
              A pipeline is already running for another project ({pipelineRun.projectName}).
              Wait for it to finish before starting a new run.
            </Alert>
          )}

          {projectSummary && (
            <>
              <Alert status={projectSummary.assignedImages > 0 ? 'info' : 'warning'} mb={4}>
                <AlertIcon />
                {projectSummary.assignedImages} of {projectSummary.totalImages} images assigned to {projectSummary.zones} zones
              </Alert>
              {projectSummary.assignedImages > 0 && projectSummary.analyzedImages === 0 && (
                <Alert status="error" mb={4}>
                  <AlertIcon />
                  No images have been analyzed by Vision API. Go to Prepare step to run vision analysis first.
                </Alert>
              )}
              {projectSummary.analyzedImages > 0 && projectSummary.analyzedImages < projectSummary.assignedImages && (
                <Alert status="warning" mb={4}>
                  <AlertIcon />
                  Only {projectSummary.analyzedImages} of {projectSummary.assignedImages} zone-assigned images have vision results. Unanalyzed images will be skipped.
                </Alert>
              )}
            </>
          )}

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

          <Text fontSize="xs" fontWeight="semibold" color="gray.500" textTransform="uppercase" letterSpacing="wide" mb={2}>
            Analysis Parameters
          </Text>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} alignItems="end" mb={4}>
            <FormControl display="flex" alignItems="center">
              <Tooltip label="When enabled, Stage 3 uses LLM for context-aware design strategies (Agent A determines direction). When disabled, uses rule-based matching." placement="top" hasArrow maxW="320px">
                <FormLabel fontSize="sm" mb={0} cursor="help" borderBottom="1px dashed" borderColor="gray.300">
                  Use LLM (Stage 3)
                </FormLabel>
              </Tooltip>
              <Switch isChecked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} colorScheme="green" />
            </FormControl>
          </SimpleGrid>

          <Button
            colorScheme="green"
            onClick={handleRunPipeline}
            isLoading={isRunningHere}
            isDisabled={
              !selectedProjectId ||
              selectedIndicatorIds.length === 0 ||
              pipelineRun.isRunning ||
              projectSummary?.analyzedImages === 0
            }
            mt={4}
          >
            Run Pipeline
          </Button>
        </CardBody>
      </Card>

      {/* Live progress during streaming pipeline run */}
      {isRunningHere && (
        <Card mb={6}>
          <CardHeader>
            <HStack justify="space-between">
              <Heading size="md">Pipeline Progress</Heading>
              <Button size="sm" variant="outline" colorScheme="red" onClick={handleCancelPipeline}>
                Cancel
              </Button>
            </HStack>
          </CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={4}>
              {/* Per-image progress (the slow part: calculators running on N images) */}
              {imageProgress && !calcDone && (
                <Box>
                  <HStack justify="space-between" mb={1}>
                    <Text fontSize="sm" fontWeight="bold">
                      Calculating metrics — {imageProgress.current} / {imageProgress.total} images
                    </Text>
                    <Text fontSize="xs" color="gray.500">
                      {((imageProgress.current / imageProgress.total) * 100).toFixed(0)}%
                      {etaSeconds !== null && etaSeconds > 0 && ` · ~${formatDuration(etaSeconds)} remaining`}
                    </Text>
                  </HStack>
                  <Progress
                    value={(imageProgress.current / imageProgress.total) * 100}
                    colorScheme="green"
                    hasStripe
                    isAnimated
                    borderRadius="md"
                  />
                  <HStack mt={2} spacing={4} fontSize="xs" color="gray.600">
                    <Text noOfLines={1} flex={1}>Current: {imageProgress.filename}</Text>
                    <Text color="green.600">{imageProgress.succeeded} ok</Text>
                    {imageProgress.failed > 0 && <Text color="red.600">{imageProgress.failed} failed</Text>}
                    {imageProgress.cached > 0 && <Text color="gray.500">{imageProgress.cached} cached</Text>}
                  </HStack>
                </Box>
              )}

              {/* Post-calc indeterminate progress: aggregate / zone_analysis /
                  design_strategies stages don't have a numeric percentage,
                  so show a flowing bar with the active stage label. */}
              {calcDone && activeStage && activeStage.status === 'running' && (
                <Box>
                  <HStack justify="space-between" mb={1}>
                    <Text fontSize="sm" fontWeight="bold">
                      {activeStage.step === 'aggregate'
                        ? 'Aggregating zone statistics…'
                        : activeStage.step === 'zone_analysis'
                          ? 'Analyzing zones (Stage 2.5)…'
                          : activeStage.step === 'design_strategies'
                            ? 'Generating design strategies (Stage 3 · LLM)…'
                            : `Running ${activeStage.step}…`}
                    </Text>
                  </HStack>
                  <Progress isIndeterminate colorScheme="green" hasStripe borderRadius="md" />
                  {activeStage.detail && (
                    <Text mt={2} fontSize="xs" color="gray.600" noOfLines={1}>
                      {activeStage.detail}
                    </Text>
                  )}
                </Box>
              )}

              {/* Pipeline stage list — fills in as SSE status events arrive */}
              {streamSteps.length > 0 && (
                <Box>
                  <Text fontSize="xs" fontWeight="bold" color="gray.500" mb={2} textTransform="uppercase">
                    Stages
                  </Text>
                  <VStack align="stretch" spacing={1}>
                    {streamSteps.map((s, i) => (
                      <HStack key={i} fontSize="sm" spacing={2}>
                        <Badge
                          colorScheme={
                            s.status === 'completed' ? 'green' :
                            s.status === 'failed' ? 'red' :
                            s.status === 'running' ? 'blue' : 'gray'
                          }
                          variant={s.status === 'running' ? 'solid' : 'subtle'}
                        >
                          {s.status}
                        </Badge>
                        <Text fontWeight="semibold">{s.step}</Text>
                        <Text color="gray.600" fontSize="xs" noOfLines={1}>{s.detail}</Text>
                      </HStack>
                    ))}
                  </VStack>
                </Box>
              )}

              {!imageProgress && streamSteps.length === 0 && (
                <Text fontSize="sm" color="gray.500">Initializing pipeline…</Text>
              )}
            </VStack>
          </CardBody>
        </Card>
      )}

      {/* Pipeline Result Summary */}
      {pipelineResult && !isRunningHere && (
        <Card mb={6}>
          <CardHeader>
            <Heading size="md">Pipeline Results</Heading>
          </CardHeader>
          <CardBody>
            <SimpleGrid columns={{ base: 2, md: 5 }} spacing={4} mb={4}>
              <Box>
                <Text fontSize="xs" color="gray.500">Images</Text>
                <Text fontSize="xl" fontWeight="bold">{pipelineResult.zone_assigned_images} / {pipelineResult.total_images}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="gray.500">Calculated</Text>
                <Text fontSize="xl" fontWeight="bold" color="green.600">
                  {pipelineResult.calculations_succeeded + pipelineResult.calculations_cached}
                </Text>
                {pipelineResult.calculations_cached > 0 && (
                  <Text fontSize="2xs" color="gray.400">
                    {pipelineResult.calculations_succeeded} new, {pipelineResult.calculations_cached} cached
                  </Text>
                )}
              </Box>
              <Box>
                <Text fontSize="xs" color="gray.500">Failed</Text>
                <Text fontSize="xl" fontWeight="bold" color={pipelineResult.calculations_failed > 0 ? 'red.600' : 'gray.400'}>
                  {pipelineResult.calculations_failed}
                </Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="gray.500">Zone Stats</Text>
                <Text fontSize="xl" fontWeight="bold">{pipelineResult.zone_statistics_count}</Text>
              </Box>
              <Box>
                <Text fontSize="xs" color="gray.500">Zones Analyzed</Text>
                <Text fontSize="xl" fontWeight="bold">
                  {zoneAnalysisResult?.zone_diagnostics?.length ?? 0}
                </Text>
              </Box>
            </SimpleGrid>

            <Wrap spacing={2} mb={4}>
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

            {hasResults && (
              <Button
                colorScheme="blue"
                size="lg"
                rightIcon={<ArrowRight size={18} />}
                onClick={() => navigate(`/projects/${routeProjectId}/reports`)}
                w="full"
                mb={4}
              >
                View Results & Report
              </Button>
            )}

            {pipelineResult.skipped_images?.length > 0 && (
              <Alert status="info" borderRadius="md" alignItems="flex-start">
                <AlertIcon mt={1} />
                <Box flex={1}>
                  <HStack justify="space-between" align="flex-start" mb={1}>
                    <Text fontSize="sm" fontWeight="bold">
                      {pipelineResult.skipped_images.length} image(s) skipped — results are based on the remaining images
                    </Text>
                    <Button
                      size="xs"
                      colorScheme="orange"
                      variant="outline"
                      onClick={() => navigate(`/projects/${routeProjectId}/vision`)}
                      flexShrink={0}
                    >
                      Retry Vision
                    </Button>
                  </HStack>
                  <Text fontSize="xs" color="gray.600" mb={2}>
                    {pipelineResult.skipped_images.filter(s => s.reason === 'no_semantic_map').length > 0 &&
                      `${pipelineResult.skipped_images.filter(s => s.reason === 'no_semantic_map').length} not analyzed by Vision API`}
                    {pipelineResult.skipped_images.filter(s => s.reason === 'no_semantic_map').length > 0 &&
                      pipelineResult.skipped_images.filter(s => s.reason === 'invalid_semantic_map').length > 0 && ', '}
                    {pipelineResult.skipped_images.filter(s => s.reason === 'invalid_semantic_map').length > 0 &&
                      `${pipelineResult.skipped_images.filter(s => s.reason === 'invalid_semantic_map').length} invalid semantic map (single-color)`}
                  </Text>
                  <Wrap spacing={1}>
                    {pipelineResult.skipped_images.slice(0, 10).map(s => (
                      <WrapItem key={s.image_id}>
                        <Tag size="sm" colorScheme={s.reason === 'no_semantic_map' ? 'orange' : 'red'} variant="subtle">
                          <TagLabel>{s.filename}</TagLabel>
                        </Tag>
                      </WrapItem>
                    ))}
                    {pipelineResult.skipped_images.length > 10 && (
                      <WrapItem>
                        <Tag size="sm" variant="subtle">+{pipelineResult.skipped_images.length - 10} more</Tag>
                      </WrapItem>
                    )}
                  </Wrap>
                </Box>
              </Alert>
            )}
          </CardBody>
        </Card>
      )}

      {/* Empty state */}
      {!pipelineResult && !isRunningHere && (
        <Card>
          <CardBody textAlign="center" py={10}>
            <BarChart3 size={48} style={{ margin: '0 auto', opacity: 0.3 }} />
            <Text color="gray.500" mt={4}>
              Configure parameters above and run the pipeline to start analysis.
            </Text>
          </CardBody>
        </Card>
      )}

      {/* Navigation */}
      {routeProjectId && (
        <HStack justify="space-between" mt={6}>
          <Button as={Link} to={`/projects/${routeProjectId}/vision`} variant="outline">
            Back: Prepare
          </Button>
          <Button
            as={Link}
            to={`/projects/${routeProjectId}/reports`}
            colorScheme="blue"
            isDisabled={!hasResults}
          >
            Next: Results & Report
          </Button>
        </HStack>
      )}
    </PageShell>
  );
}

export default Analysis;
