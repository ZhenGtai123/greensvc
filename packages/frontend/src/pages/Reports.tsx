import { useMemo, useRef, useCallback, useState } from 'react';
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
  Textarea,
  Collapse,
} from '@chakra-ui/react';
import { Download, FileText, FileImage, CheckCircle, AlertTriangle, Sparkles } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { generateReport } from '../utils/generateReport';
import { useGenerateReport } from '../hooks/useApi';
import useAppToast from '../hooks/useAppToast';
import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
// Charts removed — they live in Analysis page only
import type { ReportRequest } from '../types';

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
  } = useAppStore();

  const projectName = currentProject?.project_name || pipelineResult?.project_name || 'Unknown Project';

  // Agent C report generation
  const generateReportMutation = useGenerateReport();
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [aiReportMeta, setAiReportMeta] = useState<Record<string, unknown> | null>(null);

  const handleGenerateAiReport = useCallback(async () => {
    if (!zoneAnalysisResult) return;
    toast({ title: 'Generating AI report (Agent C)...', status: 'info', duration: 3000 });
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
    } catch (err) {
      console.error('Agent C report failed:', err);
      toast({ title: 'AI report generation failed', status: 'error' });
    }
  }, [zoneAnalysisResult, designStrategyResult, recommendations, currentProject, generateReportMutation, toast]);

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

  const reportRef = useRef<HTMLDivElement>(null);

  const handleDownloadPdf = useCallback(async () => {
    if (!reportRef.current) return;
    toast({ title: 'Generating PDF...', status: 'info', duration: 2000 });
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');

      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#FFFFFF',
      });

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pageHeight = 297; // A4 height in mm

      const pdf = new jsPDF('p', 'mm', 'a4');
      let position = 0;

      // Multi-page if content is taller than one page
      while (position < imgHeight) {
        if (position > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, -position, imgWidth, imgHeight);
        position += pageHeight;
      }

      pdf.save(`${projectName.replace(/\s+/g, '_')}_report.pdf`);
      toast({ title: 'PDF report downloaded', status: 'success' });
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast({ title: 'PDF generation failed', status: 'error' });
    }
  }, [projectName, toast]);

  // Sort zone diagnostics by priority
  const sortedDiags = zoneAnalysisResult
    ? [...zoneAnalysisResult.zone_diagnostics].sort((a, b) => (a.rank || 999) - (b.rank || 999))
    : [];


  return (
    <PageShell>
      <PageHeader title="Report Generation">
        <HStack>
          <Button
            size="sm"
            leftIcon={<Sparkles size={14} />}
            onClick={handleGenerateAiReport}
            isDisabled={!hasAnalysis}
            isLoading={generateReportMutation.isPending}
            loadingText="Generating..."
            colorScheme="purple"
          >
            Generate AI Report
          </Button>
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
            leftIcon={<FileImage size={14} />}
            onClick={handleDownloadPdf}
            isDisabled={!hasAnalysis}
            colorScheme="green"
          >
            Download PDF
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
        <VStack spacing={6} align="stretch" ref={reportRef}>
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

          {/* Agent C: AI-Generated Report */}
          {aiReport && (
            <Card borderColor="purple.200" borderWidth={2}>
              <CardHeader>
                <HStack justify="space-between">
                  <HStack spacing={2}>
                    <Icon as={Sparkles} color="purple.500" />
                    <Heading size="md">AI-Generated Report (Agent C)</Heading>
                  </HStack>
                  <HStack spacing={2}>
                    {aiReportMeta && (
                      <Badge colorScheme="purple" variant="subtle">
                        {String(aiReportMeta.word_count || '?')} words · {String(aiReportMeta.coded_references || '?')} refs
                      </Badge>
                    )}
                    <Button size="xs" colorScheme="purple" variant="outline" onClick={() => {
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
                  </HStack>
                </HStack>
              </CardHeader>
              <CardBody>
                <Box
                  maxH="600px"
                  overflowY="auto"
                  p={4}
                  bg="gray.50"
                  borderRadius="md"
                  fontSize="sm"
                  whiteSpace="pre-wrap"
                  fontFamily="mono"
                  sx={{ '& h1,h2,h3': { fontWeight: 'bold', mt: 4, mb: 2 } }}
                >
                  {aiReport}
                </Box>
              </CardBody>
            </Card>
          )}

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

          {/* Indicator Relationships */}
          {indicatorRelationships.length > 0 && (
            <Card>
              <CardHeader>
                <Heading size="md">Indicator Relationships</Heading>
              </CardHeader>
              <CardBody>
                <VStack align="stretch" spacing={2}>
                  {indicatorRelationships.map((rel, i) => (
                    <HStack key={i} fontSize="sm" spacing={2}>
                      <Badge colorScheme="blue">{rel.indicator_a}</Badge>
                      <Badge
                        colorScheme={rel.relationship_type === 'synergistic' ? 'green' : rel.relationship_type === 'inverse' ? 'red' : 'gray'}
                      >
                        {rel.relationship_type}
                      </Badge>
                      <Badge colorScheme="blue">{rel.indicator_b}</Badge>
                      {rel.explanation && (
                        <Text fontSize="xs" color="gray.500" noOfLines={1} flex={1}>{rel.explanation}</Text>
                      )}
                    </HStack>
                  ))}
                </VStack>
              </CardBody>
            </Card>
          )}

          {/* Recommendation Summary */}
          {recommendationSummary && (
            <Card>
              <CardHeader>
                <Heading size="md">Recommendation Summary</Heading>
              </CardHeader>
              <CardBody>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                  {recommendationSummary.key_findings.length > 0 && (
                    <Box>
                      <Text fontSize="sm" fontWeight="bold" mb={1}>Key Findings</Text>
                      <VStack align="stretch" spacing={1}>
                        {recommendationSummary.key_findings.map((f, i) => (
                          <Text key={i} fontSize="sm">&#x2713; {f}</Text>
                        ))}
                      </VStack>
                    </Box>
                  )}
                  {recommendationSummary.evidence_gaps.length > 0 && (
                    <Box>
                      <Text fontSize="sm" fontWeight="bold" mb={1}>Evidence Gaps</Text>
                      <VStack align="stretch" spacing={1}>
                        {recommendationSummary.evidence_gaps.map((g, i) => (
                          <Text key={i} fontSize="sm">&#x26A0; {g}</Text>
                        ))}
                      </VStack>
                    </Box>
                  )}
                </SimpleGrid>
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
                        <Th>Rank</Th>
                        <Th>Zone</Th>
                        <Th>Status</Th>
                        <Th isNumeric>Composite Z</Th>
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
                            <Td>
                              {d.rank > 0 && <Badge colorScheme="purple">#{d.rank}</Badge>}
                            </Td>
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
                            <Td isNumeric>{d.composite_zscore?.toFixed(2) ?? '-'}</Td>
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
