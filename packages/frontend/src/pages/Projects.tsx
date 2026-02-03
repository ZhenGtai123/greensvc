import {
  Container,
  Heading,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  IconButton,
  useToast,
  Spinner,
  Badge,
  HStack,
} from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { useProjects, useDeleteProject } from '../hooks/useApi';

function Projects() {
  const { data: projects, isLoading } = useProjects();
  const deleteProject = useDeleteProject();
  const toast = useToast();

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this project?')) {
      try {
        await deleteProject.mutateAsync(id);
        toast({ title: 'Project deleted', status: 'success' });
      } catch (error) {
        toast({ title: 'Failed to delete project', status: 'error' });
      }
    }
  };

  if (isLoading) {
    return (
      <Container maxW="container.xl" py={8} textAlign="center">
        <Spinner size="xl" />
      </Container>
    );
  }

  return (
    <Container maxW="container.xl" py={8}>
      <HStack justify="space-between" mb={6}>
        <Heading>Projects</Heading>
        <Button as={Link} to="/projects/new" colorScheme="blue">
          + New Project
        </Button>
      </HStack>

      <Table variant="simple">
        <Thead>
          <Tr>
            <Th>ID</Th>
            <Th>Name</Th>
            <Th>Location</Th>
            <Th>Scale</Th>
            <Th>Zones</Th>
            <Th>Images</Th>
            <Th>Actions</Th>
          </Tr>
        </Thead>
        <Tbody>
          {projects?.map((project) => (
            <Tr key={project.id} _hover={{ bg: 'gray.50' }}>
              <Td>
                <Badge>{project.id}</Badge>
              </Td>
              <Td>
                <Button
                  as={Link}
                  to={`/projects/${project.id}`}
                  variant="link"
                  colorScheme="blue"
                  fontWeight="bold"
                >
                  {project.project_name}
                </Button>
              </Td>
              <Td>{project.project_location || '-'}</Td>
              <Td>{project.site_scale || '-'}</Td>
              <Td>{project.spatial_zones?.length ?? 0}</Td>
              <Td>{project.uploaded_images?.length ?? 0}</Td>
              <Td>
                <HStack>
                  <Button
                    as={Link}
                    to={`/projects/${project.id}`}
                    size="sm"
                    colorScheme="blue"
                    variant="ghost"
                  >
                    View
                  </Button>
                  <IconButton
                    aria-label="Delete project"
                    icon={<span>🗑️</span>}
                    size="sm"
                    colorScheme="red"
                    variant="ghost"
                    onClick={() => handleDelete(project.id)}
                  />
                </HStack>
              </Td>
            </Tr>
          ))}
          {projects?.length === 0 && (
            <Tr>
              <Td colSpan={7} textAlign="center" color="gray.500">
                No projects yet. Create one to get started.
              </Td>
            </Tr>
          )}
        </Tbody>
      </Table>

    </Container>
  );
}

export default Projects;
