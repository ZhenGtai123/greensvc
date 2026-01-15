import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Heading,
  Button,
  VStack,
  HStack,
  FormControl,
  FormLabel,
  Input,
  SimpleGrid,
  Card,
  CardHeader,
  CardBody,
  Text,
  Badge,
  Alert,
  AlertIcon,
  useToast,
  Spinner,
  Divider,
  Code,
  Switch,
} from '@chakra-ui/react';
import { useConfig, useHealth, useKnowledgeBaseSummary } from '../hooks/useApi';
import api from '../api';

function Settings() {
  const { data: config, isLoading: configLoading, refetch: refetchConfig } = useConfig();
  const { data: health } = useHealth();
  const { data: kbSummary } = useKnowledgeBaseSummary();
  const toast = useToast();

  const [visionHealthy, setVisionHealthy] = useState<boolean | null>(null);
  const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(null);
  const [testingVision, setTestingVision] = useState(false);
  const [testingGemini, setTestingGemini] = useState(false);

  const testVisionConnection = async () => {
    setTestingVision(true);
    try {
      const response = await api.testVision();
      setVisionHealthy(response.data.healthy);
      toast({
        title: response.data.healthy ? 'Vision API connected' : 'Vision API not available',
        status: response.data.healthy ? 'success' : 'warning',
      });
    } catch (error) {
      setVisionHealthy(false);
      toast({ title: 'Failed to connect to Vision API', status: 'error' });
    }
    setTestingVision(false);
  };

  const testGeminiConnection = async () => {
    setTestingGemini(true);
    try {
      const response = await api.testGemini();
      setGeminiConfigured(response.data.configured);
      toast({
        title: response.data.configured ? 'Gemini API configured' : 'Gemini API not configured',
        status: response.data.configured ? 'success' : 'warning',
      });
    } catch (error) {
      setGeminiConfigured(false);
      toast({ title: 'Failed to test Gemini API', status: 'error' });
    }
    setTestingGemini(false);
  };

  if (configLoading) {
    return (
      <Container maxW="container.xl" py={8} textAlign="center">
        <Spinner size="xl" />
      </Container>
    );
  }

  return (
    <Container maxW="container.xl" py={8}>
      <Heading mb={6}>Settings</Heading>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
        {/* System Status */}
        <Card>
          <CardHeader>
            <Heading size="md">System Status</Heading>
          </CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={4}>
              <HStack justify="space-between">
                <Text>Backend API</Text>
                <Badge colorScheme={health?.status === 'healthy' ? 'green' : 'red'}>
                  {health?.status || 'Unknown'}
                </Badge>
              </HStack>

              <HStack justify="space-between">
                <Text>Vision API</Text>
                <HStack>
                  {visionHealthy !== null && (
                    <Badge colorScheme={visionHealthy ? 'green' : 'red'}>
                      {visionHealthy ? 'Connected' : 'Disconnected'}
                    </Badge>
                  )}
                  <Button size="xs" onClick={testVisionConnection} isLoading={testingVision}>
                    Test
                  </Button>
                </HStack>
              </HStack>

              <HStack justify="space-between">
                <Text>Gemini API</Text>
                <HStack>
                  {geminiConfigured !== null && (
                    <Badge colorScheme={geminiConfigured ? 'green' : 'yellow'}>
                      {geminiConfigured ? 'Configured' : 'Not Configured'}
                    </Badge>
                  )}
                  <Button size="xs" onClick={testGeminiConnection} isLoading={testingGemini}>
                    Test
                  </Button>
                </HStack>
              </HStack>

              <Divider />

              <HStack justify="space-between">
                <Text>Knowledge Base</Text>
                <Badge colorScheme={kbSummary?.loaded ? 'green' : 'yellow'}>
                  {kbSummary?.loaded ? `${kbSummary.total_evidence} records` : 'Not Loaded'}
                </Badge>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* Configuration */}
        <Card>
          <CardHeader>
            <Heading size="md">Configuration</Heading>
          </CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={4}>
              <FormControl>
                <FormLabel>Vision API URL</FormLabel>
                <Code p={2} borderRadius="md" w="full">
                  {config?.vision_api_url}
                </Code>
              </FormControl>

              <FormControl>
                <FormLabel>Gemini Model</FormLabel>
                <Code p={2} borderRadius="md" w="full">
                  {config?.gemini_model}
                </Code>
              </FormControl>

              <FormControl>
                <FormLabel>Data Directory</FormLabel>
                <Code p={2} borderRadius="md" w="full">
                  {config?.data_dir}
                </Code>
              </FormControl>

              <FormControl>
                <FormLabel>Metrics Code Directory</FormLabel>
                <Code p={2} borderRadius="md" w="full">
                  {config?.metrics_code_dir}
                </Code>
              </FormControl>

              <FormControl>
                <FormLabel>Knowledge Base Directory</FormLabel>
                <Code p={2} borderRadius="md" w="full">
                  {config?.knowledge_base_dir}
                </Code>
              </FormControl>
            </VStack>
          </CardBody>
        </Card>

        {/* Knowledge Base Details */}
        {kbSummary && (
          <Card>
            <CardHeader>
              <Heading size="md">Knowledge Base</Heading>
            </CardHeader>
            <CardBody>
              <SimpleGrid columns={2} spacing={4}>
                <Box>
                  <Text fontSize="sm" color="gray.500">Evidence Records</Text>
                  <Text fontSize="2xl" fontWeight="bold">{kbSummary.total_evidence}</Text>
                </Box>
                <Box>
                  <Text fontSize="sm" color="gray.500">Indicators with Evidence</Text>
                  <Text fontSize="2xl" fontWeight="bold">{kbSummary.indicators_with_evidence}</Text>
                </Box>
                <Box>
                  <Text fontSize="sm" color="gray.500">Dimensions</Text>
                  <Text fontSize="2xl" fontWeight="bold">{kbSummary.dimensions_with_evidence}</Text>
                </Box>
                <Box>
                  <Text fontSize="sm" color="gray.500">IOM Records</Text>
                  <Text fontSize="2xl" fontWeight="bold">{kbSummary.iom_records}</Text>
                </Box>
              </SimpleGrid>

              <Divider my={4} />

              <Text fontSize="sm" color="gray.500" mb={2}>Appendix Sections:</Text>
              <Box maxH="100px" overflowY="auto">
                <Text fontSize="xs" fontFamily="mono">
                  {kbSummary.appendix_sections.join(', ')}
                </Text>
              </Box>
            </CardBody>
          </Card>
        )}

        {/* About */}
        <Card>
          <CardHeader>
            <Heading size="md">About</Heading>
          </CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={2}>
              <HStack justify="space-between">
                <Text>Application</Text>
                <Text fontWeight="bold">GreenSVC</Text>
              </HStack>
              <HStack justify="space-between">
                <Text>Version</Text>
                <Badge>1.0.0</Badge>
              </HStack>
              <HStack justify="space-between">
                <Text>Backend</Text>
                <Badge colorScheme="blue">FastAPI</Badge>
              </HStack>
              <HStack justify="space-between">
                <Text>Frontend</Text>
                <Badge colorScheme="cyan">React + TypeScript</Badge>
              </HStack>
            </VStack>
          </CardBody>
        </Card>
      </SimpleGrid>
    </Container>
  );
}

export default Settings;
