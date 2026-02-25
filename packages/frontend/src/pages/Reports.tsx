import { useState, useEffect, useRef } from 'react';
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
  Select,
  Input,
  Alert,
  AlertIcon,
  useToast,
  Spinner,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Divider,
} from '@chakra-ui/react';
import { Download } from 'lucide-react';
import { useCalculators, useProjects, useProject } from '../hooks/useApi';
import useAppStore from '../store/useAppStore';
import api from '../api';
import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

interface CalculationSummary {
  indicator_id: string;
  indicator_name: string;
  total_images: number;
  successful: number;
  failed: number;
  statistics: {
    mean?: number;
    std?: number;
    min?: number;
    max?: number;
    median?: number;
  };
}

function Reports() {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const { data: calculators } = useCalculators();
  const { currentProject, selectedIndicators } = useAppStore();
  const toast = useToast();

  const [selectedCalculator, setSelectedCalculator] = useState('');
  const [imagePaths, setImagePaths] = useState('');

  const [selectedProjectId, setSelectedProjectId] = useState(routeProjectId || currentProject?.id || '');
  const { data: projects } = useProjects();
  const { data: selectedProject } = useProject(selectedProjectId);

  useEffect(() => {
    if (routeProjectId) {
      setSelectedProjectId(routeProjectId);
    }
  }, [routeProjectId]);

  useEffect(() => {
    if (selectedProject) {
      const paths = selectedProject.uploaded_images
        .filter((img: { zone_id: string | null }) => img.zone_id)
        .map((img: { mask_filepaths?: Record<string, string>; filepath: string }) =>
          img.mask_filepaths?.semantic_map || img.filepath
        );
      if (paths.length > 0) {
        setImagePaths(paths.join('\n'));
      }
    }
  }, [selectedProject]);

  const recommendedIds = selectedIndicators.map(i => i.indicator_id);
  const calcSynced = useRef(false);
  useEffect(() => {
    if (calcSynced.current) return;
    if (recommendedIds.length > 0 && calculators) {
      const match = calculators.find(c => recommendedIds.includes(c.id));
      if (match) {
        setSelectedCalculator(match.id);
        calcSynced.current = true;
      }
    }
  }, [calculators, recommendedIds.length]);
  const [calculating, setCalculating] = useState(false);
  const [results, setResults] = useState<CalculationSummary | null>(null);
  const [rawResults, setRawResults] = useState<unknown[]>([]);

  const handleCalculate = async () => {
    if (!selectedCalculator || !imagePaths.trim()) {
      toast({ title: 'Select a calculator and enter image paths', status: 'warning' });
      return;
    }

    const paths = imagePaths.split('\n').map((p) => p.trim()).filter(Boolean);
    if (paths.length === 0) {
      toast({ title: 'Enter at least one image path', status: 'warning' });
      return;
    }

    setCalculating(true);
    setResults(null);
    setRawResults([]);

    try {
      const response = await api.metrics.calculateBatch(selectedCalculator, paths);
      const data = response.data;

      setResults({
        indicator_id: data.indicator_id,
        indicator_name: data.indicator_name,
        total_images: data.total_images,
        successful: data.successful_calculations,
        failed: data.failed_calculations,
        statistics: {
          mean: data.mean_value,
          std: data.std_value,
          min: data.min_value,
          max: data.max_value,
        },
      });
      setRawResults(data.results || []);

      toast({
        title: 'Calculation complete',
        description: `${data.successful_calculations}/${data.total_images} images processed`,
        status: 'success',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Calculation failed';
      toast({ title: message, status: 'error' });
    }

    setCalculating(false);
  };

  const handleExportJson = () => {
    if (!results) return;

    const exportData = {
      indicator: results,
      results: rawResults,
      exported_at: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${results.indicator_id}_results.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell>
      <PageHeader title="Report Generation" />

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
        {/* Left: Configuration */}
        <VStack spacing={6} align="stretch">
          {selectedIndicators.length > 0 && (
            <Alert status="info">
              <AlertIcon />
              {selectedIndicators.length} indicator(s) selected from recommendations
            </Alert>
          )}

          <Card>
            <CardHeader>
              <Heading size="md">Calculate Indicator</Heading>
            </CardHeader>
            <CardBody>
              <VStack spacing={4}>
                <Box w="full">
                  <Text fontSize="sm" mb={1} fontWeight="medium">Project Image Source</Text>
                  {routeProjectId ? (
                    <Text fontWeight="bold" mb={3}>
                      {selectedProject?.project_name || routeProjectId}
                    </Text>
                  ) : (
                    <Select
                      placeholder="Manual input (no project)"
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      mb={3}
                      size="sm"
                    >
                      {projects?.map((p: { id: string; project_name: string }) => (
                        <option key={p.id} value={p.id}>
                          {p.project_name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Box>

                <Select
                  placeholder="Select calculator"
                  value={selectedCalculator}
                  onChange={(e) => setSelectedCalculator(e.target.value)}
                >
                  {calculators
                    ?.slice()
                    .sort((a, b) => {
                      const aRec = recommendedIds.includes(a.id) ? 0 : 1;
                      const bRec = recommendedIds.includes(b.id) ? 0 : 1;
                      return aRec - bRec;
                    })
                    .map((calc) => (
                      <option key={calc.id} value={calc.id}>
                        {recommendedIds.includes(calc.id) ? '\u2605 ' : ''}{calc.id} - {calc.name}
                      </option>
                    ))}
                </Select>

                <Box w="full">
                  <Text fontSize="sm" mb={2}>Image Paths (one per line):</Text>
                  <Input
                    as="textarea"
                    value={imagePaths}
                    onChange={(e) => setImagePaths(e.target.value)}
                    placeholder="/path/to/image1.png&#10;/path/to/image2.png"
                    rows={6}
                    fontFamily="mono"
                    fontSize="sm"
                  />
                </Box>

                <Button
                  colorScheme="green"
                  w="full"
                  onClick={handleCalculate}
                  isLoading={calculating}
                  isDisabled={!selectedCalculator || !imagePaths.trim()}
                >
                  Calculate
                </Button>
              </VStack>
            </CardBody>
          </Card>
        </VStack>

        {/* Right: Results */}
        <VStack spacing={6} align="stretch">
          {calculating && (
            <Card>
              <CardBody textAlign="center" py={10}>
                <Spinner size="xl" />
                <Text mt={4}>Calculating indicator values...</Text>
              </CardBody>
            </Card>
          )}

          {results && (
            <>
              <Card>
                <CardHeader>
                  <HStack justify="space-between">
                    <Heading size="md">Results Summary</Heading>
                    <Button size="sm" onClick={handleExportJson} leftIcon={<Download size={14} />}>
                      Export JSON
                    </Button>
                  </HStack>
                </CardHeader>
                <CardBody>
                  <VStack align="stretch" spacing={4}>
                    <HStack justify="space-between">
                      <Text fontWeight="bold">{results.indicator_name}</Text>
                      <Badge colorScheme="blue">{results.indicator_id}</Badge>
                    </HStack>

                    <Divider />

                    <SimpleGrid columns={3} spacing={4}>
                      <Stat>
                        <StatLabel>Total</StatLabel>
                        <StatNumber>{results.total_images}</StatNumber>
                        <StatHelpText>images</StatHelpText>
                      </Stat>
                      <Stat>
                        <StatLabel>Success</StatLabel>
                        <StatNumber color="green.500">{results.successful}</StatNumber>
                      </Stat>
                      <Stat>
                        <StatLabel>Failed</StatLabel>
                        <StatNumber color="red.500">{results.failed}</StatNumber>
                      </Stat>
                    </SimpleGrid>

                    <Divider />

                    <SimpleGrid columns={2} spacing={4}>
                      <Stat>
                        <StatLabel>Mean</StatLabel>
                        <StatNumber>{results.statistics.mean?.toFixed(2) || 'N/A'}</StatNumber>
                      </Stat>
                      <Stat>
                        <StatLabel>Std Dev</StatLabel>
                        <StatNumber>{results.statistics.std?.toFixed(2) || 'N/A'}</StatNumber>
                      </Stat>
                      <Stat>
                        <StatLabel>Min</StatLabel>
                        <StatNumber>{results.statistics.min?.toFixed(2) || 'N/A'}</StatNumber>
                      </Stat>
                      <Stat>
                        <StatLabel>Max</StatLabel>
                        <StatNumber>{results.statistics.max?.toFixed(2) || 'N/A'}</StatNumber>
                      </Stat>
                    </SimpleGrid>
                  </VStack>
                </CardBody>
              </Card>

              {rawResults.length > 0 && (
                <Card>
                  <CardHeader>
                    <Heading size="md">Detailed Results</Heading>
                  </CardHeader>
                  <CardBody p={0}>
                    <Box overflowX="auto">
                      <Table size="sm">
                        <Thead>
                          <Tr>
                            <Th>Image</Th>
                            <Th isNumeric>Value</Th>
                            <Th>Status</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {rawResults.map((r: unknown, idx: number) => {
                            const result = r as { image_path: string; value: number | null; success: boolean; error?: string };
                            return (
                              <Tr key={idx}>
                                <Td>
                                  <Text fontSize="xs" noOfLines={1}>
                                    {result.image_path.split('/').pop()}
                                  </Text>
                                </Td>
                                <Td isNumeric>
                                  {result.value !== null ? result.value.toFixed(3) : '-'}
                                </Td>
                                <Td>
                                  <Badge colorScheme={result.success ? 'green' : 'red'}>
                                    {result.success ? 'OK' : 'Error'}
                                  </Badge>
                                </Td>
                              </Tr>
                            );
                          })}
                        </Tbody>
                      </Table>
                    </Box>
                  </CardBody>
                </Card>
              )}
            </>
          )}

          {!calculating && !results && (
            <EmptyState
              icon={Download}
              title="No results yet"
              description="Select a calculator and enter image paths to generate reports."
            />
          )}
        </VStack>
      </SimpleGrid>

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
