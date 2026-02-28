import { useState, useRef, useEffect } from 'react';
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
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Switch,
  FormControl,
  FormLabel,
  FormHelperText,
} from '@chakra-ui/react';
import { ScanSearch, Download, Eye, Archive } from 'lucide-react';
import JSZip from 'jszip';
import { useSemanticConfig, useProject } from '../hooks/useApi';
import api from '../api';
import type { SemanticClass, UploadedImage } from '../types';
import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import useAppToast from '../hooks/useAppToast';
import useAppStore from '../store/useAppStore';

function VisionAnalysis() {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const projectId = routeProjectId || searchParams.get('project');

  const { data: semanticConfig, isLoading: configLoading } = useSemanticConfig();
  const { data: project, isLoading: projectLoading } = useProject(projectId || '');
  const toast = useAppToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [holeFilling, setHoleFilling] = useState(false);

  // Project image selection
  const [selectedProjectImages, setSelectedProjectImages] = useState<string[]>([]);
  const [imageSource, setImageSource] = useState<'upload' | 'project'>(projectId ? 'project' : 'upload');

  // Panorama mode
  const [isPanorama, setIsPanorama] = useState(false);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{current: number; total: number} | null>(null);

  // Vision results persisted in store (survive navigation)
  const { visionMaskResults: maskResults, setVisionMaskResults: setMaskResults, visionStatistics: statistics, setVisionStatistics: setStatistics } = useAppStore();;

  // Reset image source when project changes
  useEffect(() => {
    setImageSource(projectId ? 'project' : 'upload');
  }, [projectId]);

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
    }
  }, [project]);

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
    setMaskResults([]);

    try {
      if (imageSource === 'upload' && selectedFile) {
        const response = await api.vision.analyze(selectedFile, {
          semantic_classes: selectedClasses,
          semantic_countability: countability,
          openness_list: openness,
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
        const allMasks: Array<{imageId: string; maskPaths: Record<string, string>}> = [];
        const requestPayload = {
          semantic_classes: selectedClasses,
          semantic_countability: countability,
          openness_list: openness,
          enable_hole_filling: holeFilling,
        };

        for (const imageId of selectedProjectImages) {
          const img = project?.uploaded_images.find(i => i.image_id === imageId);
          if (!img) continue;

          if (isPanorama && projectId) {
            // Panorama mode: call panorama endpoint, get 3 views per image
            const response = await api.vision.analyzeProjectImagePanorama(projectId, imageId, requestPayload);
            processed++;
            setBatchProgress({ current: processed, total: selectedProjectImages.length });

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
              if (response.data.mask_paths && Object.keys(response.data.mask_paths).length > 0) {
                allMasks.push({ imageId, maskPaths: response.data.mask_paths });
              }
            }
          }
        }

        setMaskResults(allMasks);

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
                {imageSource === 'project' && (
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
                )}
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
