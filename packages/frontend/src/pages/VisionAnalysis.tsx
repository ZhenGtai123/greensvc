import { useState, useRef } from 'react';
import {
  Box,
  Container,
  Heading,
  Button,
  VStack,
  HStack,
  FormControl,
  FormLabel,
  Select,
  Checkbox,
  CheckboxGroup,
  SimpleGrid,
  Card,
  CardHeader,
  CardBody,
  Image,
  Text,
  Badge,
  Progress,
  Alert,
  AlertIcon,
  useToast,
  Spinner,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Input,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
} from '@chakra-ui/react';
import { useSemanticConfig, useTaskStatus } from '../hooks/useApi';
import api from '../api';
import type { SemanticClass } from '../types';

function VisionAnalysis() {
  const { data: semanticConfig, isLoading: configLoading } = useSemanticConfig();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [encoder, setEncoder] = useState('vitb');
  const [threshold, setThreshold] = useState(0.3);
  const [holeFilling, setHoleFilling] = useState(false);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<Record<string, string> | null>(null);
  const [statistics, setStatistics] = useState<Record<string, unknown> | null>(null);

  // Batch task state
  const [taskId, setTaskId] = useState<string | null>(null);
  const { data: taskStatus } = useTaskStatus(taskId);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResults(null);
      setStatistics(null);
    }
  };

  const handleSelectAll = () => {
    if (semanticConfig?.classes) {
      setSelectedClasses(semanticConfig.classes.map((c) => c.name));
    }
  };

  const handleSelectNone = () => {
    setSelectedClasses([]);
  };

  const handleAnalyze = async () => {
    if (!selectedFile || selectedClasses.length === 0) {
      toast({ title: 'Please select a file and at least one class', status: 'warning' });
      return;
    }

    setAnalyzing(true);
    setResults(null);
    setStatistics(null);

    try {
      const classConfig = semanticConfig?.classes || [];
      const countability = selectedClasses.map((name) => {
        const cls = classConfig.find((c) => c.name === name);
        return cls?.countable || 0;
      });
      const openness = selectedClasses.map((name) => {
        const cls = classConfig.find((c) => c.name === name);
        return cls?.openness || 0;
      });

      const response = await api.vision.analyze(selectedFile, {
        semantic_classes: selectedClasses,
        semantic_countability: countability,
        openness_list: openness,
        encoder,
        detection_threshold: threshold,
        enable_hole_filling: holeFilling,
      });

      if (response.data.status === 'success') {
        setStatistics(response.data.statistics);
        toast({ title: 'Analysis complete', status: 'success' });
      } else {
        toast({ title: response.data.error || 'Analysis failed', status: 'error' });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Analysis failed';
      toast({ title: message, status: 'error' });
    }

    setAnalyzing(false);
  };

  if (configLoading) {
    return (
      <Container maxW="container.xl" py={8} textAlign="center">
        <Spinner size="xl" />
        <Text mt={4}>Loading semantic configuration...</Text>
      </Container>
    );
  }

  return (
    <Container maxW="container.xl" py={8}>
      <Heading mb={6}>Vision Analysis</Heading>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
        {/* Left: Configuration */}
        <VStack spacing={6} align="stretch">
          {/* Image Upload */}
          <Card>
            <CardHeader>
              <Heading size="md">Image Upload</Heading>
            </CardHeader>
            <CardBody>
              <Input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                display="none"
                onChange={handleFileSelect}
              />
              <VStack spacing={4}>
                <Button
                  w="full"
                  colorScheme="blue"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Select Image
                </Button>
                {previewUrl && (
                  <Image
                    src={previewUrl}
                    alt="Preview"
                    maxH="200px"
                    objectFit="contain"
                    borderRadius="md"
                  />
                )}
                {selectedFile && (
                  <Text fontSize="sm" color="gray.600">
                    {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </Text>
                )}
              </VStack>
            </CardBody>
          </Card>

          {/* Model Settings */}
          <Card>
            <CardHeader>
              <Heading size="md">Model Settings</Heading>
            </CardHeader>
            <CardBody>
              <VStack spacing={4}>
                <FormControl>
                  <FormLabel>Encoder</FormLabel>
                  <Select value={encoder} onChange={(e) => setEncoder(e.target.value)}>
                    <option value="vits">ViT-S (Fast)</option>
                    <option value="vitb">ViT-B (Balanced)</option>
                    <option value="vitl">ViT-L (Accurate)</option>
                  </Select>
                </FormControl>

                <FormControl>
                  <FormLabel>Detection Threshold: {threshold}</FormLabel>
                  <Slider
                    value={threshold}
                    onChange={setThreshold}
                    min={0.1}
                    max={0.9}
                    step={0.1}
                  >
                    <SliderTrack>
                      <SliderFilledTrack />
                    </SliderTrack>
                    <SliderThumb />
                  </Slider>
                </FormControl>

                <Checkbox
                  isChecked={holeFilling}
                  onChange={(e) => setHoleFilling(e.target.checked)}
                >
                  Enable Hole Filling
                </Checkbox>
              </VStack>
            </CardBody>
          </Card>

          {/* Semantic Classes */}
          <Card>
            <CardHeader>
              <HStack justify="space-between">
                <Heading size="md">Semantic Classes</Heading>
                <HStack>
                  <Button size="xs" onClick={handleSelectAll}>All</Button>
                  <Button size="xs" onClick={handleSelectNone}>None</Button>
                </HStack>
              </HStack>
            </CardHeader>
            <CardBody maxH="300px" overflowY="auto">
              <CheckboxGroup value={selectedClasses} onChange={(v) => setSelectedClasses(v as string[])}>
                <SimpleGrid columns={2} spacing={2}>
                  {semanticConfig?.classes.map((cls: SemanticClass) => (
                    <Checkbox key={cls.name} value={cls.name} size="sm">
                      <HStack spacing={1}>
                        <Box w={3} h={3} bg={cls.color} borderRadius="sm" />
                        <Text fontSize="xs" noOfLines={1}>{cls.name}</Text>
                      </HStack>
                    </Checkbox>
                  ))}
                </SimpleGrid>
              </CheckboxGroup>
            </CardBody>
          </Card>

          {/* Analyze Button */}
          <Button
            colorScheme="green"
            size="lg"
            onClick={handleAnalyze}
            isLoading={analyzing}
            isDisabled={!selectedFile || selectedClasses.length === 0}
          >
            Analyze Image
          </Button>
        </VStack>

        {/* Right: Results */}
        <VStack spacing={6} align="stretch">
          {analyzing && (
            <Alert status="info">
              <AlertIcon />
              Analyzing image... This may take a few minutes.
            </Alert>
          )}

          {taskStatus && taskStatus.status === 'PROGRESS' && (
            <Card>
              <CardBody>
                <Text mb={2}>{taskStatus.progress?.status}</Text>
                <Progress
                  value={(taskStatus.progress?.current || 0) / (taskStatus.progress?.total || 1) * 100}
                  colorScheme="blue"
                />
              </CardBody>
            </Card>
          )}

          {statistics && (
            <Card>
              <CardHeader>
                <Heading size="md">Analysis Results</Heading>
              </CardHeader>
              <CardBody>
                <VStack align="stretch" spacing={3}>
                  <HStack justify="space-between">
                    <Text>Detected Classes:</Text>
                    <Badge colorScheme="green">{(statistics as Record<string, number>).detected_classes || 0}</Badge>
                  </HStack>
                  <HStack justify="space-between">
                    <Text>Total Classes:</Text>
                    <Badge>{(statistics as Record<string, number>).total_classes || 0}</Badge>
                  </HStack>

                  {(statistics as Record<string, Record<string, unknown>>).class_statistics && (
                    <Box mt={4}>
                      <Text fontWeight="bold" mb={2}>Class Distribution:</Text>
                      <VStack align="stretch" spacing={1} maxH="200px" overflowY="auto">
                        {Object.entries((statistics as Record<string, Record<string, unknown>>).class_statistics).map(([cls, data]) => (
                          <HStack key={cls} justify="space-between" fontSize="sm">
                            <Text noOfLines={1}>{cls}</Text>
                            <Badge>{String((data as Record<string, number>).percentage?.toFixed(1) || 0)}%</Badge>
                          </HStack>
                        ))}
                      </VStack>
                    </Box>
                  )}
                </VStack>
              </CardBody>
            </Card>
          )}

          {!analyzing && !statistics && (
            <Card>
              <CardBody textAlign="center" py={10}>
                <Text color="gray.500">
                  Select an image and classes, then click Analyze to see results.
                </Text>
              </CardBody>
            </Card>
          )}
        </VStack>
      </SimpleGrid>
    </Container>
  );
}

export default VisionAnalysis;
