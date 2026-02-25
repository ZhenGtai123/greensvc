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
  Divider,
  Progress,
  Wrap,
  WrapItem,
  Tag,
  TagLabel,
  Icon,
} from '@chakra-ui/react';
import { Download, FileText, CheckCircle, AlertTriangle } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { generateReport } from '../utils/generateReport';
import useAppToast from '../hooks/useAppToast';
import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

function Reports() {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const toast = useAppToast();

  const {
    currentProject,
    recommendations,
    selectedIndicators,
    zoneAnalysisResult,
    designStrategyResult,
    pipelineResult,
  } = useAppStore();

  const projectName = currentProject?.project_name || pipelineResult?.project_name || 'Unknown Project';

  // Pipeline completion status
  const hasVision = (currentProject?.uploaded_images?.length ?? 0) > 0;
  const hasIndicators = recommendations.length > 0;
  const hasAnalysis = zoneAnalysisResult !== null;
  const hasDesign = designStrategyResult !== null;

  const steps = [
    { name: 'Vision', done: hasVision },
    { name: 'Indicators', done: hasIndicators },
    { name: 'Analysis', done: hasAnalysis },
    { name: 'Design', done: hasDesign },
  ];
  const completedSteps = steps.filter(s => s.done).length;

  const isEmpty = !hasIndicators && !hasAnalysis && !hasDesign;

  const handleDownloadMarkdown = () => {
    if (!zoneAnalysisResult) {
      toast({ title: 'No analysis data to export', status: 'warning' });
      return;
    }
    const md = generateReport({
      projectName,
      pipelineResult,
      zoneResult: zoneAnalysisResult,
      designResult: designStrategyResult,
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

  // Sort zone diagnostics by priority
  const sortedDiags = zoneAnalysisResult
    ? [...zoneAnalysisResult.zone_diagnostics].sort((a, b) => b.total_priority - a.total_priority)
    : [];

  return (
    <PageShell>
      <PageHeader title="Report Generation">
        <HStack>
          <Button
            size="sm"
            leftIcon={<Download size={14} />}
            onClick={handleDownloadMarkdown}
            isDisabled={!hasAnalysis}
            colorScheme="blue"
          >
            Download MD
          </Button>
          <Button
            size="sm"
            leftIcon={<FileText size={14} />}
            onClick={handleExportJson}
            isDisabled={isEmpty}
          >
            Export JSON
          </Button>
        </HStack>
      </PageHeader>

      {isEmpty ? (
        <EmptyState
          icon={AlertTriangle}
          title="No pipeline results yet"
          description="Complete the pipeline steps (Vision → Indicators → Analysis) to generate a report. Navigate to your project to get started."
        />
      ) : (
        <VStack spacing={6} align="stretch">
          {/* Pipeline Overview */}
          <Card>
            <CardHeader>
              <Heading size="md">Pipeline Overview</Heading>
            </CardHeader>
            <CardBody>
              <VStack align="stretch" spacing={4}>
                <HStack justify="space-between" flexWrap="wrap" gap={2}>
                  <Text><strong>Project:</strong> {projectName}</Text>
                  {pipelineResult && (
                    <>
                      <Text><strong>Images:</strong> {pipelineResult.total_images}</Text>
                      <Text><strong>Zone Images:</strong> {pipelineResult.zone_assigned_images}</Text>
                      <Text><strong>Calculations:</strong> {pipelineResult.calculations_succeeded}/{pipelineResult.calculations_run}</Text>
                    </>
                  )}
                </HStack>
                <Divider />
                <HStack spacing={4} flexWrap="wrap">
                  {steps.map(s => (
                    <HStack key={s.name} spacing={1}>
                      <Icon
                        as={s.done ? CheckCircle : AlertTriangle}
                        color={s.done ? 'green.500' : 'gray.400'}
                        boxSize={4}
                      />
                      <Text fontSize="sm" color={s.done ? 'green.600' : 'gray.500'}>
                        {s.name}
                      </Text>
                    </HStack>
                  ))}
                  <Text fontSize="sm" color="gray.500" ml="auto">
                    {completedSteps}/{steps.length} completed
                  </Text>
                </HStack>

                {/* Pipeline steps detail */}
                {pipelineResult && pipelineResult.steps.length > 0 && (
                  <Box>
                    <Text fontSize="sm" fontWeight="medium" mb={2}>Pipeline Steps:</Text>
                    <VStack align="stretch" spacing={1}>
                      {pipelineResult.steps.map((s, i) => (
                        <HStack key={i} fontSize="sm">
                          <Badge colorScheme={s.status === 'completed' ? 'green' : s.status === 'skipped' ? 'gray' : 'red'} fontSize="xs">
                            {s.status}
                          </Badge>
                          <Text fontWeight="medium">{s.step}</Text>
                          <Text color="gray.500">{s.detail}</Text>
                        </HStack>
                      ))}
                    </VStack>
                  </Box>
                )}
              </VStack>
            </CardBody>
          </Card>

          {/* Recommended Indicators */}
          {recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <HStack justify="space-between">
                  <Heading size="md">Recommended Indicators ({recommendations.length})</Heading>
                  <Badge colorScheme="blue">{selectedIndicators.length} selected</Badge>
                </HStack>
              </CardHeader>
              <CardBody>
                <Wrap spacing={3}>
                  {recommendations.map(rec => {
                    const selected = selectedIndicators.some(s => s.indicator_id === rec.indicator_id);
                    return (
                      <WrapItem key={rec.indicator_id}>
                        <Tag
                          size="lg"
                          colorScheme={selected ? 'green' : 'gray'}
                          variant={selected ? 'solid' : 'outline'}
                        >
                          <TagLabel>
                            {rec.indicator_id} {(rec.relevance_score * 100).toFixed(0)}%
                          </TagLabel>
                        </Tag>
                      </WrapItem>
                    );
                  })}
                </Wrap>
              </CardBody>
            </Card>
          )}

          {/* Zone Diagnostics Summary */}
          {sortedDiags.length > 0 && (
            <Card>
              <CardHeader>
                <Heading size="md">Zone Diagnostics Summary</Heading>
              </CardHeader>
              <CardBody p={0}>
                <Box overflowX="auto">
                  <Table size="sm">
                    <Thead>
                      <Tr>
                        <Th>Zone</Th>
                        <Th>Status</Th>
                        <Th isNumeric>Total Priority</Th>
                        <Th isNumeric>High Priority Problems</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {sortedDiags.map(d => {
                        const highProblems = Object.values(d.problems_by_layer)
                          .flat()
                          .filter(p => p.priority >= 4).length;
                        return (
                          <Tr key={d.zone_id}>
                            <Td fontWeight="medium">{d.zone_name}</Td>
                            <Td>
                              <Badge colorScheme={
                                d.status.toLowerCase().includes('critical') ? 'red' :
                                d.status.toLowerCase().includes('poor') ? 'orange' :
                                d.status.toLowerCase().includes('moderate') ? 'yellow' : 'green'
                              }>
                                {d.status}
                              </Badge>
                            </Td>
                            <Td isNumeric>{d.total_priority}</Td>
                            <Td isNumeric>
                              {highProblems > 0 ? (
                                <Badge colorScheme="red">{highProblems}</Badge>
                              ) : (
                                <Text color="gray.400">0</Text>
                              )}
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

          {/* Zone Statistics Overview */}
          {zoneAnalysisResult && zoneAnalysisResult.zone_statistics.length > 0 && (
            <Card>
              <CardHeader>
                <Heading size="md">Zone Statistics — Full Layer</Heading>
              </CardHeader>
              <CardBody p={0}>
                <Box overflowX="auto">
                  <Table size="sm">
                    <Thead>
                      <Tr>
                        <Th>Zone</Th>
                        <Th>Indicator</Th>
                        <Th isNumeric>Mean</Th>
                        <Th isNumeric>Z-score</Th>
                        <Th isNumeric>Priority</Th>
                        <Th>Classification</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {zoneAnalysisResult.zone_statistics
                        .filter(s => s.layer === 'full')
                        .sort((a, b) => b.priority - a.priority)
                        .slice(0, 20)
                        .map((s, i) => (
                          <Tr key={i}>
                            <Td>{s.zone_name}</Td>
                            <Td><Badge>{s.indicator_id}</Badge></Td>
                            <Td isNumeric>{s.mean !== null && s.mean !== undefined ? s.mean.toFixed(3) : '-'}</Td>
                            <Td isNumeric>{s.z_score !== null && s.z_score !== undefined ? s.z_score.toFixed(2) : '-'}</Td>
                            <Td isNumeric>
                              <Badge colorScheme={s.priority >= 4 ? 'red' : s.priority >= 2 ? 'yellow' : 'green'}>
                                {s.priority}
                              </Badge>
                            </Td>
                            <Td>
                              <Badge colorScheme={
                                s.classification === 'Critical' ? 'red' :
                                s.classification === 'Poor' ? 'orange' :
                                s.classification === 'Moderate' ? 'yellow' : 'green'
                              }>
                                {s.classification}
                              </Badge>
                            </Td>
                          </Tr>
                        ))}
                    </Tbody>
                  </Table>
                </Box>
              </CardBody>
            </Card>
          )}

          {/* Design Strategies */}
          {designStrategyResult && (
            <Card>
              <CardHeader>
                <HStack justify="space-between">
                  <Heading size="md">Design Strategies</Heading>
                  <Badge colorScheme="purple">
                    {designStrategyResult.metadata.total_strategies} strategies
                  </Badge>
                </HStack>
              </CardHeader>
              <CardBody>
                <VStack align="stretch" spacing={4}>
                  {Object.values(designStrategyResult.zones).map(zone => (
                    <Box key={zone.zone_id} p={4} borderWidth="1px" borderRadius="md">
                      <HStack justify="space-between" mb={2}>
                        <Text fontWeight="bold">{zone.zone_name}</Text>
                        <Badge colorScheme={
                          zone.status.toLowerCase().includes('critical') ? 'red' :
                          zone.status.toLowerCase().includes('poor') ? 'orange' : 'green'
                        }>
                          {zone.status}
                        </Badge>
                      </HStack>
                      {zone.overall_assessment && (
                        <Text fontSize="sm" color="gray.600" mb={2}>{zone.overall_assessment}</Text>
                      )}
                      <Text fontSize="sm" fontWeight="medium" mb={1}>
                        {zone.design_strategies.length} strategies:
                      </Text>
                      <VStack align="stretch" spacing={1} pl={3}>
                        {zone.design_strategies.map((s, i) => (
                          <HStack key={i} fontSize="sm">
                            <Badge size="sm" colorScheme="purple">{s.priority}</Badge>
                            <Text>{s.strategy_name}</Text>
                            <Text color="gray.500">({s.confidence})</Text>
                          </HStack>
                        ))}
                      </VStack>
                    </Box>
                  ))}
                </VStack>
              </CardBody>
            </Card>
          )}

          {/* Download section */}
          {hasAnalysis && (
            <Card>
              <CardBody>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  <Button
                    size="lg"
                    colorScheme="blue"
                    leftIcon={<Download size={18} />}
                    onClick={handleDownloadMarkdown}
                  >
                    Download Markdown Report
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    leftIcon={<FileText size={18} />}
                    onClick={handleExportJson}
                  >
                    Export Full JSON Data
                  </Button>
                </SimpleGrid>
              </CardBody>
            </Card>
          )}
        </VStack>
      )}

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
