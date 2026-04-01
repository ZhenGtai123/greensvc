import { useState, useEffect } from 'react';
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
  Divider,
  Select,
  Input,
  Code,
} from '@chakra-ui/react';
import { Server, Eye, Brain, Database } from 'lucide-react';
import { useConfig, useHealth, useKnowledgeBaseSummary, useLLMProviders, useProviderModels, queryKeys } from '../hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import api from '../api';
import type { LLMProviderInfo } from '../types';
import useAppToast from '../hooks/useAppToast';
import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';

// Fallback model lists (used when dynamic fetch is unavailable)
const FALLBACK_MODELS: Record<string, { id: string; label: string }[]> = {
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o (default)' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini (cheaper)' },
    { id: 'gpt-4.1', label: 'GPT-4.1 (latest)' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini (fast)' },
    { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano (cheapest)' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (default)' },
    { id: 'claude-opus-4-20250514', label: 'Claude Opus 4 (strongest)' },
    { id: 'claude-haiku-4-20250514', label: 'Claude Haiku 4 (fast)' },
  ],
  deepseek: [
    { id: 'deepseek-chat', label: 'DeepSeek Chat (default)' },
    { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)' },
  ],
};

function Settings() {
  const { data: config, isLoading: configLoading } = useConfig();
  const { data: health } = useHealth();
  const { data: kbSummary } = useKnowledgeBaseSummary();
  const { data: llmProviders, isLoading: providersLoading } = useLLMProviders();
  const queryClient = useQueryClient();
  const toast = useAppToast();

  const activeProviderId = llmProviders?.find((p: LLMProviderInfo) => p.active)?.id;
  const { data: dynamicModels, isLoading: modelsLoading } = useProviderModels(activeProviderId);

  const [visionHealthy, setVisionHealthy] = useState<boolean | null>(null);
  const [llmStatus, setLlmStatus] = useState<{ configured: boolean; provider: string; model: string | null } | null>(null);
  const [testingVision, setTestingVision] = useState(false);
  const [testingLLM, setTestingLLM] = useState(false);
  const [switchingProvider, setSwitchingProvider] = useState(false);
  const [customModel, setCustomModel] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  const activeProvider = llmProviders?.find((p: LLMProviderInfo) => p.active);

  useEffect(() => {
    if (activeProvider?.current_model) {
      setCustomModel(activeProvider.current_model);
    }
  }, [activeProvider?.current_model]);

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

  const handleSwitchProvider = async (providerId: string, model?: string) => {
    setSwitchingProvider(true);
    try {
      const response = await api.switchLLMProvider(providerId, model || undefined);
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

  const handleUpdateApiKey = async () => {
    if (!activeProvider || !apiKeyInput.trim()) return;
    setSavingKey(true);
    try {
      await api.updateLLMApiKey(activeProvider.id, apiKeyInput.trim());
      toast({ title: `API key updated for ${activeProvider.name}`, status: 'success' });
      setApiKeyInput('');
      queryClient.invalidateQueries({ queryKey: queryKeys.llmProviders });
      setLlmStatus(null);
    } catch (error: any) {
      const detail = error?.response?.data?.detail || 'Failed to update API key';
      toast({ title: detail, status: 'error' });
    }
    setSavingKey(false);
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
              {/* Provider selector */}
              <FormControl>
                <FormLabel fontSize="sm">Provider</FormLabel>
                <Select
                  value={activeProvider?.id || ''}
                  onChange={(e) => handleSwitchProvider(e.target.value)}
                  isDisabled={switchingProvider || providersLoading}
                  size="sm"
                >
                  {llmProviders?.map((p: LLMProviderInfo) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {!p.configured ? '(no key)' : ''}
                    </option>
                  ))}
                </Select>
              </FormControl>

              {/* Model selector */}
              {activeProvider && (() => {
                const modelList = (dynamicModels && dynamicModels.length > 0)
                  ? dynamicModels
                  : (FALLBACK_MODELS[activeProvider.id] || []);
                return (
                  <FormControl>
                    <FormLabel fontSize="sm">
                      Model {modelsLoading && <Text as="span" fontSize="xs" color="gray.400">(loading...)</Text>}
                    </FormLabel>
                    <HStack>
                      <Select
                        value={customModel}
                        onChange={(e) => setCustomModel(e.target.value)}
                        size="sm"
                        fontFamily="mono"
                        fontSize="sm"
                      >
                        {modelList.map(m => (
                          <option key={m.id} value={m.id}>{m.id} — {m.label}</option>
                        ))}
                        {/* Allow current model even if not in fetched list */}
                        {customModel && !modelList.some(m => m.id === customModel) && (
                          <option value={customModel}>{customModel} (current)</option>
                        )}
                      </Select>
                      <Button
                        size="sm"
                        colorScheme="blue"
                        onClick={() => handleSwitchProvider(activeProvider.id, customModel)}
                        isLoading={switchingProvider}
                        isDisabled={customModel === activeProvider.current_model}
                        flexShrink={0}
                      >
                        Apply
                      </Button>
                    </HStack>
                  </FormControl>
                );
              })()}

              <Divider />

              {/* API Key */}
              {activeProvider && (
                <FormControl>
                  <FormLabel fontSize="sm">API Key ({activeProvider.name})</FormLabel>
                  <HStack>
                    <Input
                      type="password"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={activeProvider.configured ? '••••••••  (configured)' : 'Enter API key...'}
                      size="sm"
                      fontFamily="mono"
                    />
                    <Button
                      size="sm"
                      colorScheme="green"
                      onClick={handleUpdateApiKey}
                      isLoading={savingKey}
                      isDisabled={!apiKeyInput.trim()}
                      flexShrink={0}
                    >
                      Save
                    </Button>
                  </HStack>
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    Saved to .env file and persisted across restarts.
                  </Text>
                </FormControl>
              )}

              {/* Test Connection */}
              {activeProvider && (
                <HStack>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={testLLMConnection}
                    isLoading={testingLLM}
                    w="full"
                  >
                    Test Connection
                  </Button>
                  {llmStatus && (
                    <Badge colorScheme={llmStatus.configured ? 'green' : 'red'} flexShrink={0}>
                      {llmStatus.configured ? `OK — ${llmStatus.model}` : 'Failed'}
                    </Badge>
                  )}
                </HStack>
              )}

              <Divider />

              {/* Provider status list */}
              <Text fontSize="xs" fontWeight="semibold" color="gray.500" textTransform="uppercase">
                Providers
              </Text>
              {llmProviders?.map((p: LLMProviderInfo) => (
                <HStack key={p.id} justify="space-between">
                  <HStack>
                    <Text fontSize="sm">{p.name}</Text>
                    {p.active && <Badge colorScheme="blue" fontSize="xs">Active</Badge>}
                  </HStack>
                  <Badge colorScheme={p.configured ? 'green' : 'gray'} fontSize="xs">
                    {p.configured ? p.current_model : 'No key'}
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
                <Text fontWeight="bold">SceneRx</Text>
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
