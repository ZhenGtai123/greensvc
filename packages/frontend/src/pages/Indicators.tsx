import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Heading,
  Button,
  VStack,
  HStack,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  SimpleGrid,
  Card,
  CardHeader,
  CardBody,
  Text,
  Badge,
  Checkbox,
  CheckboxGroup,
  Alert,
  AlertIcon,
  /* useToast — replaced by useAppToast */
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Tag,
  TagLabel,
  Wrap,
  WrapItem,
  Progress,
  Box,
  Divider,
  List,
  ListItem,
} from '@chakra-ui/react';
import { Lightbulb } from 'lucide-react';
import { useKnowledgeBaseSummary, useRecommendIndicators, useProject } from '../hooks/useApi';
import type { IndicatorRecommendation } from '../types';
import useAppStore from '../store/useAppStore';
import useAppToast from '../hooks/useAppToast';
import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

// Performance dimensions
const DIMENSIONS = [
  { id: 'PRF_AES', name: 'Visual Quality & Aesthetics' },
  { id: 'PRF_BEH', name: 'Use & Behavior' },
  { id: 'PRF_COM', name: 'Comfort' },
  { id: 'PRF_ENV', name: 'Environment' },
  { id: 'PRF_HLT', name: 'Health & Wellbeing' },
  { id: 'PRF_SOC', name: 'Social' },
];

function Indicators() {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const { data: kbSummary, isLoading: kbLoading } = useKnowledgeBaseSummary();
  const { data: routeProject } = useProject(routeProjectId || '');
  const recommendMutation = useRecommendIndicators();
  const toast = useAppToast();

  const { currentProject, selectedIndicators, addSelectedIndicator, removeSelectedIndicator, clearSelectedIndicators, recommendations, setRecommendations, indicatorRelationships, setIndicatorRelationships, recommendationSummary, setRecommendationSummary } = useAppStore();

  const activeProject = routeProject || currentProject;

  // Form state
  const [projectName, setProjectName] = useState('');
  const [designBrief, setDesignBrief] = useState('');
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);

  // Pre-fill from active project (only when project ID changes, not on every refetch)
  const activeProjectId = activeProject?.id;
  useEffect(() => {
    if (activeProject) {
      setProjectName(activeProject.project_name);
      setDesignBrief(activeProject.design_brief || '');
      setSelectedDimensions(activeProject.performance_dimensions || []);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  // recommendations now from store (persisted across navigation)

  const handleRecommend = async () => {
    if (!projectName || selectedDimensions.length === 0) {
      toast({ title: 'Please enter project name and select dimensions', status: 'warning' });
      return;
    }

    try {
      const result = await recommendMutation.mutateAsync({
        project_name: projectName,
        performance_dimensions: selectedDimensions,
        design_brief: designBrief,
      });

      if (result.success) {
        setRecommendations(result.recommendations);
        setIndicatorRelationships(result.indicator_relationships || []);
        setRecommendationSummary(result.summary || null);
        toast({
          title: `Found ${result.recommendations.length} recommendations`,
          description: `Reviewed ${result.total_evidence_reviewed} evidence records`,
          status: 'success',
        });
      } else {
        toast({ title: result.error || 'Recommendation failed', status: 'error' });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Recommendation failed';
      toast({ title: message, status: 'error' });
    }
  };

  const isSelected = (indicatorId: string) => {
    return selectedIndicators.some((i) => i.indicator_id === indicatorId);
  };

  const toggleIndicator = (indicator: IndicatorRecommendation) => {
    if (isSelected(indicator.indicator_id)) {
      removeSelectedIndicator(indicator.indicator_id);
    } else {
      addSelectedIndicator(indicator);
    }
  };

  return (
    <PageShell isLoading={kbLoading} loadingText="Loading knowledge base...">
      <PageHeader title="Indicator Recommendation" />

      {/* Knowledge Base Status */}
      {kbSummary && (
        <Alert status={kbSummary.loaded ? 'success' : 'warning'} mb={6}>
          <AlertIcon />
          Knowledge Base: {kbSummary.total_evidence} evidence records,{' '}
          {kbSummary.indicators_with_evidence} indicators with evidence
        </Alert>
      )}

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
        {/* Left: Query Form */}
        <VStack spacing={6} align="stretch">
          <Card>
            <CardHeader>
              <Heading size="md">Project Context</Heading>
            </CardHeader>
            <CardBody>
              <VStack spacing={4}>
                <FormControl isRequired>
                  <FormLabel>Project Name</FormLabel>
                  <Input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="e.g., Central Park Renovation"
                  />
                </FormControl>

                <FormControl>
                  <FormLabel>Design Brief</FormLabel>
                  <Textarea
                    value={designBrief}
                    onChange={(e) => setDesignBrief(e.target.value)}
                    placeholder="Describe your project goals and requirements..."
                    rows={4}
                  />
                </FormControl>
              </VStack>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <Heading size="md">Performance Dimensions</Heading>
            </CardHeader>
            <CardBody>
              <CheckboxGroup
                value={selectedDimensions}
                onChange={(v) => setSelectedDimensions(v as string[])}
              >
                <VStack align="stretch" spacing={2}>
                  {DIMENSIONS.map((dim) => (
                    <Checkbox key={dim.id} value={dim.id}>
                      {dim.name}
                    </Checkbox>
                  ))}
                </VStack>
              </CheckboxGroup>
            </CardBody>
          </Card>

          <Button
            colorScheme="blue"
            size="lg"
            onClick={handleRecommend}
            isLoading={recommendMutation.isPending}
            isDisabled={!projectName || selectedDimensions.length === 0}
          >
            Get Recommendations
          </Button>
        </VStack>

        {/* Right: Results */}
        <VStack spacing={6} align="stretch">
          {/* Selected Indicators */}
          {selectedIndicators.length > 0 && (
            <Card>
              <CardHeader>
                <HStack justify="space-between">
                  <Heading size="md">Selected Indicators ({selectedIndicators.length})</Heading>
                  <Button size="xs" colorScheme="red" variant="ghost" onClick={clearSelectedIndicators}>
                    Clear All
                  </Button>
                </HStack>
              </CardHeader>
              <CardBody>
                <Wrap>
                  {selectedIndicators.map((ind) => (
                    <WrapItem key={ind.indicator_id}>
                      <Tag
                        size="lg"
                        colorScheme="green"
                        cursor="pointer"
                        onClick={() => removeSelectedIndicator(ind.indicator_id)}
                      >
                        <TagLabel>{ind.indicator_id}</TagLabel>
                      </Tag>
                    </WrapItem>
                  ))}
                </Wrap>
              </CardBody>
            </Card>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 ? (
            <Card>
              <CardHeader>
                <Heading size="md">Recommendations</Heading>
              </CardHeader>
              <CardBody p={0}>
                <Accordion allowMultiple>
                  {recommendations.map((rec) => (
                    <AccordionItem key={rec.indicator_id}>
                      <AccordionButton>
                        <HStack flex="1" justify="space-between" pr={2}>
                          <HStack>
                            <Checkbox
                              isChecked={isSelected(rec.indicator_id)}
                              onChange={() => toggleIndicator(rec)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <Badge colorScheme="blue">{rec.indicator_id}</Badge>
                            <Text fontWeight="bold" noOfLines={1}>{rec.indicator_name}</Text>
                          </HStack>
                          <HStack>
                            <Progress
                              value={rec.relevance_score * 100}
                              size="sm"
                              w="60px"
                              colorScheme="green"
                            />
                            <Text fontSize="sm">{(rec.relevance_score * 100).toFixed(0)}%</Text>
                          </HStack>
                        </HStack>
                        <AccordionIcon />
                      </AccordionButton>
                      <AccordionPanel pb={4}>
                        <VStack align="stretch" spacing={3}>
                          <Text fontSize="sm">{rec.rationale}</Text>
                          <HStack>
                            {rec.rank > 0 && (
                              <Badge colorScheme="purple">#{rec.rank}</Badge>
                            )}
                            <Badge colorScheme={rec.relationship_direction === 'positive' ? 'green' : 'orange'}>
                              {rec.relationship_direction}
                            </Badge>
                            <Badge colorScheme={rec.confidence === 'high' ? 'green' : 'yellow'}>
                              {rec.confidence} confidence
                            </Badge>
                          </HStack>

                          {/* Evidence citations */}
                          {rec.evidence_citations && rec.evidence_citations.length > 0 ? (
                            <Box>
                              <Text fontSize="xs" fontWeight="bold" color="gray.600" mb={1}>Evidence Citations:</Text>
                              <VStack align="stretch" spacing={1}>
                                {rec.evidence_citations.map((cit) => (
                                  <HStack key={cit.evidence_id} fontSize="xs" color="gray.600" align="start" spacing={2}>
                                    <Badge size="sm" variant="outline" colorScheme="gray" flexShrink={0}>
                                      {cit.evidence_id}
                                    </Badge>
                                    <Text noOfLines={2} flex={1}>
                                      {cit.citation || 'No citation text'}
                                      {cit.year ? ` (${cit.year})` : ''}
                                    </Text>
                                    {cit.direction && (
                                      <Badge size="sm" colorScheme={cit.direction === 'positive' ? 'green' : 'orange'} flexShrink={0}>
                                        {cit.direction}
                                      </Badge>
                                    )}
                                  </HStack>
                                ))}
                              </VStack>
                            </Box>
                          ) : rec.evidence_ids.length > 0 ? (
                            <Text fontSize="xs" color="gray.500">
                              Evidence: {rec.evidence_ids.slice(0, 3).join(', ')}
                              {rec.evidence_ids.length > 3 && ` +${rec.evidence_ids.length - 3} more`}
                            </Text>
                          ) : null}
                        </VStack>
                      </AccordionPanel>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardBody>
            </Card>
          ) : (
            <EmptyState
              icon={Lightbulb}
              title="No recommendations yet"
              description="Enter project details and select dimensions to get AI-powered indicator recommendations."
            />
          )}

          {/* Indicator Relationships */}
          {indicatorRelationships.length > 0 && (
            <Card>
              <CardHeader>
                <Heading size="sm">Indicator Relationships</Heading>
              </CardHeader>
              <CardBody pt={0}>
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
                <Heading size="sm">Summary</Heading>
              </CardHeader>
              <CardBody pt={0}>
                <VStack align="stretch" spacing={3}>
                  {recommendationSummary.key_findings.length > 0 && (
                    <Box>
                      <Text fontSize="sm" fontWeight="bold" mb={1}>Key Findings</Text>
                      <List spacing={1}>
                        {recommendationSummary.key_findings.map((f, i) => (
                          <ListItem key={i} fontSize="sm" display="flex" alignItems="start">
                            <Box as="span" color="green.500" mr={2} mt={0.5} flexShrink={0}>&#x2713;</Box>
                            {f}
                          </ListItem>
                        ))}
                      </List>
                    </Box>
                  )}
                  {recommendationSummary.evidence_gaps.length > 0 && (
                    <Box>
                      <Divider mb={2} />
                      <Text fontSize="sm" fontWeight="bold" mb={1}>Evidence Gaps</Text>
                      <List spacing={1}>
                        {recommendationSummary.evidence_gaps.map((g, i) => (
                          <ListItem key={i} fontSize="sm" display="flex" alignItems="start">
                            <Box as="span" color="orange.500" mr={2} mt={0.5} flexShrink={0}>&#x26A0;</Box>
                            {g}
                          </ListItem>
                        ))}
                      </List>
                    </Box>
                  )}
                </VStack>
              </CardBody>
            </Card>
          )}
        </VStack>
      </SimpleGrid>

      {/* Navigation buttons for pipeline mode */}
      {routeProjectId && (
        <HStack justify="space-between" mt={6}>
          <Button as={Link} to={`/projects/${routeProjectId}/vision`} variant="outline">
            Back: Vision
          </Button>
          <Button as={Link} to={`/projects/${routeProjectId}/analysis`} colorScheme="blue">
            Next: Analysis
          </Button>
        </HStack>
      )}
    </PageShell>
  );
}

export default Indicators;
