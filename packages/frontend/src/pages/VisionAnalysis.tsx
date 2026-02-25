import { useState, useRef, useEffect } from 'react';
import { useSearchParams, useParams, Link } from 'react-router-dom';
import {
  Box,
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
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from '@chakra-ui/react';
import { ScanSearch } from 'lucide-react';
import { useSemanticConfig, useTaskStatus, useProject } from '../hooks/useApi';
import api from '../api';
import type { SemanticClass, UploadedImage } from '../types';
import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

function VisionAnalysis() {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const projectId = routeProjectId || searchParams.get('project');

  const { data: semanticConfig, isLoading: configLoading } = useSemanticConfig();
  const { data: project, isLoading: projectLoading } = useProject(projectId || '');
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [encoder, setEncoder] = useState('vitb');
  const [threshold, setThreshold] = useState(0.3);
  const [holeFilling, setHoleFilling] = useState(false);

  // Project image selection
  const [selectedProjectImages, setSelectedProjectImages] = useState<string[]>([]);
  const [imageSource, setImageSource] = useState<'upload' | 'project'>(projectId ? 'project' : 'upload');

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [statistics, setStatistics] = useState<Record<string, unknown> | null>(null);
  const [batchProgress, setBatchProgress] = useState<{current: number; total: number} | null>(null);

  // Batch task state
  const [taskId] = useState<string | null>(null);
  const { data: taskStatus } = useTaskStatus(taskId);

  // Reset image source when project changes
  useEffect(() => {
    setImageSource(projectId ? 'project' : 'upload');
  }, [projectId]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
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

  const handleSelectAllImages = () => {
    if (project?.uploaded_images) {
      setSelectedProjectImages(project.uploaded_images.map(img => img.image_id));
    }
  };

  const handleSelectNoImages = () => {
    setSelectedProjectImages([]);
  };

  const toggleImageSelection = (imageId: string) => {
    setSelectedProjectImages(prev =>
      prev.includes(imageId)
        ? prev.filter(id => id !== imageId)
        : [...prev, imageId]
    );
  };

  const handleAnalyze = async () => {
    if (selectedClasses.length === 0) {
      toast({ title: 'Please select at least one class', status: 'warning' });
      return;
    }

    const classConfig = semanticConfig?.classes || [];
    const countability = selectedClasses.map((name) => {
      const cls = classConfig.find((c) => c.name === name);
      return cls?.countable || 0;
    });
    const openness = selectedClasses.map((name) => {
      const cls = classConfig.find((c) => c.name === name);
      return cls?.openness || 0;
    });

    setAnalyzing(true);
    setStatistics(null);
    setBatchProgress(null);

    try {
      if (imageSource === 'upload' && selectedFile) {
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
      } else if (imageSource === 'project' && selectedProjectImages.length > 0) {
        let processed = 0;
        const allResults: Record<string, unknown>[] = [];
        const requestPayload = {
          semantic_classes: selectedClasses,
          semantic_countability: countability,
          openness_list: openness,
          encoder,
          detection_threshold: threshold,
          enable_hole_filling: holeFilling,
        };

        for (const imageId of selectedProjectImages) {
          const img = project?.uploaded_images.find(i => i.image_id === imageId);
          if (!img) continue;

          let response;
          if (projectId) {
            response = await api.vision.analyzeProjectImage(projectId, imageId, requestPayload);
          } else {
            response = await api.vision.analyzeByPath(img.filepath, requestPayload);
          }

          processed++;
          setBatchProgress({ current: processed, total: selectedProjectImages.length });

          if (response.data.status === 'success') {
            allResults.push(response.data.statistics);
          }
        }

        if (allResults.length > 0) {
          setStatistics({
            images_processed: allResults.length,
            total_images: selectedProjectImages.length,
            results: allResults,
          });
          toast({
            title: `Analysis complete: ${allResults.length}/${selectedProjectImages.length} images processed`,
            status: 'success'
          });
        }
      } else {
        toast({ title: 'Please select an image', status: 'warning' });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Analysis failed';
      toast({ title: message, status: 'error' });
    }

    setAnalyzing(false);
    setBatchProgress(null);
  };

  const isPageLoading = configLoading || (projectId && projectLoading);

  return (
    <PageShell isLoading={!!isPageLoading} loadingText="Loading...">
      <PageHeader title="Vision Analysis">
        {project && (
          <HStack>
            <Text color="gray.500">Project:</Text>
            <Button as={Link} to={`/projects/${projectId}`} variant="link" colorScheme="blue">
              {project.project_name}
            </Button>
          </HStack>
        )}
      </PageHeader>

      <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
        {/* Left: Configuration */}
        <VStack spacing={6} align="stretch">
          {/* Image Source */}
          <Card>
            <CardHeader>
              <Heading size="md">Image Source</Heading>
            </CardHeader>
            <CardBody>
              {project ? (
                <Tabs
                  index={imageSource === 'project' ? 0 : 1}
                  onChange={(idx) => setImageSource(idx === 0 ? 'project' : 'upload')}
                >
                  <TabList>
                    <Tab>Project Images ({project.uploaded_images.length})</Tab>
                    <Tab>Upload New</Tab>
                  </TabList>
                  <TabPanels>
                    <TabPanel px={0}>
                      {project.uploaded_images.length === 0 ? (
                        <Alert status="info">
                          <AlertIcon />
                          No images in project. Upload images in the project page first.
                        </Alert>
                      ) : (
                        <VStack align="stretch" spacing={3}>
                          <HStack justify="space-between">
                            <Text fontSize="sm" color="gray.600">
                              {selectedProjectImages.length} of {project.uploaded_images.length} selected
                            </Text>
                            <HStack>
                              <Button size="xs" onClick={handleSelectAllImages}>All</Button>
                              <Button size="xs" onClick={handleSelectNoImages}>None</Button>
                            </HStack>
                          </HStack>
                          <SimpleGrid columns={4} spacing={2} maxH="200px" overflowY="auto">
                            {project.uploaded_images.map((img: UploadedImage) => (
                              <Box
                                key={img.image_id}
                                position="relative"
                                cursor="pointer"
                                onClick={() => toggleImageSelection(img.image_id)}
                                opacity={selectedProjectImages.includes(img.image_id) ? 1 : 0.5}
                                border={selectedProjectImages.includes(img.image_id) ? '2px solid' : 'none'}
                                borderColor="blue.500"
                                borderRadius="md"
                              >
                                <Image
                                  src={`/api/uploads/${projectId}/${img.image_id}_${img.filename}`}
                                  alt={img.filename}
                                  h="60px"
                                  w="100%"
                                  objectFit="cover"
                                  borderRadius="md"
                                  fallback={
                                    <Box h="60px" bg="gray.200" borderRadius="md" display="flex" alignItems="center" justifyContent="center">
                                      <Text fontSize="xs">{img.filename}</Text>
                                    </Box>
                                  }
                                />
                              </Box>
                            ))}
                          </SimpleGrid>
                        </VStack>
                      )}
                    </TabPanel>
                    <TabPanel px={0}>
                      <VStack spacing={4}>
                        <Button
                          w="full"
                          colorScheme="blue"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Select Image
                        </Button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={handleFileSelect}
                        />
                        {previewUrl && (
                          <Image
                            src={previewUrl}
                            alt="Preview"
                            maxH="150px"
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
                    </TabPanel>
                  </TabPanels>
                </Tabs>
              ) : (
                <VStack spacing={4}>
                  <Alert status="info" size="sm">
                    <AlertIcon />
                    <Text fontSize="sm">
                      Select a project to use existing images, or upload directly.
                    </Text>
                  </Alert>
                  <Button
                    w="full"
                    colorScheme="blue"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Select Image
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                  />
                  {previewUrl && (
                    <Image
                      src={previewUrl}
                      alt="Preview"
                      maxH="150px"
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
              )}
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
            isDisabled={
              selectedClasses.length === 0 ||
              (imageSource === 'upload' && !selectedFile) ||
              (imageSource === 'project' && selectedProjectImages.length === 0)
            }
          >
            {imageSource === 'project' && selectedProjectImages.length > 1
              ? `Analyze ${selectedProjectImages.length} Images`
              : 'Analyze Image'}
          </Button>
        </VStack>

        {/* Right: Results */}
        <VStack spacing={6} align="stretch">
          {analyzing && (
            <Alert status="info">
              <AlertIcon />
              {batchProgress
                ? `Analyzing images... ${batchProgress.current}/${batchProgress.total}`
                : 'Analyzing image... This may take a moment.'}
            </Alert>
          )}

          {batchProgress && (
            <Progress
              value={(batchProgress.current / batchProgress.total) * 100}
              colorScheme="blue"
              hasStripe
              isAnimated
            />
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
                  {(statistics as Record<string, number>).images_processed !== undefined ? (
                    <>
                      <HStack justify="space-between">
                        <Text>Images Processed:</Text>
                        <Badge colorScheme="green">
                          {(statistics as Record<string, number>).images_processed} / {(statistics as Record<string, number>).total_images}
                        </Badge>
                      </HStack>
                      <Text fontSize="sm" color="gray.500">
                        Individual results are saved for each image.
                      </Text>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </VStack>
              </CardBody>
            </Card>
          )}

          {!analyzing && !statistics && (
            <EmptyState
              icon={ScanSearch}
              title="No results yet"
              description={project
                ? 'Select images from the project, choose classes, then click Analyze.'
                : 'Select an image and classes, then click Analyze to see results.'}
            />
          )}
        </VStack>
      </SimpleGrid>

      {/* Navigation buttons for pipeline mode */}
      {routeProjectId && (
        <HStack justify="space-between" mt={6}>
          <Button as={Link} to={`/projects/${routeProjectId}`} variant="outline">
            Back to Project
          </Button>
          <Button as={Link} to={`/projects/${routeProjectId}/indicators`} colorScheme="blue">
            Next: Indicators
          </Button>
        </HStack>
      )}
    </PageShell>
  );
}

export default VisionAnalysis;
