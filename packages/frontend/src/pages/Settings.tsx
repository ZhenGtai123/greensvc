import { useState } from 'react';
import {
  Box,
  Heading,
  Button,
  VStack,
  HStack,
  FormControl,
  FormLabel,
  SimpleGrid,
  Card,
  CardHeader,
  CardBody,
  Text,
  Badge,
  /* useToast — replaced by useAppToast */
  Divider,
  Code,
  Select,
} from '@chakra-ui/react';
import { Server, Eye, Brain, Database } from 'lucide-react';
import { useConfig, useHealth, useKnowledgeBaseSummary, useLLMProviders, queryKeys } from '../hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import api from '../api';
import type { LLMProviderInfo } from '../types';
import useAppToast from '../hooks/useAppToast';
import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';

function Settings() {
  const { data: config, isLoading: configLoading } = useConfig();
  const { data: health } = useHealth();
  const { data: kbSummary } = useKnowledgeBaseSummary();
  const { data: llmProviders, isLoading: providersLoading } = useLLMProviders();
  const queryClient = useQueryClient();
  const toast = useAppToast();

  const [visionHealthy, setVisionHealthy] = useState<boolean | null>(null);
  const [llmStatus, setLlmStatus] = useState<{ configured: boolean; provider: string; model: string | null } | null>(null);
  const [testingVision, setTestingVision] = useState(false);
  const [testingLLM, setTestingLLM] = useState(false);
  const [switchingProvider, setSwitchingProvider] = useState(false);

  const activeProvider = llmProviders?.find((p: LLMProviderInfo) => p.active);

  const testVisionConnection = async () => {
    setTestingVision(true);
    try {
      const response = await api.testVision();
      setVisionHealthy(response.data.healthy);
      toast({
        title: response.data.healthy ? 'Vision API connected' : 'Vision API not available',
        status: response.data.healthy ? 'success' : 'warning',
      });
    } catch {
      setVisionHealthy(false);
      toast({ title: 'Failed to connect to Vision API', status: 'error' });
    }
    setTestingVision(false);
  };

  const testLLMConnection = async () => {
    setTestingLLM(true);
    try {
      const response = await api.testLLM();
      setLlmStatus(response.data);
      toast({
        title: response.data.configured
          ? `${response.data.provider} connected`
          : 'LLM not configured',
        status: response.data.configured ? 'success' : 'warning',
      });
    } catch {
      setLlmStatus(null);
      toast({ title: 'Failed to test LLM connection', status: 'error' });
    }
    setTestingLLM(false);
  };

  const handleSwitchProvider = async (providerId: string) => {
    setSwitchingProvider(true);
    try {
      const response = await api.switchLLMProvider(providerId);
      toast({
        title: `Switched to ${response.data.provider}`,
        description: `Model: ${response.data.model}`,
        status: 'success',
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.llmProviders });
      queryClient.invalidateQueries({ queryKey: queryKeys.config });
      setLlmStatus(null);
    } catch (error: any) {
      const detail = error?.response?.data?.detail || 'Failed to switch provider';
      toast({ title: detail, status: 'error' });
    }
    setSwitchingProvider(false);
  };

  return (
    <PageShell isLoading={configLoading} loadingText="Loading settings...">
      <PageHeader title="Settings" />

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
        {/* System Status */}
        <Card>
          <CardHeader>
            <Heading size="md">System Status</Heading>
          </CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={4}>
              <HStack justify="space-between">
                <HStack spacing={2}>
                  <Server size={16} />
                  <Text>Backend API</Text>
                </HStack>
                <Badge colorScheme={health?.status === 'healthy' ? 'green' : 'red'}>
                  {health?.status || 'Unknown'}
                </Badge>
              </HStack>

              <HStack justify="space-between">
                <HStack spacing={2}>
                  <Eye size={16} />
                  <Text>Vision API</Text>
                </HStack>
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
                <HStack spacing={2}>
                  <Brain size={16} />
                  <Text>LLM Provider</Text>
                </HStack>
                <HStack>
                  {llmStatus !== null && (
                    <Badge colorScheme={llmStatus.configured ? 'green' : 'yellow'}>
                      {llmStatus.configured ? 'Configured' : 'Not Configured'}
                    </Badge>
                  )}
                  <Button size="xs" onClick={testLLMConnection} isLoading={testingLLM}>
                    Test
                  </Button>
                </HStack>
              </HStack>

              <Divider />

              <HStack justify="space-between">
                <HStack spacing={2}>
                  <Database size={16} />
                  <Text>Knowledge Base</Text>
                </HStack>
                <Badge colorScheme={kbSummary?.loaded ? 'green' : 'yellow'}>
                  {kbSummary?.loaded ? `${kbSummary.total_evidence} records` : 'Not Loaded'}
                </Badge>
              </HStack>
            </VStack>
          </CardBody>
        </Card>

        {/* LLM Provider */}
        <Card>
          <CardHeader>
            <Heading size="md">LLM Provider</Heading>
          </CardHeader>
          <CardBody>
            <VStack align="stretch" spacing={4}>
              <FormControl>
                <FormLabel>Active Provider</FormLabel>
                <Select
                  value={activeProvider?.id || ''}
                  onChange={(e) => handleSwitchProvider(e.target.value)}
                  isDisabled={switchingProvider || providersLoading}
                >
                  {llmProviders?.map((p: LLMProviderInfo) => (
                    <option key={p.id} value={p.id} disabled={!p.configured}>
                      {p.name} {!p.configured ? '(no API key)' : ''}
                    </option>
                  ))}
                </Select>
              </FormControl>

              {activeProvider && (
                <FormControl>
                  <FormLabel>Model</FormLabel>
                  <Code p={2} borderRadius="md" w="full">
                    {activeProvider.current_model}
                  </Code>
                </FormControl>
              )}

              <Divider />

              <Text fontSize="sm" fontWeight="semibold" color="gray.500">
                Available Providers
              </Text>
              {llmProviders?.map((p: LLMProviderInfo) => (
                <HStack key={p.id} justify="space-between">
                  <HStack>
                    <Text fontSize="sm">{p.name}</Text>
                    {p.active && <Badge colorScheme="blue" fontSize="xs">Active</Badge>}
                  </HStack>
                  <Badge colorScheme={p.configured ? 'green' : 'gray'} fontSize="xs">
                    {p.configured ? 'Configured' : 'Not configured'}
                  </Badge>
                </HStack>
              ))}
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
    </PageShell>
  );
}

export default Settings;
