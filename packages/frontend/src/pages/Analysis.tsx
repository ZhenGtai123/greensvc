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
  Spinner,
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
  useRunDesignStrategies,
  useRunProjectPipeline,
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
  const navigate = useNavigate();
  const toast = useAppToast();
  const {
    selectedIndicators,
    zoneAnalysisResult, setZoneAnalysisResult,
    designStrategyResult, setDesignStrategyResult,
    pipelineResult: storePipelineResult, setPipelineResult: setStorePipelineResult,
  } = useAppStore();

  const pipelineResult = storePipelineResult;
  const setPipelineResult = setStorePipelineResult;
  const setZoneResult = setZoneAnalysisResult;
  const setDesignResult = setDesignStrategyResult;

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

  // Mutations
  const projectPipeline = useRunProjectPipeline();

  const selectedProject = useMemo(() => {
    if (!selectedProjectId || !projects) return null;
    return projects.find(p => p.id === selectedProjectId) ?? null;
  }, [selectedProjectId, projects]);

  const projectSummary = useMemo(() => {
    if (!selectedProject) return null;
    const totalImages = selectedProject.uploaded_images.length;
    const assigned = selectedProject.uploaded_images.filter(img => img.zone_id);
    const assignedImages = assigned.length;
    const analyzedImages = assigned.filter(img => img.mask_filepaths?.semantic_map).length;
    const zones = selectedProject.spatial_zones.length;
    return { totalImages, assignedImages, analyzedImages, zones };
  }, [selectedProject]);

  const handleRunPipeline = useCallback(async () => {
    if (!selectedProjectId || selectedIndicatorIds.length === 0) return;
    try {
      const result = await projectPipeline.mutateAsync({
        project_id: selectedProjectId,
        indicator_ids: selectedIndicatorIds,
        run_stage3: true,
        use_llm: useLlm,
      });
      setPipelineResult(result);
      if (result.zone_analysis) setZoneResult(result.zone_analysis);
      if (result.design_strategies) setDesignResult(result.design_strategies);
      toast({ title: 'Pipeline complete', status: 'success', duration: 3000 });
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, 'Pipeline failed');
      toast({ title: msg, status: 'error' });
    }
  }, [selectedProjectId, selectedIndicatorIds, useLlm, projectPipeline, toast, setPipelineResult, setZoneResult, setDesignResult]);

  const isRunning = projectPipeline.isPending;
  const hasResults = zoneAnalysisResult !== null;

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
            isLoading={isRunning}
            isDisabled={!selectedProjectId || selectedIndicatorIds.length === 0 || isRunning || projectSummary?.analyzedImages === 0}
            mt={4}
          >
            Run Pipeline
          </Button>
        </CardBody>
      </Card>

      {/* Loading */}
      {isRunning && (
        <Card mb={6}>
          <CardBody textAlign="center" py={10}>
            <Spinner size="xl" color="green.500" />
            <Text mt={4}>Running analysis pipeline...</Text>
          </CardBody>
        </Card>
      )}

      {/* Pipeline Result Summary */}
      {pipelineResult && !isRunning && (
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
              >
                View Results & Report
              </Button>
            )}
          </CardBody>
        </Card>
      )}

      {/* Empty state */}
      {!pipelineResult && !isRunning && (
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
