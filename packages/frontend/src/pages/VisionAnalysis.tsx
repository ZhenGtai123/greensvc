import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useParams, Link } from 'react-router-dom';
import {
  Box,
  Heading,
  Button,
  VStack,
  HStack,
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
  Switch,
  FormControl,
  FormLabel,
  FormHelperText,
  Spinner,
} from '@chakra-ui/react';
import { ScanSearch, Download, Eye, Archive, Lightbulb, Check as CheckIcon } from 'lucide-react';
import JSZip from 'jszip';
import { useSemanticConfig, useProject, useRecommendIndicators } from '../hooks/useApi';
import api from '../api';
import type { SemanticClass, UploadedImage, IndicatorRecommendation } from '../types';
import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import useAppToast from '../hooks/useAppToast';
import useAppStore from '../store/useAppStore';

const DIMENSIONS = [
  { id: 'PRF_AES', name: 'Aesthetics' },
  { id: 'PRF_RST', name: 'Restoration' },
  { id: 'PRF_EMO', name: 'Emotion' },
  { id: 'PRF_THR', name: 'Thermal' },
  { id: 'PRF_USE', name: 'Spatial Use' },
  { id: 'PRF_SOC', name: 'Social' },
];

function VisionAnalysis() {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const projectId = routeProjectId || searchParams.get('project');

  const { data: semanticConfig, isLoading: configLoading } = useSemanticConfig();
  const { data: project, isLoading: projectLoading } = useProject(projectId || '');
  const toast = useAppToast();

  // Vision API health check
  const [visionHealthy, setVisionHealthy] = useState<boolean | null>(null);
  const [visionChecking, setVisionChecking] = useState(false);

  const checkVisionHealth = useCallback(async () => {
    setVisionChecking(true);
    try {
      const res = await api.testVision();
      setVisionHealthy(res.data.healthy);
    } catch {
      setVisionHealthy(false);
    }
    setVisionChecking(false);
  }, []);

  useEffect(() => {
    checkVisionHealth();
  }, [checkVisionHealth]);

  // Form state
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [holeFilling, setHoleFilling] = useState(false);

  // Project image selection
  const [selectedProjectImages, setSelectedProjectImages] = useState<string[]>([]);

  // Panorama mode
  const [isPanorama, setIsPanorama] = useState(false);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{current: number; total: number} | null>(null);

  // Vision results persisted in store (survive navigation)
  const {
    visionMaskResults: maskResults, setVisionMaskResults: setMaskResults,
    visionStatistics: statistics, setVisionStatistics: setStatistics,
    recommendations, setRecommendations,
    selectedIndicators, addSelectedIndicator, removeSelectedIndicator,
    indicatorRelationships, setIndicatorRelationships,
    setRecommendationSummary,
  } = useAppStore();

  // Indicator recommendation
  const recommendMutation = useRecommendIndicators();

  const handleRunRecommendation = useCallback(() => {
    if (!project || !project.performance_dimensions?.length) return;
    recommendMutation.mutate({
      project_name: project.project_name,
      project_location: project.project_location || '',
      space_type_id: project.space_type_id || '',
      koppen_zone_id: project.koppen_zone_id || '',
      lcz_type_id: project.lcz_type_id || '',
      age_group_id: project.age_group_id || '',
      performance_dimensions: project.performance_dimensions,
      design_brief: project.design_brief || '',
    }, {
      onSuccess: (result) => {
        if (result.success) {
          setRecommendations(result.recommendations);
          setIndicatorRelationships(result.indicator_relationships || []);
          setRecommendationSummary(result.summary || null);
          toast({ title: `${result.recommendations.length} indicators recommended`, status: 'success' });
        } else {
          toast({ title: result.error || 'Recommendation failed', status: 'error' });
        }
      },
    });
  }, [project, recommendMutation, toast]);

  const isIndicatorSelected = (id: string) => selectedIndicators.some(i => i.indicator_id === id);
  const toggleIndicator = (rec: IndicatorRecommendation) => {
    if (isIndicatorSelected(rec.indicator_id)) {
      removeSelectedIndicator(rec.indicator_id);
    } else {
      addSelectedIndicator(rec);
    }
  };

  // Default: select all semantic classes once when config loads
  const classesInitialized = useRef(false);
  useEffect(() => {
    if (!classesInitialized.current && semanticConfig?.classes) {
      setSelectedClasses(semanticConfig.classes.map((c) => c.name));
      classesInitialized.current = true;
    }
  }, [semanticConfig]);

  // Default: select all project images once when project loads
  const imagesInitialized = useRef(false);
  useEffect(() => {
    if (!imagesInitialized.current && project?.uploaded_images && project.uploaded_images.length > 0) {
      setSelectedProjectImages(project.uploaded_images.map(img => img.image_id));
      imagesInitialized.current = true;

      // Restore mask results from project data if Zustand store is empty
      if (maskResults.length === 0) {
        const restored: Array<{imageId: string; maskPaths: Record<string, string>}> = [];
        for (const img of project.uploaded_images) {
          if (img.mask_filepaths && Object.keys(img.mask_filepaths).length > 0) {
            restored.push({ imageId: img.image_id, maskPaths: img.mask_filepaths });
          }
        }
        if (restored.length > 0) {
          setMaskResults(restored);
        }
      }
    }
  }, [project]);

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
    setMaskResults([]);

    try {
      if (selectedProjectImages.length > 0 && projectId) {
        let processed = 0;
        const allResults: Record<string, unknown>[] = [];
        const allMasks: Array<{imageId: string; maskPaths: Record<string, string>}> = [];
        const failedImages: string[] = [];
        const requestPayload = {
          semantic_classes: selectedClasses,
          semantic_countability: countability,
          openness_list: openness,
          enable_hole_filling: holeFilling,
        };

        for (const imageId of selectedProjectImages) {
          const img = project?.uploaded_images.find(i => i.image_id === imageId);
          if (!img) continue;

          try {
            if (isPanorama && projectId) {
              // Panorama mode: call panorama endpoint, get 3 views per image
              const response = await api.vision.analyzeProjectImagePanorama(projectId, imageId, requestPayload);

              const views = response.data.views as Record<string, {
                status: string;
                mask_paths: Record<string, string>;
                statistics: Record<string, unknown>;
              }> | undefined;
              if (views) {
                for (const [viewName, viewData] of Object.entries(views)) {
                  if (viewData.status === 'success') {
                    allResults.push(viewData.statistics);
                    if (viewData.mask_paths && Object.keys(viewData.mask_paths).length > 0) {
                      allMasks.push({ imageId: `${imageId}_${viewName}`, maskPaths: viewData.mask_paths });
                    }
                  }
                }
              }
            } else {
              // Standard single-image mode
              const response = await api.vision.analyzeProjectImage(projectId, imageId, requestPayload);

              if (response.data.status === 'success') {
                allResults.push(response.data.statistics);
                if (response.data.mask_paths && Object.keys(response.data.mask_paths).length > 0) {
                  allMasks.push({ imageId, maskPaths: response.data.mask_paths });
                }
              } else {
                failedImages.push(imageId);
              }
            }
          } catch (err) {
            failedImages.push(imageId);
            console.error(`Vision analysis failed for ${imageId}:`, err);
          }

          processed++;
          setBatchProgress({ current: processed, total: selectedProjectImages.length });
        }

        setMaskResults(allMasks);

        if (allResults.length > 0) {
          setStatistics({
            images_processed: allResults.length,
            total_images: selectedProjectImages.length,
            results: allResults,
          });
        }

        // Show result with failure details
        if (failedImages.length === 0) {
          toast({
            title: `Analysis complete: ${allResults.length}/${selectedProjectImages.length} images processed`,
            status: 'success',
          });
        } else {
          toast({
            title: `Analysis done with ${failedImages.length} failure(s): ${failedImages.slice(0, 3).join(', ')}${failedImages.length > 3 ? '...' : ''}`,
            status: 'warning',
            duration: 8000,
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
      <PageHeader title="Prepare">
        {project && (
          <HStack>
            <Text color="gray.500">Project:</Text>
            <Button as={Link} to={`/projects/${projectId}`} variant="link" colorScheme="blue">
              {project.project_name}
            </Button>
          </HStack>
        )}
      </PageHeader>

      {/* Vision API status banner */}
      {visionHealthy === false && (
        <Alert status="error" mb={4} borderRadius="md">
          <AlertIcon />
          <Box flex={1}>
            <Text fontWeight="bold">Vision API is not running</Text>
            <Text fontSize="sm">
              Please start AI_City_View (default: http://localhost:8000) before running analysis.
            </Text>
          </Box>
          <Button size="sm" variant="outline" colorScheme="red" onClick={checkVisionHealth} isLoading={visionChecking}>
            Retry
          </Button>
        </Alert>
      )}

      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={6}>
        {/* ═══ LEFT COLUMN: Vision Analysis ═══ */}
        <VStack spacing={6} align="stretch">
          {/* Project Images */}
          <Card>
            <CardHeader>
              <Heading size="md">Project Images</Heading>
            </CardHeader>
            <CardBody>
              {!project ? (
                <Alert status="warning">
                  <AlertIcon />
                  <Text fontSize="sm">No project selected. Navigate from a project page to use Vision Analysis.</Text>
                </Alert>
              ) : project.uploaded_images.length === 0 ? (
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
            </CardBody>
          </Card>

          {/* Analysis Options */}
          <Card>
            <CardHeader>
              <Heading size="md">Options</Heading>
            </CardHeader>
            <CardBody>
              <VStack align="stretch" spacing={3}>
                <Checkbox
                  isChecked={holeFilling}
                  onChange={(e) => setHoleFilling(e.target.checked)}
                >
                  Enable Hole Filling
                </Checkbox>
                <FormControl display="flex" alignItems="center">
                  <Switch
                    id="panorama-mode"
                    isChecked={isPanorama}
                    onChange={(e) => setIsPanorama(e.target.checked)}
                    mr={3}
                  />
                  <Box>
                    <FormLabel htmlFor="panorama-mode" mb={0} fontSize="sm">
                      Panorama Mode
                    </FormLabel>
                    <FormHelperText mt={0} fontSize="xs">
                      Splits panoramic image into 3 views (left / front / right)
                    </FormHelperText>
                  </Box>
                </FormControl>
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
                  {semanticConfig?.classes?.map((cls: SemanticClass) => (
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
            isDisabled={selectedClasses.length === 0 || selectedProjectImages.length === 0 || visionHealthy === false}
          >
            {selectedProjectImages.length > 1
              ? `Analyze ${selectedProjectImages.length} Images`
              : 'Analyze Image'}
          </Button>

          {/* ── Vision Results ── */}
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

          {/* Mask Previews */}
          {maskResults.length > 0 && (
            <Card>
              <CardHeader>
                <HStack justify="space-between">
                  <Heading size="md">Output Masks</Heading>
                  <HStack>
                    <Badge colorScheme="green">{maskResults.reduce((s, r) => s + Object.keys(r.maskPaths).length, 0)} files</Badge>
                    <Button
                      size="xs"
                      leftIcon={<Archive size={12} />}
                      colorScheme="blue"
                      onClick={async () => {
                        const zip = new JSZip();
                        for (const { imageId, maskPaths } of maskResults) {
                          // Handle panorama view entries (e.g. "img1_left")
                          const vm = imageId.match(/^(.+)_(left|front|right)$/);
                          const baseId = vm ? vm[1] : imageId;
                          const view = vm ? vm[2] : null;
                          const img = project?.uploaded_images.find(i => i.image_id === baseId);
                          const baseName = img?.filename
                            ? img.filename.replace(/\.[^/.]+$/, '')
                            : baseId;
                          const folderName = view ? `${baseName}_${view}` : baseName;
                          const folder = zip.folder(folderName)!;
                          for (const maskKey of Object.keys(maskPaths)) {
                            const url = `/api/masks/${projectId}/${imageId}/${maskKey}.png`;
                            try {
                              const resp = await fetch(url);
                              if (resp.ok) {
                                const blob = await resp.blob();
                                folder.file(`${maskKey}.png`, blob);
                              }
                            } catch {
                              // skip failed fetches
                            }
                          }
                        }
                        const blob = await zip.generateAsync({ type: 'blob' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${project?.project_name?.replace(/\s+/g, '_') || 'masks'}_vision_outputs.zip`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      Download All (ZIP)
                    </Button>
                  </HStack>
                </HStack>
              </CardHeader>
              <CardBody>
                <VStack align="stretch" spacing={4}>
                  {maskResults.map(({ imageId, maskPaths }) => {
                    // For panorama entries like "img1_left", parse the view suffix
                    const viewMatch = imageId.match(/^(.+)_(left|front|right)$/);
                    const baseImageId = viewMatch ? viewMatch[1] : imageId;
                    const viewName = viewMatch ? viewMatch[2] : null;
                    const img = project?.uploaded_images.find(i => i.image_id === baseImageId);
                    const viewLabels: Record<string, string> = { left: 'Left View', front: 'Front View', right: 'Right View' };
                    const displayLabel = viewName
                      ? `${img?.filename || baseImageId} — ${viewLabels[viewName]}`
                      : (img?.filename || imageId);
                    return (
                      <Box key={imageId}>
                        {maskResults.length > 1 && (
                          <Text fontSize="sm" fontWeight="semibold" mb={2} color="gray.700">
                            {displayLabel}
                          </Text>
                        )}
                        <SimpleGrid columns={3} spacing={2}>
                          {Object.entries(maskPaths).map(([maskKey]) => {
                            const maskUrl = `/api/masks/${projectId}/${imageId}/${maskKey}.png`;
                            const label = maskKey.replace(/_/g, ' ');
                            return (
                              <Box key={maskKey} position="relative" borderRadius="md" overflow="hidden" bg="gray.50">
                                <Image
                                  src={maskUrl}
                                  alt={label}
                                  w="100%"
                                  h="80px"
                                  objectFit="cover"
                                  fallback={
                                    <Box h="80px" display="flex" alignItems="center" justifyContent="center">
                                      <Text fontSize="2xs" color="gray.400">{label}</Text>
                                    </Box>
                                  }
                                />
                                <HStack
                                  position="absolute"
                                  bottom={0}
                                  left={0}
                                  right={0}
                                  bg="blackAlpha.600"
                                  px={1}
                                  py={0.5}
                                  justify="space-between"
                                >
                                  <Text fontSize="2xs" color="white" noOfLines={1}>{label}</Text>
                                  <HStack spacing={0}>
                                    <Button
                                      as="a"
                                      href={maskUrl}
                                      target="_blank"
                                      size="xs"
                                      variant="ghost"
                                      color="white"
                                      minW="auto"
                                      p={0}
                                      _hover={{ bg: 'whiteAlpha.300' }}
                                    >
                                      <Eye size={12} />
                                    </Button>
                                    <Button
                                      as="a"
                                      href={maskUrl}
                                      download={`${maskKey}.png`}
                                      size="xs"
                                      variant="ghost"
                                      color="white"
                                      minW="auto"
                                      p={0}
                                      _hover={{ bg: 'whiteAlpha.300' }}
                                    >
                                      <Download size={12} />
                                    </Button>
                                  </HStack>
                                </HStack>
                              </Box>
                            );
                          })}
                        </SimpleGrid>
                      </Box>
                    );
                  })}
                </VStack>
              </CardBody>
            </Card>
          )}

          {!analyzing && !statistics && maskResults.length === 0 && (
            <EmptyState
              icon={ScanSearch}
              title="No results yet"
              description="Select images, choose classes, then click Analyze."
            />
          )}
        </VStack>

        {/* ═══ RIGHT COLUMN: Indicator Recommendations ═══ */}
        <VStack spacing={6} align="stretch">
          <Card>
            <CardHeader>
              <HStack justify="space-between">
                <HStack spacing={2}>
                  <Lightbulb size={18} />
                  <Heading size="md">Indicators</Heading>
                </HStack>
                <HStack spacing={2}>
                  {recommendMutation.isPending && <Spinner size="sm" />}
                  {selectedIndicators.length > 0 && (
                    <Badge colorScheme="blue">{selectedIndicators.length} selected</Badge>
                  )}
                </HStack>
              </HStack>
            </CardHeader>
            <CardBody>
              {/* Dimensions badges */}
              {project?.performance_dimensions && project.performance_dimensions.length > 0 && (
                <HStack spacing={1} flexWrap="wrap" mb={3}>
                  {project.performance_dimensions.map(d => {
                    const dim = DIMENSIONS.find(x => x.id === d);
                    return <Badge key={d} fontSize="2xs" colorScheme="purple">{dim?.name || d}</Badge>;
                  })}
                </HStack>
              )}

              {/* Run button */}
              <Button
                colorScheme="blue"
                size="sm"
                w="full"
                onClick={handleRunRecommendation}
                isLoading={recommendMutation.isPending}
                loadingText="Running (may take 2-4 min)..."
                isDisabled={!project?.performance_dimensions?.length}
              >
                {recommendations.length > 0 ? 'Re-run Recommendations' : 'Get Recommendations'}
              </Button>

              {recommendMutation.isPending && (
                <Alert status="info" mt={2}>
                  <AlertIcon />
                  <Text fontSize="xs">LLM is analyzing {project?.performance_dimensions?.length || 0} dimensions. This typically takes 2-4 minutes.</Text>
                </Alert>
              )}

              {/* Results */}
              {recommendations.length > 0 ? (
                <VStack align="stretch" spacing={2} maxH="500px" overflowY="auto">
                  {recommendations.map((rec) => {
                    const selected = isIndicatorSelected(rec.indicator_id);
                    return (
                      <Box
                        key={rec.indicator_id}
                        p={2}
                        borderWidth="1px"
                        borderRadius="md"
                        borderColor={selected ? 'blue.400' : 'gray.200'}
                        bg={selected ? 'blue.50' : 'white'}
                        cursor="pointer"
                        onClick={() => toggleIndicator(rec)}
                        _hover={{ borderColor: 'blue.300' }}
                      >
                        <HStack justify="space-between">
                          <HStack spacing={2}>
                            <Box
                              w={4} h={4} borderRadius="sm"
                              bg={selected ? 'blue.500' : 'gray.200'}
                              color="white"
                              display="flex" alignItems="center" justifyContent="center"
                              flexShrink={0}
                            >
                              {selected && <CheckIcon size={10} />}
                            </Box>
                            <Text fontSize="sm" fontWeight="bold">{rec.indicator_id}</Text>
                          </HStack>
                          <Badge colorScheme="green" fontSize="2xs">
                            {(rec.relevance_score * 100).toFixed(0)}%
                          </Badge>
                        </HStack>
                        <Text fontSize="xs" color="gray.600" noOfLines={1} pl={6}>{rec.indicator_name}</Text>
                      </Box>
                    );
                  })}
                </VStack>
              ) : !recommendMutation.isPending ? (
                <Text fontSize="sm" color="gray.500" textAlign="center">
                  Click "Get Recommendations" to start
                </Text>
              ) : null}
            </CardBody>
          </Card>
        </VStack>
      </SimpleGrid>

      {/* Navigation buttons */}
      {routeProjectId && (
        <HStack justify="space-between" mt={6}>
          <Button as={Link} to={`/projects/${routeProjectId}`} variant="outline">
            Back: Setup
          </Button>
          <Button as={Link} to={`/projects/${routeProjectId}/analysis`} colorScheme="blue">
            Next: Analysis
          </Button>
        </HStack>
      )}
    </PageShell>
  );
}

export default VisionAnalysis;
