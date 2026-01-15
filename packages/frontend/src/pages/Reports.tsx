import { useState } from 'react';
import {
  Box,
  Container,
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
  Code,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
} from '@chakra-ui/react';
import { useCalculators, useProjects } from '../hooks/useApi';
import useAppStore from '../store/useAppStore';
import api from '../api';

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
  const { data: calculators } = useCalculators();
  const { data: projects } = useProjects();
  const { selectedIndicators } = useAppStore();
  const toast = useToast();

  const [selectedCalculator, setSelectedCalculator] = useState('');
  const [imagePaths, setImagePaths] = useState('');
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
    <Container maxW="container.xl" py={8}>
      <Heading mb={6}>Report Generation</Heading>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
        {/* Left: Configuration */}
        <VStack spacing={6} align="stretch">
          {/* Selected Indicators from Recommendation */}
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
                <Select
                  placeholder="Select calculator"
                  value={selectedCalculator}
                  onChange={(e) => setSelectedCalculator(e.target.value)}
                >
                  {calculators?.map((calc) => (
                    <option key={calc.id} value={calc.id}>
                      {calc.id} - {calc.name}
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
                    <Button size="sm" onClick={handleExportJson}>
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

              {/* Raw Results Table */}
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
            <Card>
              <CardBody textAlign="center" py={10}>
                <Text color="gray.500">
                  Select a calculator and enter image paths to generate reports.
                </Text>
              </CardBody>
            </Card>
          )}
        </VStack>
      </SimpleGrid>
    </Container>
  );
}

export default Reports;
