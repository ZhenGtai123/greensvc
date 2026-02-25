import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Box,
  Flex,
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
  Circle,
  useToast,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Image,
  IconButton,
  Tag,
  Wrap,
  WrapItem,
  Divider,
  Alert,
  AlertIcon,
  Progress,
  Checkbox,
  Select,
  Spinner,
} from '@chakra-ui/react';
import { ArrowLeft, Upload, X, Undo2, Check, ImageIcon, MapPin } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import useAppStore from '../store/useAppStore';
import type { Project, UploadedImage } from '../types';
import PageShell from '../components/PageShell';
import EmptyState from '../components/EmptyState';

/** Build the static-file URL for a project image. */
function imageUrl(projectId: string, img: UploadedImage): string {
  return `/api/uploads/${projectId}/${img.image_id}_${img.filename}`;
}

// ---------------------------------------------------------------------------
// Pipeline progress card — shows sequential stage status
// ---------------------------------------------------------------------------
const STAGES = [
  { key: 'vision', label: 'Vision Analysis', desc: 'Segment images with AI vision model' },
  { key: 'indicators', label: 'Indicators', desc: 'Get indicator recommendations' },
  { key: 'analysis', label: 'Analysis', desc: 'Run zone statistics & design strategies' },
  { key: 'reports', label: 'Reports', desc: 'Calculate metrics & generate reports' },
] as const;

function getStageStatus(project: Project) {
  const hasImages = (project.uploaded_images?.length ?? 0) > 0;
  const hasZones = (project.spatial_zones?.length ?? 0) > 0;
  const hasMasks = project.uploaded_images?.some(
    (img) => img.mask_filepaths && Object.keys(img.mask_filepaths).length > 0,
  );
  const hasDimensions = (project.performance_dimensions?.length ?? 0) > 0;
  const hasMetrics = project.uploaded_images?.some(
    (img) => img.metrics_results && Object.keys(img.metrics_results).length > 0,
  );

  return [
    { done: !!hasMasks, ready: hasImages && hasZones },
    { done: hasDimensions, ready: true },
    { done: !!hasMetrics, ready: !!hasMasks && hasDimensions },
    { done: false, ready: !!hasMetrics },
  ];
}

function PipelineCard({ projectId, project }: { projectId: string; project: Project }) {
  const statuses = getStageStatus(project);
  const nextIdx = statuses.findIndex((s) => !s.done && s.ready);

  return (
    <Card>
      <CardHeader pb={2}>
        <Heading size="sm">Analysis Pipeline</Heading>
      </CardHeader>
      <CardBody pt={0}>
        <VStack spacing={0} align="stretch">
          {STAGES.map((stage, i) => {
            const { done, ready } = statuses[i];
            const isNext = i === nextIdx;
            const locked = !done && !ready;

            return (
              <Flex
                key={stage.key}
                align="center"
                py={3}
                borderTop={i > 0 ? '1px solid' : 'none'}
                borderColor="gray.100"
                opacity={locked ? 0.45 : 1}
              >
                <Circle
                  size="28px"
                  bg={done ? 'brand.500' : isNext ? 'blue.500' : 'gray.200'}
                  color={done || isNext ? 'white' : 'gray.500'}
                  fontSize="xs"
                  fontWeight="bold"
                  mr={3}
                  flexShrink={0}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  {done ? <Check size={14} /> : i + 1}
                </Circle>

                <Box flex={1} minW={0}>
                  <Text fontSize="sm" fontWeight="600" color={locked ? 'gray.400' : 'gray.700'}>
                    {stage.label}
                  </Text>
                  <Text fontSize="xs" color="gray.400" noOfLines={1}>
                    {stage.desc}
                  </Text>
                </Box>

                {done ? (
                  <Button
                    as={Link}
                    to={`/projects/${projectId}/${stage.key}`}
                    size="xs"
                    variant="ghost"
                    colorScheme="green"
                    flexShrink={0}
                  >
                    View
                  </Button>
                ) : isNext ? (
                  <Button
                    as={Link}
                    to={`/projects/${projectId}/${stage.key}`}
                    size="xs"
                    colorScheme="blue"
                    flexShrink={0}
                  >
                    Start
                  </Button>
                ) : null}
              </Flex>
            );
          })}
        </VStack>
      </CardBody>
    </Card>
  );
}

function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setCurrentProject } = useAppStore();

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [targetZoneId, setTargetZoneId] = useState('');
  const [batchAssigning, setBatchAssigning] = useState(false);

  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId!).then(res => res.data),
    enabled: !!projectId,
  });

  useEffect(() => {
    if (project) {
      setCurrentProject(project);
    }
  }, [project, setCurrentProject]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !projectId) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const fileArray = Array.from(files);
      const chunkSize = 10;
      let uploaded = 0;

      for (let i = 0; i < fileArray.length; i += chunkSize) {
        const chunk = fileArray.slice(i, i + chunkSize);
        await api.projects.uploadImages(projectId, chunk);
        uploaded += chunk.length;
        setUploadProgress(Math.round((uploaded / fileArray.length) * 100));
      }

      toast({ title: `${fileArray.length} image(s) uploaded`, status: 'success' });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    } catch {
      toast({ title: 'Failed to upload images', status: 'error' });
    }

    setUploading(false);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleBatchAssign = async () => {
    if (!targetZoneId || selectedImageIds.size === 0) return;
    setBatchAssigning(true);
    try {
      const assignments = Array.from(selectedImageIds).map(imageId => ({
        image_id: imageId,
        zone_id: targetZoneId,
      }));
      await api.projects.batchAssignZones(projectId!, assignments);
      const count = selectedImageIds.size;
      setSelectedImageIds(new Set());
      setTargetZoneId('');
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast({ title: `${count} image(s) assigned`, status: 'success' });
    } catch {
      toast({ title: 'Failed to assign images', status: 'error' });
    } finally {
      setBatchAssigning(false);
    }
  };

  const handleUnassign = async (imageId: string) => {
    try {
      await api.projects.assignImageZone(projectId!, imageId, null);
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast({ title: 'Image unassigned', status: 'success' });
    } catch {
      toast({ title: 'Failed to unassign image', status: 'error' });
    }
  };

  const toggleImageSelection = (imageId: string) => {
    setSelectedImageIds(prev => {
      const next = new Set(prev);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
  };

  const deleteImageMutation = useMutation({
    mutationFn: (imageId: string) => api.projects.deleteImage(projectId!, imageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast({ title: 'Image deleted', status: 'success' });
    },
  });

  if (isLoading) {
    return <PageShell isLoading loadingText="Loading project..." />;
  }

  if (error || !project) {
    return (
      <PageShell>
        <Alert status="error">
          <AlertIcon />
          Project not found
        </Alert>
        <Button mt={4} onClick={() => navigate('/projects')}>
          Back to Projects
        </Button>
      </PageShell>
    );
  }

  const ungroupedImages = project.uploaded_images.filter(img => !img.zone_id);
  const getZoneImages = (zoneId: string) =>
    project.uploaded_images.filter(img => img.zone_id === zoneId);

  return (
    <PageShell>
      {/* Header */}
      <HStack justify="space-between" mb={6}>
        <Box>
          <HStack>
            <Button variant="ghost" size="sm" as={Link} to="/projects" leftIcon={<ArrowLeft size={16} />}>
              Back
            </Button>
            <Heading size="lg">{project.project_name}</Heading>
            <Badge colorScheme="blue">{project.id}</Badge>
          </HStack>
          <Text color="gray.500" mt={1}>
            {project.project_location || 'No location'} &bull; {project.site_scale || 'No scale'}
          </Text>
        </Box>
        <Button variant="outline" as={Link} to={`/projects/${projectId}/edit`}>
          Edit Project
        </Button>
      </HStack>

      <Tabs>
        <TabList>
          <Tab>Overview</Tab>
          <Tab>Zones ({project.spatial_zones.length})</Tab>
          <Tab>Images ({project.uploaded_images.length})</Tab>
        </TabList>

        <TabPanels>
          {/* Overview Tab */}
          <TabPanel>
            <PipelineCard projectId={projectId!} project={project} />

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} mt={6}>
              <Card>
                <CardHeader>
                  <Heading size="md">Project Information</Heading>
                </CardHeader>
                <CardBody>
                  <VStack align="stretch" spacing={3}>
                    <HStack justify="space-between">
                      <Text color="gray.500">Phase</Text>
                      <Text fontWeight="bold">{project.project_phase || '-'}</Text>
                    </HStack>
                    <Divider />
                    <HStack justify="space-between">
                      <Text color="gray.500">Climate Zone</Text>
                      <Badge>{project.koppen_zone_id || '-'}</Badge>
                    </HStack>
                    <HStack justify="space-between">
                      <Text color="gray.500">Space Type</Text>
                      <Badge>{project.space_type_id || '-'}</Badge>
                    </HStack>
                    <HStack justify="space-between">
                      <Text color="gray.500">LCZ Type</Text>
                      <Badge>{project.lcz_type_id || '-'}</Badge>
                    </HStack>
                    <HStack justify="space-between">
                      <Text color="gray.500">Country</Text>
                      <Badge>{project.country_id || '-'}</Badge>
                    </HStack>
                  </VStack>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <Heading size="md">Performance Goals</Heading>
                </CardHeader>
                <CardBody>
                  <Text mb={3} color="gray.600" fontSize="sm">
                    {project.design_brief || 'No design brief provided'}
                  </Text>
                  <Divider mb={3} />
                  <Text fontWeight="bold" mb={2}>Dimensions:</Text>
                  <Wrap>
                    {project.performance_dimensions.length > 0 ? (
                      project.performance_dimensions.map(dim => (
                        <WrapItem key={dim}>
                          <Tag colorScheme="blue">{dim}</Tag>
                        </WrapItem>
                      ))
                    ) : (
                      <Text color="gray.400">No dimensions selected</Text>
                    )}
                  </Wrap>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <Heading size="md">Statistics</Heading>
                </CardHeader>
                <CardBody>
                  <SimpleGrid columns={3} spacing={4}>
                    <Box textAlign="center">
                      <Text fontSize="3xl" fontWeight="bold" color="blue.500">
                        {project.spatial_zones.length}
                      </Text>
                      <Text fontSize="sm" color="gray.500">Zones</Text>
                    </Box>
                    <Box textAlign="center">
                      <Text fontSize="3xl" fontWeight="bold" color="brand.500">
                        {project.uploaded_images.length}
                      </Text>
                      <Text fontSize="sm" color="gray.500">Images</Text>
                    </Box>
                    <Box textAlign="center">
                      <Text fontSize="3xl" fontWeight="bold" color="purple.500">
                        {project.uploaded_images.filter(i => i.zone_id).length}
                      </Text>
                      <Text fontSize="sm" color="gray.500">Grouped</Text>
                    </Box>
                  </SimpleGrid>
                </CardBody>
              </Card>
            </SimpleGrid>
          </TabPanel>

          {/* Zones Tab */}
          <TabPanel>
            {project.spatial_zones.length === 0 ? (
              <EmptyState icon={MapPin} title="No zones defined" description="No zones defined for this project." />
            ) : (
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                {project.spatial_zones.map(zone => {
                  const zoneImages = getZoneImages(zone.zone_id);
                  return (
                    <Card key={zone.zone_id}>
                      <CardHeader>
                        <HStack justify="space-between">
                          <Heading size="sm">{zone.zone_name}</Heading>
                          <Badge>{zone.status}</Badge>
                        </HStack>
                      </CardHeader>
                      <CardBody>
                        <Wrap mb={2}>
                          {zone.zone_types.map(type => (
                            <WrapItem key={type}>
                              <Tag size="sm">{type}</Tag>
                            </WrapItem>
                          ))}
                        </Wrap>
                        {zone.area && (
                          <Text fontSize="sm" color="gray.500">
                            Area: {zone.area} m²
                          </Text>
                        )}
                        <Text fontSize="sm" color="gray.500" mt={1}>
                          {zone.description || 'No description'}
                        </Text>
                        <Divider my={2} />
                        <Text fontSize="sm">
                          <strong>{zoneImages.length}</strong> images
                        </Text>
                        {zoneImages.length > 0 && (
                          <HStack mt={2} spacing={1} overflowX="auto">
                            {zoneImages.slice(0, 4).map(img => (
                              <Image
                                key={img.image_id}
                                src={imageUrl(project.id, img)}
                                alt={img.filename}
                                boxSize="40px"
                                objectFit="cover"
                                borderRadius="sm"
                                fallback={<Box boxSize="40px" bg="gray.200" borderRadius="sm" />}
                              />
                            ))}
                            {zoneImages.length > 4 && (
                              <Badge>+{zoneImages.length - 4}</Badge>
                            )}
                          </HStack>
                        )}
                      </CardBody>
                    </Card>
                  );
                })}
              </SimpleGrid>
            )}
          </TabPanel>

          {/* Images Tab */}
          <TabPanel>
            {/* Upload Area */}
            <Card mb={4}>
              <CardBody>
                <Box
                  p={6}
                  border="2px dashed"
                  borderColor="gray.300"
                  borderRadius="lg"
                  textAlign="center"
                  cursor="pointer"
                  bg="gray.50"
                  _hover={{ borderColor: 'brand.400', bg: 'brand.50' }}
                  transition="all 0.2s ease"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <VStack>
                      <Spinner />
                      <Text>Uploading... {uploadProgress}%</Text>
                      <Progress value={uploadProgress} w="200px" />
                    </VStack>
                  ) : (
                    <>
                      <Box color="gray.400" mb={2}>
                        <Upload size={32} />
                      </Box>
                      <Text fontWeight="bold">Click to upload images</Text>
                      <Text fontSize="sm" color="gray.500">
                        Supports batch upload - JPG/PNG
                      </Text>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                  />
                </Box>
              </CardBody>
            </Card>

            {/* Ungrouped Images */}
            {ungroupedImages.length > 0 && (
              <Card mb={4}>
                <CardHeader>
                  <Heading size="sm">Ungrouped Images ({ungroupedImages.length})</Heading>
                </CardHeader>
                <CardBody>
                  {project.spatial_zones.length > 0 && (
                    <HStack mb={3} spacing={3}>
                      <Checkbox
                        isChecked={selectedImageIds.size === ungroupedImages.length && ungroupedImages.length > 0}
                        isIndeterminate={selectedImageIds.size > 0 && selectedImageIds.size < ungroupedImages.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedImageIds(new Set(ungroupedImages.map(img => img.image_id)));
                          } else {
                            setSelectedImageIds(new Set());
                          }
                        }}
                      >
                        Select All
                      </Checkbox>
                      <Select
                        placeholder="Select zone..."
                        size="sm"
                        maxW="200px"
                        value={targetZoneId}
                        onChange={(e) => setTargetZoneId(e.target.value)}
                      >
                        {project.spatial_zones.map(zone => (
                          <option key={zone.zone_id} value={zone.zone_id}>
                            {zone.zone_name}
                          </option>
                        ))}
                      </Select>
                      <Button
                        size="sm"
                        colorScheme="blue"
                        isDisabled={!targetZoneId || selectedImageIds.size === 0}
                        isLoading={batchAssigning}
                        onClick={handleBatchAssign}
                      >
                        Assign ({selectedImageIds.size})
                      </Button>
                    </HStack>
                  )}
                  <SimpleGrid columns={{ base: 4, md: 6, lg: 8 }} spacing={2}>
                    {ungroupedImages.map(img => (
                      <Box key={img.image_id} position="relative">
                        <Image
                          src={imageUrl(project.id, img)}
                          alt={img.filename}
                          h="80px"
                          w="100%"
                          objectFit="cover"
                          borderRadius="md"
                          cursor="pointer"
                          border={selectedImageIds.has(img.image_id) ? '2px solid' : '2px solid transparent'}
                          borderColor={selectedImageIds.has(img.image_id) ? 'blue.400' : 'transparent'}
                          onClick={() => toggleImageSelection(img.image_id)}
                          fallback={
                            <Box h="80px" bg="gray.200" borderRadius="md" display="flex" alignItems="center" justifyContent="center">
                              <Text fontSize="xs">{img.filename}</Text>
                            </Box>
                          }
                        />
                        {project.spatial_zones.length > 0 && (
                          <Checkbox
                            position="absolute"
                            top={1}
                            left={1}
                            bg="whiteAlpha.800"
                            borderRadius="sm"
                            isChecked={selectedImageIds.has(img.image_id)}
                            onChange={() => toggleImageSelection(img.image_id)}
                          />
                        )}
                        <IconButton
                          aria-label="Delete"
                          icon={<X size={12} />}
                          size="xs"
                          position="absolute"
                          top={1}
                          right={1}
                          colorScheme="red"
                          onClick={(e) => { e.stopPropagation(); deleteImageMutation.mutate(img.image_id); }}
                        />
                      </Box>
                    ))}
                  </SimpleGrid>
                </CardBody>
              </Card>
            )}

            {/* Images by Zone */}
            {project.spatial_zones.map(zone => {
              const zoneImages = getZoneImages(zone.zone_id);
              if (zoneImages.length === 0) return null;
              return (
                <Card key={zone.zone_id} mb={4}>
                  <CardHeader>
                    <HStack justify="space-between">
                      <Heading size="sm">{zone.zone_name}</Heading>
                      <Badge>{zoneImages.length} images</Badge>
                    </HStack>
                  </CardHeader>
                  <CardBody>
                    <SimpleGrid columns={{ base: 4, md: 6, lg: 8 }} spacing={2}>
                      {zoneImages.map(img => (
                        <Box key={img.image_id} position="relative">
                          <Image
                            src={imageUrl(project.id, img)}
                            alt={img.filename}
                            h="80px"
                            w="100%"
                            objectFit="cover"
                            borderRadius="md"
                            fallback={
                              <Box h="80px" bg="gray.200" borderRadius="md" display="flex" alignItems="center" justifyContent="center">
                                <Text fontSize="xs">{img.filename}</Text>
                              </Box>
                            }
                          />
                          <IconButton
                            aria-label="Unassign from zone"
                            icon={<Undo2 size={12} />}
                            size="xs"
                            position="absolute"
                            top={1}
                            left={1}
                            colorScheme="yellow"
                            title="Move back to ungrouped"
                            onClick={() => handleUnassign(img.image_id)}
                          />
                          <IconButton
                            aria-label="Delete"
                            icon={<X size={12} />}
                            size="xs"
                            position="absolute"
                            top={1}
                            right={1}
                            colorScheme="red"
                            onClick={() => deleteImageMutation.mutate(img.image_id)}
                          />
                        </Box>
                      ))}
                    </SimpleGrid>
                  </CardBody>
                </Card>
              );
            })}

            {project.uploaded_images.length === 0 && (
              <EmptyState icon={ImageIcon} title="No images uploaded" description="Click above to upload images." />
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>
    </PageShell>
  );
}

export default ProjectDetail;
