import { useState, useEffect } from 'react';
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
  IconButton,
  Tag,
  TagLabel,
  Wrap,
  WrapItem,
  Collapse,
  useDisclosure,
} from '@chakra-ui/react';
import {
  ClipboardList,
  Globe,
  Target,
  Map,
  Link2,
  X,
  Eye,
  Footprints,
  Thermometer,
  Heart,
  Brain,
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
import EncodingInfoPopover from '../components/EncodingInfoPopover';
import { useEncodingSections } from '../hooks/useApi';
import type { EncodingEntry } from '../types';

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

// Icon override for performance-dimension cards. The names + definitions
// themselves come from the knowledge-base C_performance section.
const PRF_ICON_BY_CODE: Record<string, React.ElementType> = {
  PRF_AES: Eye,
  PRF_RST: Heart,
  PRF_EMO: Brain,
  PRF_THR: Thermometer,
  PRF_USE: Footprints,
  PRF_SOC: Users,
};

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

// FormLabel that pairs with an EncodingInfoPopover trigger.
function LabelWithInfo({
  children,
  title,
  entries,
  selectedCode,
}: {
  children: React.ReactNode;
  title: string;
  entries: EncodingEntry[];
  selectedCode?: string;
}) {
  return (
    <HStack mb={2} spacing={1} align="center">
      <FormLabel mb={0}>{children}</FormLabel>
      <EncodingInfoPopover title={title} entries={entries} selectedCode={selectedCode} />
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

// ============ Component ============

function ProjectWizard() {
  const { projectId } = useParams<{ projectId: string }>();
  const isEditMode = !!projectId;
  const navigate = useNavigate();
  const toast = useAppToast();
  const queryClient = useQueryClient();
  const { isOpen: isRelationsOpen, onToggle: toggleRelations } = useDisclosure();

  // Knowledge-base codebook (single source of truth for the 6 dropdown sections)
  const { data: encoding } = useEncodingSections();
  const koppenEntries: EncodingEntry[] = encoding?.K_climate ?? [];
  const countryEntries: EncodingEntry[] = encoding?.E_countries ?? [];
  const spaceTypeEntries: EncodingEntry[] = encoding?.E_settings ?? [];
  const lczEntries: EncodingEntry[] = encoding?.L_lcz ?? [];
  const ageEntries: EncodingEntry[] = encoding?.M_age_groups ?? [];
  const performanceEntries: EncodingEntry[] = encoding?.C_performance ?? [];
  const subdimensionEntries: EncodingEntry[] = encoding?.C_subdimensions ?? [];

  const findEntry = (entries: EncodingEntry[], code: string) =>
    entries.find((e) => e.code === code);

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
  const [selectedSubdimensions, setSelectedSubdimensions] = useState<string[]>([]);

  // Spatial Zones
  const [zones, setZones] = useState<SpatialZone[]>([]);
  const [zoneTypes] = useState(DEFAULT_ZONE_TYPES);

  // Spatial Relations
  const [relations, setRelations] = useState<SpatialRelation[]>([]);
  const [relationTypes] = useState(DEFAULT_RELATION_TYPES);

  // Saving
  const [saving, setSaving] = useState(false);

  // When a parent performance dimension is unchecked, drop any of its sub-dimensions
  // so we never persist orphan PRS_* codes whose PRF_* parent is not selected.
  useEffect(() => {
    setSelectedSubdimensions((prev) => {
      if (prev.length === 0) return prev;
      const allowedParents = new Set(selectedDimensions);
      const next = prev.filter((sd) => {
        const entry = subdimensionEntries.find((e) => e.code === sd);
        return entry?.parent_dim ? allowedParents.has(entry.parent_dim) : false;
      });
      return next.length === prev.length ? prev : next;
    });
  }, [selectedDimensions, subdimensionEntries]);

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
          setSelectedSubdimensions(project.subdimensions || []);

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
        subdimensions: selectedSubdimensions,
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

      } else {
        const response = await api.projects.create(projectData);
        savedProjectId = response.data.id;
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

  return (
    <PageShell isLoading={loading} loadingText="Loading project...">
      {/* Header */}
      <Box textAlign="center" mb={6}>
        <Heading size="lg">{isEditMode ? 'Edit Project' : 'Create New Project'}</Heading>
        <Text color="gray.600" mt={1} fontSize="sm">
          Define project context, performance goals, and spatial zones
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
                <LabelWithInfo
                  title="Köppen Climate Zones"
                  entries={koppenEntries}
                  selectedCode={koppenZone}
                >
                  Köppen Climate Zone
                </LabelWithInfo>
                <Select value={koppenZone} onChange={(e) => setKoppenZone(e.target.value)} placeholder="Select climate">
                  {koppenEntries.map(k => (
                    <option key={k.code} value={k.code}>{k.code} — {k.name}</option>
                  ))}
                </Select>
                {findEntry(koppenEntries, koppenZone)?.definition && (
                  <Text fontSize="xs" color="gray.500" mt={1} noOfLines={2}>
                    {findEntry(koppenEntries, koppenZone)!.definition}
                  </Text>
                )}
              </FormControl>
              <FormControl>
                <LabelWithInfo
                  title="Country / Region"
                  entries={countryEntries}
                  selectedCode={country}
                >
                  Country/Region
                </LabelWithInfo>
                <Select value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Select country">
                  {countryEntries.map(c => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </Select>
              </FormControl>
              <FormControl>
                <LabelWithInfo
                  title="Space Types (Setting)"
                  entries={spaceTypeEntries}
                  selectedCode={spaceType}
                >
                  Space Type
                </LabelWithInfo>
                <Select value={spaceType} onChange={(e) => setSpaceType(e.target.value)} placeholder="Select type">
                  {spaceTypeEntries.map(s => (
                    <option key={s.code} value={s.code}>{s.name}</option>
                  ))}
                </Select>
                {findEntry(spaceTypeEntries, spaceType)?.definition && (
                  <Text fontSize="xs" color="gray.500" mt={1} noOfLines={2}>
                    {findEntry(spaceTypeEntries, spaceType)!.definition}
                  </Text>
                )}
              </FormControl>
              <FormControl>
                <LabelWithInfo
                  title="Local Climate Zones (LCZ)"
                  entries={lczEntries}
                  selectedCode={lczType}
                >
                  Local Climate Zone (LCZ)
                </LabelWithInfo>
                <Select value={lczType} onChange={(e) => setLczType(e.target.value)} placeholder="Select LCZ">
                  {lczEntries.map(l => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </Select>
                {findEntry(lczEntries, lczType)?.definition && (
                  <Text fontSize="xs" color="gray.500" mt={1} noOfLines={2}>
                    {findEntry(lczEntries, lczType)!.definition}
                  </Text>
                )}
              </FormControl>
              <FormControl>
                <LabelWithInfo
                  title="Target User / Age Groups"
                  entries={ageEntries}
                  selectedCode={ageGroup}
                >
                  Target User Group
                </LabelWithInfo>
                <Select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} placeholder="Select group">
                  {ageEntries.map(a => (
                    <option key={a.code} value={a.code}>{a.name}</option>
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

            <HStack mb={2} spacing={1} align="center">
              <FormLabel mb={0}>Performance Dimensions</FormLabel>
              <EncodingInfoPopover
                title="Performance Dimensions"
                entries={performanceEntries}
              />
            </HStack>
            <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={3}>
              {performanceEntries.map(dim => {
                const DimIcon = PRF_ICON_BY_CODE[dim.code] ?? Target;
                const isSelected = selectedDimensions.includes(dim.code);
                return (
                  <Box
                    key={dim.code}
                    p={3}
                    borderWidth={2}
                    borderRadius="lg"
                    borderColor={isSelected ? 'blue.500' : 'gray.200'}
                    bg={isSelected ? 'blue.50' : 'white'}
                    cursor="pointer"
                    onClick={() => {
                      setSelectedDimensions(prev =>
                        prev.includes(dim.code)
                          ? prev.filter(d => d !== dim.code)
                          : [...prev, dim.code]
                      );
                    }}
                    _hover={{ borderColor: 'blue.300' }}
                    transition="all 0.15s"
                  >
                    <HStack align="flex-start">
                      <Checkbox
                        isChecked={isSelected}
                        onChange={() => {}}
                        pointerEvents="none"
                        mt={1}
                      />
                      <Box color="brand.600" flexShrink={0} mt={1}>
                        <DimIcon size={16} />
                      </Box>
                      <Box>
                        <Text fontWeight="bold" fontSize="sm">
                          {dim.name}
                        </Text>
                        <Text fontSize="xs" color="gray.500" noOfLines={3}>
                          {dim.definition}
                        </Text>
                      </Box>
                    </HStack>
                  </Box>
                );
              })}
            </SimpleGrid>

            {selectedDimensions.length > 0 && subdimensionEntries.length > 0 && (
              <Box mt={6}>
                <HStack mb={2} spacing={1} align="center">
                  <FormLabel mb={0}>Sub-dimensions (Optional)</FormLabel>
                  <EncodingInfoPopover
                    title="Sub-dimensions"
                    entries={subdimensionEntries}
                  />
                </HStack>
                <Text fontSize="xs" color="gray.500" mb={3}>
                  Refines evidence retrieval. Picking none falls back to dimension-level retrieval.
                </Text>
                {(() => {
                  const visible = subdimensionEntries.filter(
                    (sd) => sd.parent_dim && selectedDimensions.includes(sd.parent_dim)
                  );
                  if (visible.length === 0) return null;
                  const grouped = selectedDimensions
                    .map((dim) => ({
                      dim,
                      dimName: performanceEntries.find((p) => p.code === dim)?.name ?? dim,
                      items: visible.filter((sd) => sd.parent_dim === dim),
                    }))
                    .filter((g) => g.items.length > 0);
                  return (
                    <VStack align="stretch" spacing={3}>
                      {grouped.map(({ dim, dimName, items }) => (
                        <Box key={dim}>
                          <Text fontSize="xs" fontWeight="bold" color="gray.600" mb={1}>
                            {dimName}
                          </Text>
                          <Wrap spacing={2}>
                            {items.map((sd) => {
                              const checked = selectedSubdimensions.includes(sd.code);
                              return (
                                <WrapItem key={sd.code}>
                                  <Tag
                                    size="md"
                                    cursor="pointer"
                                    variant={checked ? 'solid' : 'outline'}
                                    colorScheme={checked ? 'blue' : 'gray'}
                                    onClick={() =>
                                      setSelectedSubdimensions((prev) =>
                                        prev.includes(sd.code)
                                          ? prev.filter((c) => c !== sd.code)
                                          : [...prev, sd.code]
                                      )
                                    }
                                    title={sd.definition || sd.name}
                                  >
                                    <TagLabel>{sd.name}</TagLabel>
                                  </Tag>
                                </WrapItem>
                              );
                            })}
                          </Wrap>
                        </Box>
                      ))}
                    </VStack>
                  );
                })()}
              </Box>
            )}
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

        {/* Action Buttons */}
        <HStack justify="space-between">
          <Button variant="outline" onClick={() => navigate('/projects')}>
            Cancel
          </Button>
          <Button colorScheme="blue" size="lg" onClick={handleSave} isLoading={saving}>
            {isEditMode ? 'Save & Continue' : 'Create & Continue'}
          </Button>
        </HStack>
      </VStack>
    </PageShell>
  );
}

export default ProjectWizard;
