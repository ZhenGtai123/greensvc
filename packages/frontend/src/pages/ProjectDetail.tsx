import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Box,
  Container,
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
  Spinner,
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
} from '@chakra-ui/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import useAppStore from '../store/useAppStore';

function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setCurrentProject } = useAppStore();

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Fetch project data
  const { data: project, isLoading, error } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId!).then(res => res.data),
    enabled: !!projectId,
  });

  // Set current project in store when loaded
  useEffect(() => {
    if (project) {
      setCurrentProject(project);
    }
  }, [project, setCurrentProject]);

  // Handle image upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !projectId) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const fileArray = Array.from(files);
      const chunkSize = 10; // Upload in chunks of 10
      let uploaded = 0;

      for (let i = 0; i < fileArray.length; i += chunkSize) {
        const chunk = fileArray.slice(i, i + chunkSize);
        await api.projects.uploadImages(projectId, chunk);
        uploaded += chunk.length;
        setUploadProgress(Math.round((uploaded / fileArray.length) * 100));
      }

      toast({
        title: `${fileArray.length} image(s) uploaded`,
        status: 'success',
      });

      // Refresh project data
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    } catch (error) {
      toast({
        title: 'Failed to upload images',
        status: 'error',
      });
    }

    setUploading(false);
    setUploadProgress(0);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Assign image to zone (for future drag-drop zone assignment)
  const _assignZoneMutation = useMutation({
    mutationFn: ({ imageId, zoneId }: { imageId: string; zoneId: string | null }) =>
      api.projects.assignImageZone(projectId!, imageId, zoneId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });
  void _assignZoneMutation; // Suppress unused warning

  // Delete image
  const deleteImageMutation = useMutation({
    mutationFn: (imageId: string) => api.projects.deleteImage(projectId!, imageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      toast({ title: 'Image deleted', status: 'success' });
    },
  });

  if (isLoading) {
    return (
      <Container maxW="container.xl" py={8} textAlign="center">
        <Spinner size="xl" />
      </Container>
    );
  }

  if (error || !project) {
    return (
      <Container maxW="container.xl" py={8}>
        <Alert status="error">
          <AlertIcon />
          Project not found
        </Alert>
        <Button mt={4} onClick={() => navigate('/projects')}>
          Back to Projects
        </Button>
      </Container>
    );
  }

  const ungroupedImages = project.uploaded_images.filter(img => !img.zone_id);
  const getZoneImages = (zoneId: string) =>
    project.uploaded_images.filter(img => img.zone_id === zoneId);

  return (
    <Container maxW="container.xl" py={8}>
      {/* Header */}
      <HStack justify="space-between" mb={6}>
        <Box>
          <HStack>
            <Button variant="ghost" size="sm" as={Link} to="/projects">
              ← Back
            </Button>
            <Heading size="lg">{project.project_name}</Heading>
            <Badge colorScheme="blue">{project.id}</Badge>
          </HStack>
          <Text color="gray.500" mt={1}>
            {project.project_location || 'No location'} • {project.site_scale || 'No scale'}
          </Text>
        </Box>
        <HStack>
          <Button variant="outline" as={Link} to={`/projects/${projectId}/edit`}>
            Edit Project
          </Button>
          <Button colorScheme="green" as={Link} to={`/vision?project=${projectId}`}>
            Analyze Images
          </Button>
          <Button colorScheme="blue" as={Link} to={`/indicators?project=${projectId}`}>
            Get Recommendations
          </Button>
        </HStack>
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
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
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
                      <Text fontSize="3xl" fontWeight="bold" color="green.500">
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
              <Box textAlign="center" py={8} color="gray.500">
                <Text>No zones defined for this project.</Text>
              </Box>
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
                                src={`/api/uploads/${project.id}/${img.image_id}_${img.filename}`}
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
                  _hover={{ borderColor: 'blue.400', bg: 'blue.50' }}
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
                      <Text fontSize="3xl" mb={2}>📸</Text>
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
                  <SimpleGrid columns={{ base: 4, md: 6, lg: 8 }} spacing={2}>
                    {ungroupedImages.map(img => (
                      <Box key={img.image_id} position="relative">
                        <Image
                          src={`/api/uploads/${project.id}/${img.image_id}_${img.filename}`}
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
                          aria-label="Delete"
                          icon={<Text>✕</Text>}
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
                            src={`/api/uploads/${project.id}/${img.image_id}_${img.filename}`}
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
                            aria-label="Delete"
                            icon={<Text>✕</Text>}
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
              <Box textAlign="center" py={8} color="gray.500">
                <Text>No images uploaded yet. Click above to upload.</Text>
              </Box>
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Container>
  );
}

export default ProjectDetail;
