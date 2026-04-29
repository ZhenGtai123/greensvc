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
  // The per-image counters are only meaningful while run_calculations is
  // active; once that step completes, hide them so they don't show stale
  // values while later stages run.
  const calcDone = streamSteps.some(s => s.step === 'run_calculations' && s.status === 'completed');

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

  // Pipeline ran successfully — user can proceed to Reports even if zone_analysis
  // is empty (e.g. n_zones=1 with nothing to compare). Reports page handles nulls.
  const hasResults = pipelineResult !== null;

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

      {/* Pipeline detail during a streaming run — complements the top sticky
          banner (which already shows progress %, ETA, active stage, Cancel).
          This card carries info the banner can't fit: the current image
          filename, success/failure counters, and the full stage history. */}
      {isRunningHere && (
        <Card mb={6}>
          <CardHeader>
            <Heading size="md">Pipeline Detail</Heading>
          </CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={4}>
              {/* Per-image counters (only meaningful during run_calculations) */}
              {imageProgress && !calcDone && (
                <HStack spacing={4} fontSize="sm">
                  <Text noOfLines={1} flex={1} color="gray.700">
                    Current:{' '}
                    <Text as="span" fontWeight="semibold">{imageProgress.filename}</Text>
                  </Text>
                  <Text color="green.600">{imageProgress.succeeded} ok</Text>
                  {imageProgress.failed > 0 && <Text color="red.600">{imageProgress.failed} failed</Text>}
                  {imageProgress.cached > 0 && <Text color="gray.500">{imageProgress.cached} cached</Text>}
                </HStack>
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
