import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Container,
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
  useToast,
  Spinner,
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
} from '@chakra-ui/react';
import { useKnowledgeBaseSummary, useRecommendIndicators, useProject } from '../hooks/useApi';
import type { IndicatorRecommendation } from '../types';
import useAppStore from '../store/useAppStore';

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
  const toast = useToast();

  const { currentProject, selectedIndicators, addSelectedIndicator, removeSelectedIndicator, clearSelectedIndicators } = useAppStore();

  // Use route project if available, otherwise fall back to store
  const activeProject = routeProject || currentProject;

  // Form state
  const [projectName, setProjectName] = useState('');
  const [designBrief, setDesignBrief] = useState('');
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);

  // Pre-fill from active project
  useEffect(() => {
    if (activeProject) {
      setProjectName(activeProject.project_name);
      setDesignBrief(activeProject.design_brief || '');
      setSelectedDimensions(activeProject.performance_dimensions || []);
    }
  }, [activeProject]);

  // Results
  const [recommendations, setRecommendations] = useState<IndicatorRecommendation[]>([]);

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

  if (kbLoading) {
    return (
      <Container maxW="container.xl" py={8} textAlign="center">
        <Spinner size="xl" />
      </Container>
    );
  }

  return (
    <Container maxW="container.xl" py={8}>
      <Heading mb={6}>Indicator Recommendation</Heading>

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
                        <VStack align="stretch" spacing={2}>
                          <Text fontSize="sm">{rec.rationale}</Text>
                          <HStack>
                            <Badge colorScheme={rec.relationship_direction === 'positive' ? 'green' : 'orange'}>
                              {rec.relationship_direction}
                            </Badge>
                            <Badge colorScheme={rec.confidence === 'high' ? 'green' : 'yellow'}>
                              {rec.confidence} confidence
                            </Badge>
                          </HStack>
                          {rec.evidence_ids.length > 0 && (
                            <Text fontSize="xs" color="gray.500">
                              Evidence: {rec.evidence_ids.slice(0, 3).join(', ')}
                              {rec.evidence_ids.length > 3 && ` +${rec.evidence_ids.length - 3} more`}
                            </Text>
                          )}
                        </VStack>
                      </AccordionPanel>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody textAlign="center" py={10}>
                <Text color="gray.500">
                  Enter project details and select dimensions to get AI-powered indicator recommendations.
                </Text>
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
    </Container>
  );
}

export default Indicators;
