import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Box,
  Heading,
  Button,
  VStack,
  HStack,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  Select,
  SimpleGrid,
  Card,
  CardHeader,
  CardBody,
  Text,
  Badge,
  Checkbox,
  /* useToast — replaced by useAppToast */
  IconButton,
  Tag,
  TagLabel,
  Wrap,
  WrapItem,
  Collapse,
  useDisclosure,
  Image,
} from '@chakra-ui/react';
import {
  ClipboardList,
  Globe,
  Target,
  Map,
  Link2,
  ImagePlus,
  X,
  Eye,
  Footprints,
  Thermometer,
  DollarSign,
  Leaf,
  Heart,
  Users,
  ChevronUp,
  ChevronDown,
  Plus,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import api from '../api';
import useAppToast from '../hooks/useAppToast';
import PageShell from '../components/PageShell';

// ============ Constants ============

const SITE_SCALES = [
  { value: 'XS', label: 'Extra Small (<0.5 hectare)' },
  { value: 'S', label: 'Small (0.5-2 hectares)' },
  { value: 'M', label: 'Medium (2-10 hectares)' },
  { value: 'L', label: 'Large (10-50 hectares)' },
  { value: 'XL', label: 'Extra Large (>50 hectares)' },
];

const PROJECT_PHASES = [
  { value: 'conceptual', label: 'Conceptual Design' },
  { value: 'schematic', label: 'Schematic Design' },
  { value: 'detailed', label: 'Detailed Design' },
  { value: 'renovation', label: 'Renovation/Improvement' },
  { value: 'evaluation', label: 'Post-occupancy Evaluation' },
];

const KOPPEN_ZONES = [
  { value: 'KPN_AF', label: 'KPN_AF — Tropical Rainforest (Af)' },
  { value: 'KPN_CFA', label: 'KPN_CFA — Humid Subtropical (Cfa)' },
  { value: 'KPN_CFB', label: 'KPN_CFB — Oceanic (Cfb)' },
  { value: 'KPN_CSB', label: 'KPN_CSB — Warm-Summer Mediterranean' },
  { value: 'KPN_CWA', label: 'KPN_CWA — Monsoon Humid Subtropical' },
  { value: 'KPN_DFA', label: 'KPN_DFA — Hot-summer Humid Continental' },
  { value: 'KPN_DFB', label: 'KPN_DFB — Warm-Summer Humid Continental' },
  { value: 'KPN_DWA', label: 'KPN_DWA — Monsoon Humid Continental' },
  { value: 'KPN_XX', label: 'KPN_XX — Unknown/Undefined' },
];

const COUNTRIES = [
  { value: 'CNT_CHN', label: 'China' },
  { value: 'CNT_DNK', label: 'Denmark' },
  { value: 'CNT_FIN', label: 'Finland' },
  { value: 'CNT_GBR', label: 'United Kingdom' },
  { value: 'CNT_HKG', label: 'Hong Kong' },
  { value: 'CNT_IND', label: 'India' },
  { value: 'CNT_ITA', label: 'Italy' },
  { value: 'CNT_JPN', label: 'Japan' },
  { value: 'CNT_KOR', label: 'South Korea' },
  { value: 'CNT_NLD', label: 'Netherlands' },
  { value: 'CNT_SGP', label: 'Singapore' },
  { value: 'CNT_TWN', label: 'Taiwan' },
  { value: 'CNT_USA', label: 'United States' },
  { value: 'CNT_GLO', label: 'Global' },
];

const SPACE_TYPES = [
  { value: 'SET_PRK', label: 'Park' },
  { value: 'SET_STR', label: 'Street' },
  { value: 'SET_RES', label: 'Residential' },
  { value: 'SET_COM', label: 'Commercial' },
  { value: 'SET_CAM', label: 'Campus' },
  { value: 'SET_CBD', label: 'Central Business District' },
  { value: 'SET_COU', label: 'Courtyard' },
  { value: 'SET_GWY', label: 'Greenway' },
  { value: 'SET_HIS', label: 'Historical Area' },
  { value: 'SET_POS', label: 'Public Open Space' },
  { value: 'SET_URB', label: 'Urban' },
];

const LCZ_TYPES = [
  { value: 'LCZ_1', label: 'LCZ 1 - Compact High-rise' },
  { value: 'LCZ_2', label: 'LCZ 2 - Compact Mid-rise' },
  { value: 'LCZ_3', label: 'LCZ 3 - Compact Low-rise' },
  { value: 'LCZ_4', label: 'LCZ 4 - Open High-rise' },
  { value: 'LCZ_6', label: 'LCZ 6 - Open Low-rise' },
  { value: 'LCZ_A', label: 'LCZ A - Dense Trees' },
  { value: 'LCZ_B', label: 'LCZ B - Scattered Trees' },
  { value: 'LCZ_URB', label: 'Urban/Built-up' },
];

const AGE_GROUPS = [
  { value: 'AGE_ALL', label: 'All Age Groups' },
  { value: 'AGE_ADL', label: 'Adults' },
  { value: 'AGE_ELD', label: 'Elderly' },
  { value: 'AGE_UNSPECIFIED', label: 'Unspecified' },
];

const PERFORMANCE_DIMENSIONS = [
  { id: 'PRF_AES', name: 'Visual-Spatial Quality', icon: Eye, desc: 'Aesthetic quality and spatial legibility' },
  { id: 'PRF_BEH', name: 'Use, Accessibility & Safety', icon: Footprints, desc: 'Use patterns, accessibility, safety' },
  { id: 'PRF_COM', name: 'Comfort', icon: Thermometer, desc: 'Thermal and composite comfort' },
  { id: 'PRF_ECO', name: 'Economic Value', icon: DollarSign, desc: 'Financial value and economic return' },
  { id: 'PRF_ENV', name: 'Environmental Quality', icon: Leaf, desc: 'Air quality and environmental measures' },
  { id: 'PRF_HLT', name: 'Health & Wellbeing', icon: Heart, desc: 'Physical and psychological health' },
  { id: 'PRF_SOC', name: 'Social Outcomes & Equity', icon: Users, desc: 'Social interaction and equity' },
];

const DEFAULT_ZONE_TYPES = [
  { id: 'entrance', name: 'Entrance/Gateway', def: 'Main entry points, gateways' },
  { id: 'plaza', name: 'Plaza/Square', def: 'Gathering plazas, open paved spaces' },
  { id: 'lawn', name: 'Lawn/Open Space', def: 'Open lawns, flexible activity fields' },
  { id: 'playground', name: 'Playground', def: 'Children play zones' },
  { id: 'fitness', name: 'Fitness/Sports', def: 'Sports courts, fitness routes' },
  { id: 'waterfront', name: 'Waterfront', def: 'Water-edge promenades' },
  { id: 'woodland', name: 'Woodland/Forest', def: 'Wooded areas, forest' },
  { id: 'garden', name: 'Garden/Planting', def: 'Gardens, planting beds' },
  { id: 'path', name: 'Path/Corridor', def: 'Main circulation corridors' },
  { id: 'rest', name: 'Rest/Seating', def: 'Rest nodes, seating areas' },
];

const DEFAULT_RELATION_TYPES = [
  { id: 'adjacent', name: 'Spatially Adjacent', color: '#2563eb', style: 'solid' },
  { id: 'path', name: 'Path Connection', color: '#10b981', style: 'solid' },
  { id: 'visual', name: 'Visual Connection', color: '#f59e0b', style: 'dashed' },
  { id: 'functional', name: 'Functional Link', color: '#ef4444', style: 'dotted' },
];

// ============ Section Title ============

function SectionTitle({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) {
  return (
    <HStack>
      <Box p={2} borderRadius="lg" bg="brand.50">
        <Icon size={20} color="var(--chakra-colors-brand-600)" />
      </Box>
      <Box>
        <Heading size="md">{title}</Heading>
        <Text fontSize="sm" color="gray.500">{subtitle}</Text>
      </Box>
    </HStack>
  );
}

// ============ Types ============

interface SpatialZone {
  id: string;
  name: string;
  types: string[];
  area?: number;
  status?: string;
  description?: string;
}

interface SpatialRelation {
  id: string;
  fromZone: string;
  toZone: string;
  relationType: string;
  direction: 'single' | 'double';
}

interface UploadedImage {
  id: string;
  name: string;
  url: string;
  file: File;
  zoneId: string | null;
}

// ============ Component ============

function ProjectWizard() {
  const { projectId } = useParams<{ projectId: string }>();
  const isEditMode = !!projectId;
  const navigate = useNavigate();
  const toast = useAppToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isOpen: isRelationsOpen, onToggle: toggleRelations } = useDisclosure();

  // Loading state for edit mode
  const [loading, setLoading] = useState(isEditMode);

  // Project Info
  const [projectName, setProjectName] = useState('');
  const [projectLocation, setProjectLocation] = useState('');
  const [siteScale, setSiteScale] = useState('');
  const [projectPhase, setProjectPhase] = useState('');

  // Site Context
  const [koppenZone, setKoppenZone] = useState('');
  const [country, setCountry] = useState('');
  const [spaceType, setSpaceType] = useState('');
  const [lczType, setLczType] = useState('');
  const [ageGroup, setAgeGroup] = useState('');

  // Performance Goals
  const [designBrief, setDesignBrief] = useState('');
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);

  // Spatial Zones
  const [zones, setZones] = useState<SpatialZone[]>([]);
  const [zoneTypes] = useState(DEFAULT_ZONE_TYPES);

  // Spatial Relations
  const [relations, setRelations] = useState<SpatialRelation[]>([]);
  const [relationTypes] = useState(DEFAULT_RELATION_TYPES);

  // Images - new images to upload (File objects)
  const [images, setImages] = useState<UploadedImage[]>([]);
  // Existing images from server (when editing)
  const [existingImages, setExistingImages] = useState<Array<{
    image_id: string;
    filename: string;
    filepath: string;
    zone_id: string | null;
  }>>([]);
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [draggedExistingImageId, setDraggedExistingImageId] = useState<string | null>(null);
  const originalZoneMap = useRef<Record<string, string | null>>({});

  // Saving
  const [saving, setSaving] = useState(false);

  // Load existing project data in edit mode
  useEffect(() => {
    if (isEditMode && projectId) {
      setLoading(true);
      api.projects.get(projectId)
        .then((res) => {
          const project = res.data;
          setProjectName(project.project_name);
          setProjectLocation(project.project_location || '');
          setSiteScale(project.site_scale || '');
          setProjectPhase(project.project_phase || '');
          setKoppenZone(project.koppen_zone_id || '');
          setCountry(project.country_id || '');
          setSpaceType(project.space_type_id || '');
          setLczType(project.lcz_type_id || '');
          setAgeGroup(project.age_group_id || '');
          setDesignBrief(project.design_brief || '');
          setSelectedDimensions(project.performance_dimensions || []);

          const loadedZones: SpatialZone[] = (project.spatial_zones || []).map((z: { zone_id: string; zone_name: string; zone_types?: string[]; area?: number; status?: string; description?: string }) => ({
            id: z.zone_id,
            name: z.zone_name,
            types: z.zone_types || [],
            area: z.area,
            status: z.status || 'existing',
            description: z.description || '',
          }));
          setZones(loadedZones);

          const loadedRelations: SpatialRelation[] = (project.spatial_relations || []).map((r: { from_zone: string; to_zone: string; relation_type: string; direction?: string }, idx: number) => ({
            id: `rel_${idx}`,
            fromZone: r.from_zone,
            toZone: r.to_zone,
            relationType: r.relation_type,
            direction: (r.direction as 'single' | 'double') || 'single',
          }));
          setRelations(loadedRelations);

          const imgs = project.uploaded_images || [];
          setExistingImages(imgs);
          const zoneMap: Record<string, string | null> = {};
          for (const img of imgs) {
            zoneMap[img.image_id] = img.zone_id ?? null;
          }
          originalZoneMap.current = zoneMap;
        })
        .catch((error) => {
          console.error('Failed to load project:', error);
          toast({ title: 'Failed to load project', status: 'error' });
          navigate('/projects');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isEditMode, projectId, navigate, toast]);

  // ============ Zone Functions ============

  const addZone = () => {
    const newZone: SpatialZone = {
      id: `zone_${Date.now()}`,
      name: '',
      types: [],
      status: 'existing',
    };
    setZones([...zones, newZone]);
  };

  const updateZone = (id: string, updates: Partial<SpatialZone>) => {
    setZones(zones.map(z => z.id === id ? { ...z, ...updates } : z));
  };

  const removeZone = (id: string) => {
    setZones(prev => prev.filter(z => z.id !== id));
    setRelations(prev => prev.filter(r => r.fromZone !== id && r.toZone !== id));
    setImages(prev => prev.map(img => img.zoneId === id ? { ...img, zoneId: null } : img));
  };

  const toggleZoneType = (zoneId: string, typeId: string) => {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;

    const newTypes = zone.types.includes(typeId)
      ? zone.types.filter(t => t !== typeId)
      : [...zone.types, typeId];

    updateZone(zoneId, { types: newTypes });
  };

  // ============ Relation Functions ============

  const addRelation = (fromZone: string, toZone: string, relationType: string, direction: 'single' | 'double') => {
    const exists = relations.some(r =>
      r.fromZone === fromZone && r.toZone === toZone && r.relationType === relationType
    );
    if (exists) return;

    const newRelation: SpatialRelation = {
      id: `rel_${Date.now()}`,
      fromZone,
      toZone,
      relationType,
      direction,
    };
    setRelations([...relations, newRelation]);
  };

  const removeRelation = (id: string) => {
    setRelations(relations.filter(r => r.id !== id));
  };

  // ============ Image Functions ============

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: UploadedImage[] = Array.from(files).map(file => ({
      id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      url: URL.createObjectURL(file),
      file,
      zoneId: null,
    }));

    setImages([...images, ...newImages]);
    toast({
      title: `${files.length} image(s) uploaded`,
      status: 'success',
      duration: 2000,
    });
  };

  const handleDrop = useCallback((e: React.DragEvent, targetZoneId: string | null) => {
    e.preventDefault();
    if (!draggedImageId) return;

    setImages(prev => prev.map(img =>
      img.id === draggedImageId ? { ...img, zoneId: targetZoneId } : img
    ));
    setDraggedImageId(null);
  }, [draggedImageId]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeImage = (id: string) => {
    const img = images.find(i => i.id === id);
    if (img) URL.revokeObjectURL(img.url);
    setImages(images.filter(i => i.id !== id));
  };

  // ============ Save Function ============

  const handleSave = async () => {
    if (!projectName.trim()) {
      toast({ title: 'Project name is required', status: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const projectData = {
        project_name: projectName,
        project_location: projectLocation,
        site_scale: siteScale,
        project_phase: projectPhase,
        koppen_zone_id: koppenZone,
        country_id: country,
        space_type_id: spaceType,
        lcz_type_id: lczType,
        age_group_id: ageGroup,
        design_brief: designBrief,
        performance_dimensions: selectedDimensions,
        spatial_zones: zones.map(z => ({
          zone_id: z.id,
          zone_name: z.name,
          zone_types: z.types,
          area: z.area,
          status: z.status,
          description: z.description,
        })),
        spatial_relations: relations.map(r => ({
          from_zone: r.fromZone,
          to_zone: r.toZone,
          relation_type: r.relationType,
          direction: r.direction,
        })),
      };

      let savedProjectId: string;

      if (isEditMode && projectId) {
        await api.projects.update(projectId, projectData);
        savedProjectId = projectId;

        const changedAssignments = existingImages
          .filter(img => (img.zone_id ?? null) !== (originalZoneMap.current[img.image_id] ?? null))
          .map(img => ({ image_id: img.image_id, zone_id: img.zone_id }));
        if (changedAssignments.length > 0) {
          await api.projects.batchAssignZones(projectId, changedAssignments);
        }
      } else {
        const response = await api.projects.create(projectData);
        savedProjectId = response.data.id;
      }

      if (images.length > 0) {
        const imagesByZone: Record<string, File[]> = {};

        for (const img of images) {
          const zoneKey = img.zoneId || '__ungrouped__';
          if (!imagesByZone[zoneKey]) {
            imagesByZone[zoneKey] = [];
          }
          imagesByZone[zoneKey].push(img.file);
        }

        for (const [zoneKey, files] of Object.entries(imagesByZone)) {
          const zoneId = zoneKey === '__ungrouped__' ? undefined : zoneKey;
          await api.projects.uploadImages(savedProjectId, files, zoneId);
        }
      }

      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project', savedProjectId] });

      toast({
        title: isEditMode ? 'Project updated successfully' : 'Project created successfully',
        status: 'success',
      });

      navigate(`/projects/${savedProjectId}`);
    } catch {
      toast({
        title: isEditMode ? 'Failed to update project' : 'Failed to create project',
        status: 'error',
      });
    }
    setSaving(false);
  };

  // ============ Render Helpers ============

  const ungroupedImages = images.filter(img => !img.zoneId);
  const getZoneImages = (zoneId: string) => images.filter(img => img.zoneId === zoneId);

  const ungroupedExistingImages = existingImages.filter(img => !img.zone_id);
  const getZoneExistingImages = (zoneId: string) => existingImages.filter(img => img.zone_id === zoneId);

  const handleExistingImageDrop = useCallback((e: React.DragEvent, targetZoneId: string | null) => {
    e.preventDefault();
    if (!draggedExistingImageId) return;

    setExistingImages(prev => prev.map(img =>
      img.image_id === draggedExistingImageId ? { ...img, zone_id: targetZoneId } : img
    ));
    setDraggedExistingImageId(null);
  }, [draggedExistingImageId]);

  const handleDeleteExistingImage = async (imageId: string) => {
    if (!projectId) return;
    try {
      await api.projects.deleteImage(projectId, imageId);
      setExistingImages(prev => prev.filter(img => img.image_id !== imageId));
      toast({ title: 'Image deleted', status: 'success' });
    } catch {
      toast({ title: 'Failed to delete image', status: 'error' });
    }
  };

  return (
    <PageShell isLoading={loading} loadingText="Loading project...">
      {/* Header */}
      <Box textAlign="center" mb={8}>
        <Heading size="lg">{isEditMode ? 'Edit Project' : 'Create New Project'}</Heading>
        <Text color="gray.600" mt={2}>
          {isEditMode ? 'Update project details, zones, and images' : 'Define project context, performance goals, and spatial zones'}
        </Text>
      </Box>

      <VStack spacing={6} align="stretch">
        {/* Section 1: Project Information */}
        <Card>
          <CardHeader>
            <SectionTitle icon={ClipboardList} title="Project Information" subtitle="Basic project details" />
          </CardHeader>
          <CardBody>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <FormControl isRequired>
                <FormLabel>Project Name</FormLabel>
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g., Central Park Renovation"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Project Location</FormLabel>
                <Input
                  value={projectLocation}
                  onChange={(e) => setProjectLocation(e.target.value)}
                  placeholder="e.g., Shenzhen, China"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Site Scale</FormLabel>
                <Select value={siteScale} onChange={(e) => setSiteScale(e.target.value)} placeholder="Select scale">
                  {SITE_SCALES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Project Phase</FormLabel>
                <Select value={projectPhase} onChange={(e) => setProjectPhase(e.target.value)} placeholder="Select phase">
                  {PROJECT_PHASES.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </Select>
              </FormControl>
            </SimpleGrid>
          </CardBody>
        </Card>

        {/* Section 2: Site Context */}
        <Card>
          <CardHeader>
            <SectionTitle icon={Globe} title="Site Context" subtitle="Climate, setting, and user context" />
          </CardHeader>
          <CardBody>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <FormControl>
                <FormLabel>Köppen Climate Zone</FormLabel>
                <Select value={koppenZone} onChange={(e) => setKoppenZone(e.target.value)} placeholder="Select climate">
                  {KOPPEN_ZONES.map(k => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Country/Region</FormLabel>
                <Select value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Select country">
                  {COUNTRIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Space Type</FormLabel>
                <Select value={spaceType} onChange={(e) => setSpaceType(e.target.value)} placeholder="Select type">
                  {SPACE_TYPES.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Local Climate Zone (LCZ)</FormLabel>
                <Select value={lczType} onChange={(e) => setLczType(e.target.value)} placeholder="Select LCZ">
                  {LCZ_TYPES.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Target User Group</FormLabel>
                <Select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} placeholder="Select group">
                  {AGE_GROUPS.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </Select>
              </FormControl>
            </SimpleGrid>
          </CardBody>
        </Card>

        {/* Section 3: Performance Goals */}
        <Card>
          <CardHeader>
            <SectionTitle icon={Target} title="Performance Goals" subtitle="Select target performance dimensions" />
          </CardHeader>
          <CardBody>
            <FormControl mb={4}>
              <FormLabel>Design Brief</FormLabel>
              <Textarea
                value={designBrief}
                onChange={(e) => setDesignBrief(e.target.value)}
                placeholder="Describe the performance objectives, constraints, and expected outcomes..."
                rows={3}
              />
            </FormControl>

            <FormLabel mb={2}>Performance Dimensions</FormLabel>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={3}>
              {PERFORMANCE_DIMENSIONS.map(dim => {
                const DimIcon = dim.icon;
                return (
                  <Box
                    key={dim.id}
                    p={3}
                    borderWidth={2}
                    borderRadius="lg"
                    borderColor={selectedDimensions.includes(dim.id) ? 'blue.500' : 'gray.200'}
                    bg={selectedDimensions.includes(dim.id) ? 'blue.50' : 'white'}
                    cursor="pointer"
                    onClick={() => {
                      setSelectedDimensions(prev =>
                        prev.includes(dim.id)
                          ? prev.filter(d => d !== dim.id)
                          : [...prev, dim.id]
                      );
                    }}
                    _hover={{ borderColor: 'blue.300' }}
                    transition="all 0.15s"
                  >
                    <HStack>
                      <Checkbox
                        isChecked={selectedDimensions.includes(dim.id)}
                        onChange={() => {}}
                        pointerEvents="none"
                      />
                      <Box color="brand.600" flexShrink={0}>
                        <DimIcon size={16} />
                      </Box>
                      <Box>
                        <Text fontWeight="bold" fontSize="sm">
                          {dim.name}
                        </Text>
                        <Text fontSize="xs" color="gray.500">{dim.desc}</Text>
                      </Box>
                    </HStack>
                  </Box>
                );
              })}
            </SimpleGrid>
          </CardBody>
        </Card>

        {/* Section 4: Spatial Zones */}
        <Card>
          <CardHeader>
            <HStack justify="space-between">
              <SectionTitle icon={Map} title="Spatial Zones" subtitle="Define analysis zones and their characteristics" />
              <Button colorScheme="blue" size="sm" onClick={addZone} leftIcon={<Plus size={14} />}>
                Add Zone
              </Button>
            </HStack>
          </CardHeader>
          <CardBody>
            {zones.length === 0 ? (
              <Box textAlign="center" py={8} color="gray.500">
                <Text>No zones defined yet. Click "Add Zone" to create your first zone.</Text>
              </Box>
            ) : (
              <VStack spacing={4} align="stretch">
                {zones.map((zone) => (
                  <Box
                    key={zone.id}
                    p={4}
                    borderWidth={1}
                    borderRadius="lg"
                    bg="gray.50"
                  >
                    <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={3}>
                      <FormControl>
                        <FormLabel fontSize="sm">Zone Name</FormLabel>
                        <Input
                          size="sm"
                          value={zone.name}
                          onChange={(e) => updateZone(zone.id, { name: e.target.value })}
                          placeholder="e.g., Entrance Plaza"
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="sm">Area (m²)</FormLabel>
                        <Input
                          size="sm"
                          type="number"
                          value={zone.area || ''}
                          onChange={(e) => updateZone(zone.id, { area: parseFloat(e.target.value) || undefined })}
                          placeholder="Optional"
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel fontSize="sm">Status</FormLabel>
                        <Select
                          size="sm"
                          value={zone.status || ''}
                          onChange={(e) => updateZone(zone.id, { status: e.target.value })}
                        >
                          <option value="existing">Existing</option>
                          <option value="planned">Planned</option>
                          <option value="renovation">Renovation</option>
                        </Select>
                      </FormControl>
                    </SimpleGrid>

                    <FormControl mb={3}>
                      <FormLabel fontSize="sm">Zone Types</FormLabel>
                      <Wrap>
                        {zoneTypes.map(type => (
                          <WrapItem key={type.id}>
                            <Tag
                              size="md"
                              variant={zone.types.includes(type.id) ? 'solid' : 'outline'}
                              colorScheme={zone.types.includes(type.id) ? 'blue' : 'gray'}
                              cursor="pointer"
                              onClick={() => toggleZoneType(zone.id, type.id)}
                            >
                              <TagLabel>{type.name}</TagLabel>
                            </Tag>
                          </WrapItem>
                        ))}
                      </Wrap>
                    </FormControl>

                    <HStack justify="space-between">
                      <FormControl flex={1}>
                        <Input
                          size="sm"
                          value={zone.description || ''}
                          onChange={(e) => updateZone(zone.id, { description: e.target.value })}
                          placeholder="Description or current issues..."
                        />
                      </FormControl>
                      <Button
                        size="sm"
                        colorScheme="red"
                        variant="ghost"
                        onClick={() => removeZone(zone.id)}
                      >
                        Remove
                      </Button>
                    </HStack>
                  </Box>
                ))}
              </VStack>
            )}
          </CardBody>
        </Card>

        {/* Section 5: Spatial Relations (Collapsible) */}
        <Card>
          <CardHeader cursor="pointer" onClick={toggleRelations}>
            <HStack justify="space-between">
              <SectionTitle icon={Link2} title="Spatial Relations (Optional)" subtitle="Define connections between zones" />
              <Box color="gray.400">
                {isRelationsOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </Box>
            </HStack>
          </CardHeader>
          <Collapse in={isRelationsOpen}>
            <CardBody>
              {zones.length < 2 ? (
                <Box textAlign="center" py={4} color="gray.500">
                  <Text>Define at least 2 zones to create relations.</Text>
                </Box>
              ) : (
                <VStack spacing={4} align="stretch">
                  <SimpleGrid columns={{ base: 1, md: 4 }} spacing={3} p={4} bg="gray.50" borderRadius="lg">
                    <FormControl>
                      <FormLabel fontSize="sm">From Zone</FormLabel>
                      <Select size="sm" id="rel-from" placeholder="Select zone">
                        {zones.map(z => (
                          <option key={z.id} value={z.id}>{z.name || z.id}</option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl>
                      <FormLabel fontSize="sm">To Zone</FormLabel>
                      <Select size="sm" id="rel-to" placeholder="Select zone">
                        {zones.map(z => (
                          <option key={z.id} value={z.id}>{z.name || z.id}</option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl>
                      <FormLabel fontSize="sm">Relation Type</FormLabel>
                      <Select size="sm" id="rel-type" placeholder="Select type">
                        {relationTypes.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl>
                      <FormLabel fontSize="sm">&nbsp;</FormLabel>
                      <Button
                        size="sm"
                        colorScheme="blue"
                        w="full"
                        onClick={() => {
                          const from = (document.getElementById('rel-from') as HTMLSelectElement).value;
                          const to = (document.getElementById('rel-to') as HTMLSelectElement).value;
                          const type = (document.getElementById('rel-type') as HTMLSelectElement).value;
                          if (from && to && type && from !== to) {
                            addRelation(from, to, type, 'single');
                          }
                        }}
                      >
                        Add Relation
                      </Button>
                    </FormControl>
                  </SimpleGrid>

                  {relations.length > 0 && (
                    <Box>
                      <Text fontWeight="bold" mb={2}>Relations ({relations.length})</Text>
                      <VStack spacing={2} align="stretch">
                        {relations.map(rel => {
                          const fromZone = zones.find(z => z.id === rel.fromZone);
                          const toZone = zones.find(z => z.id === rel.toZone);
                          const relType = relationTypes.find(r => r.id === rel.relationType);
                          return (
                            <HStack
                              key={rel.id}
                              p={2}
                              bg="white"
                              borderWidth={1}
                              borderRadius="md"
                              justify="space-between"
                            >
                              <HStack>
                                <Badge>{fromZone?.name || rel.fromZone}</Badge>
                                <Text color={relType?.color}>&rarr;</Text>
                                <Badge>{toZone?.name || rel.toZone}</Badge>
                                <Tag size="sm" colorScheme="blue">{relType?.name}</Tag>
                              </HStack>
                              <IconButton
                                aria-label="Remove relation"
                                icon={<X size={12} />}
                                size="xs"
                                colorScheme="red"
                                variant="ghost"
                                onClick={() => removeRelation(rel.id)}
                              />
                            </HStack>
                          );
                        })}
                      </VStack>
                    </Box>
                  )}
                </VStack>
              )}
            </CardBody>
          </Collapse>
        </Card>

        {/* Section 6: Image Upload */}
        <Card>
          <CardHeader>
            <SectionTitle icon={ImagePlus} title="Image Upload & Grouping" subtitle="Upload site photos and group them by zones" />
          </CardHeader>
          <CardBody>
            {/* Upload Area */}
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
              <Box color="gray.400" mb={2} display="flex" justifyContent="center">
                <ImagePlus size={32} />
              </Box>
              <Text fontWeight="bold">Drag images here or click to select</Text>
              <Text fontSize="sm" color="gray.500">Supports batch upload - JPG/PNG</Text>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </Box>

            {/* Stats */}
            <SimpleGrid columns={3} spacing={4} mt={4}>
              <Box textAlign="center" p={3} bg="white" borderWidth={1} borderRadius="lg">
                <Text fontSize="2xl" fontWeight="bold">{images.length + existingImages.length}</Text>
                <Text fontSize="sm" color="gray.500">Total Images</Text>
              </Box>
              <Box textAlign="center" p={3} bg="white" borderWidth={1} borderRadius="lg">
                <Text fontSize="2xl" fontWeight="bold">{images.filter(i => i.zoneId).length + existingImages.filter(i => i.zone_id).length}</Text>
                <Text fontSize="sm" color="gray.500">Grouped</Text>
              </Box>
              <Box textAlign="center" p={3} bg="white" borderWidth={1} borderRadius="lg">
                <Text fontSize="2xl" fontWeight="bold">{zones.length}</Text>
                <Text fontSize="sm" color="gray.500">Zones</Text>
              </Box>
            </SimpleGrid>

            {/* Ungrouped Images (both new and existing) */}
            {(ungroupedImages.length > 0 || ungroupedExistingImages.length > 0) && (
              <Box mt={4}>
                <Text fontWeight="bold" mb={2}>Ungrouped Images ({ungroupedImages.length + ungroupedExistingImages.length})</Text>
                <Box
                  p={3}
                  borderWidth={2}
                  borderStyle="dashed"
                  borderColor="gray.200"
                  borderRadius="lg"
                  minH="100px"
                  onDragOver={handleDragOver}
                  onDrop={(e) => {
                    handleDrop(e, null);
                    handleExistingImageDrop(e, null);
                  }}
                >
                  <SimpleGrid columns={{ base: 4, md: 8 }} spacing={2}>
                    {ungroupedExistingImages.map(img => (
                      <Box
                        key={img.image_id}
                        position="relative"
                        borderRadius="md"
                        overflow="hidden"
                        cursor="grab"
                        draggable
                        onDragStart={() => setDraggedExistingImageId(img.image_id)}
                        onDragEnd={() => setDraggedExistingImageId(null)}
                        opacity={draggedExistingImageId === img.image_id ? 0.5 : 1}
                        border="2px solid"
                        borderColor="blue.200"
                      >
                        <Image
                          src={`/api/uploads/${projectId}/${img.image_id}_${img.filename}`}
                          alt={img.filename}
                          h="60px"
                          w="100%"
                          objectFit="cover"
                          fallback={<Box h="60px" bg="gray.200" display="flex" alignItems="center" justifyContent="center"><Text fontSize="xs">img</Text></Box>}
                        />
                        <IconButton
                          aria-label="Remove"
                          icon={<X size={10} />}
                          size="xs"
                          position="absolute"
                          top={1}
                          right={1}
                          colorScheme="red"
                          onClick={(e) => { e.stopPropagation(); handleDeleteExistingImage(img.image_id); }}
                        />
                      </Box>
                    ))}
                    {ungroupedImages.map(img => (
                      <Box
                        key={img.id}
                        position="relative"
                        borderRadius="md"
                        overflow="hidden"
                        cursor="grab"
                        draggable
                        onDragStart={() => setDraggedImageId(img.id)}
                        onDragEnd={() => setDraggedImageId(null)}
                        opacity={draggedImageId === img.id ? 0.5 : 1}
                      >
                        <Image src={img.url} alt={img.name} h="60px" w="100%" objectFit="cover" />
                        <IconButton
                          aria-label="Remove"
                          icon={<X size={10} />}
                          size="xs"
                          position="absolute"
                          top={1}
                          right={1}
                          onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                        />
                      </Box>
                    ))}
                  </SimpleGrid>
                </Box>
              </Box>
            )}

            {/* Zone Groups */}
            {zones.length > 0 && (
              <Box mt={4}>
                <Text fontWeight="bold" mb={2}>Zone Groups (Drag images here)</Text>
                <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                  {zones.map(zone => {
                    const zoneImages = getZoneImages(zone.id);
                    const zoneExistingImages = getZoneExistingImages(zone.id);
                    const totalZoneImages = zoneImages.length + zoneExistingImages.length;
                    const isDragging = draggedImageId || draggedExistingImageId;
                    return (
                      <Box
                        key={zone.id}
                        p={3}
                        borderWidth={2}
                        borderStyle="dashed"
                        borderColor={isDragging ? 'brand.300' : 'gray.200'}
                        borderRadius="lg"
                        bg={isDragging ? 'brand.50' : 'white'}
                        minH="120px"
                        transition="all 0.2s ease"
                        onDragOver={handleDragOver}
                        onDrop={(e) => {
                          handleDrop(e, zone.id);
                          handleExistingImageDrop(e, zone.id);
                        }}
                      >
                        <HStack justify="space-between" mb={2}>
                          <Text fontWeight="bold" fontSize="sm">{zone.name || 'Unnamed Zone'}</Text>
                          <Badge>{totalZoneImages}</Badge>
                        </HStack>
                        {totalZoneImages > 0 ? (
                          <SimpleGrid columns={4} spacing={1}>
                            {zoneExistingImages.map(img => (
                              <Box
                                key={img.image_id}
                                position="relative"
                                borderRadius="sm"
                                overflow="hidden"
                                cursor="grab"
                                draggable
                                onDragStart={() => setDraggedExistingImageId(img.image_id)}
                                onDragEnd={() => setDraggedExistingImageId(null)}
                                border="2px solid"
                                borderColor="blue.200"
                              >
                                <Image
                                  src={`/api/uploads/${projectId}/${img.image_id}_${img.filename}`}
                                  alt={img.filename}
                                  h="40px"
                                  w="100%"
                                  objectFit="cover"
                                  fallback={<Box h="40px" bg="gray.200" />}
                                />
                              </Box>
                            ))}
                            {zoneImages.map(img => (
                              <Box
                                key={img.id}
                                position="relative"
                                borderRadius="sm"
                                overflow="hidden"
                                cursor="grab"
                                draggable
                                onDragStart={() => setDraggedImageId(img.id)}
                                onDragEnd={() => setDraggedImageId(null)}
                              >
                                <Image src={img.url} alt={img.name} h="40px" w="100%" objectFit="cover" />
                              </Box>
                            ))}
                          </SimpleGrid>
                        ) : (
                          <Text fontSize="sm" color="gray.400" textAlign="center" py={4}>
                            Drop images here
                          </Text>
                        )}
                      </Box>
                    );
                  })}
                </SimpleGrid>
              </Box>
            )}
          </CardBody>
        </Card>

        {/* Action Buttons */}
        <HStack justify="center" spacing={4}>
          <Button variant="outline" onClick={() => navigate('/projects')}>
            Cancel
          </Button>
          <Button colorScheme="blue" size="lg" onClick={handleSave} isLoading={saving}>
            {isEditMode ? 'Save Changes' : 'Create Project'}
          </Button>
        </HStack>
      </VStack>
    </PageShell>
  );
}

export default ProjectWizard;
