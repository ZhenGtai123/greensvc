import {
  Box,
  Button,
  Flex,
  Heading,
  HStack,
  SimpleGrid,
  Skeleton,
  CardBody,
  Badge,
  Text,
  VStack,
  Circle,
  Divider,
} from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { FolderPlus, FolderKanban, Image, Calculator, BookOpen } from 'lucide-react';
import { useHealth, useCalculators, useKnowledgeBaseSummary, useProjects } from '../hooks/useApi';
import type { Project } from '../types';
import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import AnimatedCard from '../components/AnimatedCard';

// ---------------------------------------------------------------------------
// Stat card — small card with a single metric
// ---------------------------------------------------------------------------
function StatCard({ label, value, isLoading, icon: Icon }: { label: string; value: number; isLoading: boolean; icon: React.ElementType }) {
  return (
    <AnimatedCard>
      <CardBody py={3} px={4}>
        <Flex align="center" gap={3}>
          <Box
            w="3px"
            alignSelf="stretch"
            borderRadius="full"
            bg="brand.400"
          />
          <Box color="brand.500" flexShrink={0}>
            <Icon size={20} />
          </Box>
          <Box>
            {isLoading ? (
              <Skeleton h="24px" w="32px" mb={1} />
            ) : (
              <Text fontWeight="bold" fontSize="xl" color="brand.600">
                {value}
              </Text>
            )}
            <Text fontSize="xs" color="gray.500">{label}</Text>
          </Box>
        </Flex>
      </CardBody>
    </AnimatedCard>
  );
}

// ---------------------------------------------------------------------------
// Pipeline dots
// ---------------------------------------------------------------------------
const PIPELINE_STAGES = ['Vision', 'Indicators', 'Analysis', 'Reports'] as const;

function PipelineDots({ project }: { project: Project }) {
  const hasMasks = project.uploaded_images?.some(
    (img) => img.mask_filepaths && Object.keys(img.mask_filepaths).length > 0,
  );
  const hasIndicators = (project.performance_dimensions?.length ?? 0) > 0;
  const hasMetrics = project.uploaded_images?.some(
    (img) => img.metrics_results && Object.keys(img.metrics_results).length > 0,
  );
  const completed = [!!hasMasks, hasIndicators, !!hasMetrics, false];

  return (
    <HStack spacing={1}>
      {PIPELINE_STAGES.map((stage, i) => (
        <Circle
          key={stage}
          size="7px"
          bg={completed[i] ? 'brand.400' : 'gray.200'}
          title={`${stage}: ${completed[i] ? 'done' : 'pending'}`}
        />
      ))}
    </HStack>
  );
}

// ---------------------------------------------------------------------------
// Project card
// ---------------------------------------------------------------------------
function ProjectCard({ project, index }: { project: Project; index: number }) {
  const zoneCount = project.spatial_zones?.length ?? 0;
  const imageCount = project.uploaded_images?.length ?? 0;
  const assignedCount = project.uploaded_images?.filter((img) => img.zone_id).length ?? 0;

  return (
    <Box as={Link} to={`/projects/${project.id}`} textDecoration="none" display="block">
      <AnimatedCard hoverable delay={index * 0.05}>
        <CardBody>
          <VStack align="stretch" spacing={3}>
          <Flex justify="space-between" align="start">
            <Box flex={1} minW={0}>
              <Heading size="sm" noOfLines={1}>{project.project_name}</Heading>
              {project.project_location && (
                <Text fontSize="xs" color="gray.500" noOfLines={1} mt={0.5}>
                  {project.project_location}
                </Text>
              )}
            </Box>
            {project.project_phase && (
              <Badge
                colorScheme={project.project_phase === 'design' ? 'blue' : 'orange'}
                fontSize="2xs"
                ml={2}
                flexShrink={0}
              >
                {project.project_phase}
              </Badge>
            )}
          </Flex>

          <Divider />

          <HStack spacing={4} fontSize="sm" color="gray.600">
            <HStack spacing={1}>
              <Text fontWeight="semibold" color="blue.600">{zoneCount}</Text>
              <Text>zones</Text>
            </HStack>
            <HStack spacing={1}>
              <Text fontWeight="semibold" color="purple.600">{imageCount}</Text>
              <Text>images</Text>
            </HStack>
            {imageCount > 0 && (
              <HStack spacing={1}>
                <Text fontWeight="semibold" color="brand.600">{assignedCount}</Text>
                <Text>assigned</Text>
              </HStack>
            )}
          </HStack>

          <Flex justify="space-between" align="center">
            <PipelineDots project={project} />
            <Text fontSize="2xs" color="gray.400">
              {new Date(project.created_at).toLocaleDateString()}
            </Text>
          </Flex>
          </VStack>
        </CardBody>
      </AnimatedCard>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Skeleton card
// ---------------------------------------------------------------------------
function ProjectCardSkeleton() {
  return (
    <AnimatedCard>
      <CardBody>
        <VStack align="stretch" spacing={3}>
          <Skeleton h="18px" w="70%" />
          <Skeleton h="12px" w="40%" />
          <Divider />
          <HStack spacing={4}>
            <Skeleton h="14px" w="50px" />
            <Skeleton h="14px" w="60px" />
          </HStack>
          <Flex justify="space-between">
            <HStack spacing={1}>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} h="7px" w="7px" borderRadius="full" />
              ))}
            </HStack>
            <Skeleton h="10px" w="70px" />
          </Flex>
        </VStack>
      </CardBody>
    </AnimatedCard>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
function Dashboard() {
  const { data: health } = useHealth();
  const { data: calculators, isLoading: calcsLoading } = useCalculators();
  const { data: knowledgeBase, isLoading: kbLoading } = useKnowledgeBaseSummary();
  const { data: projects, isLoading: projectsLoading } = useProjects();

  const totalImages = projects?.reduce(
    (sum, p) => sum + (p.uploaded_images?.length ?? 0), 0,
  ) ?? 0;

  const apiOk = health?.status === 'healthy';

  return (
    <PageShell>
      <PageHeader title="Dashboard">
        <HStack spacing={2}>
          <Circle size="8px" bg={apiOk ? 'green.400' : 'red.400'} />
          <Text fontSize="xs" color="gray.500">
            {apiOk ? 'All systems operational' : 'API unreachable'}
          </Text>
        </HStack>
        {projects && projects.length > 0 && (
          <Button as={Link} to="/projects/new" colorScheme="green" size="sm">
            New Project
          </Button>
        )}
      </PageHeader>

      {/* Stats row */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={8}>
        <StatCard label="Projects" value={projects?.length ?? 0} isLoading={projectsLoading} icon={FolderKanban} />
        <StatCard label="Total Images" value={totalImages} isLoading={projectsLoading} icon={Image} />
        <StatCard label="Calculators" value={calculators?.length ?? 0} isLoading={calcsLoading} icon={Calculator} />
        <StatCard label="Evidence Records" value={knowledgeBase?.total_evidence ?? 0} isLoading={kbLoading} icon={BookOpen} />
      </SimpleGrid>

      {/* Projects */}
      <Heading size="sm" mb={4} color="gray.700">My Projects</Heading>

      {projectsLoading ? (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
          {[0, 1, 2].map((i) => <ProjectCardSkeleton key={i} />)}
        </SimpleGrid>
      ) : !projects || projects.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="No projects yet"
          description="Create a project to start analyzing urban greenspaces."
        >
          <Button as={Link} to="/projects/new" colorScheme="green">
            Create Project
          </Button>
        </EmptyState>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
          {projects.map((p, i) => <ProjectCard key={p.id} project={p} index={i} />)}
        </SimpleGrid>
      )}
    </PageShell>
  );
}

export default Dashboard;
