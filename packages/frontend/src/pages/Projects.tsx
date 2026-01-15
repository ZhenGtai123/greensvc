import { useState } from 'react';
import {
  Box,
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
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  useDisclosure,
  useToast,
  Spinner,
  Badge,
} from '@chakra-ui/react';
import { useProjects, useCreateProject, useDeleteProject } from '../hooks/useApi';
import type { ProjectCreate } from '../types';

function Projects() {
  const { data: projects, isLoading } = useProjects();
  const createProject = useCreateProject();
  const deleteProject = useDeleteProject();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();

  const [formData, setFormData] = useState<ProjectCreate>({
    project_name: '',
    project_location: '',
    site_scale: '',
    design_brief: '',
  });

  const handleCreate = async () => {
    try {
      await createProject.mutateAsync(formData);
      toast({ title: 'Project created', status: 'success' });
      onClose();
      setFormData({ project_name: '', project_location: '', site_scale: '', design_brief: '' });
    } catch (error) {
      toast({ title: 'Failed to create project', status: 'error' });
    }
  };

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
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={6}>
        <Heading>Projects</Heading>
        <Button colorScheme="blue" onClick={onOpen}>
          New Project
        </Button>
      </Box>

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
            <Tr key={project.id}>
              <Td>
                <Badge>{project.id}</Badge>
              </Td>
              <Td fontWeight="bold">{project.project_name}</Td>
              <Td>{project.project_location || '-'}</Td>
              <Td>{project.site_scale || '-'}</Td>
              <Td>{project.spatial_zones.length}</Td>
              <Td>{project.uploaded_images.length}</Td>
              <Td>
                <IconButton
                  aria-label="Delete project"
                  icon={<span>🗑️</span>}
                  size="sm"
                  colorScheme="red"
                  variant="ghost"
                  onClick={() => handleDelete(project.id)}
                />
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

      {/* Create Project Modal */}
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Create New Project</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl mb={4} isRequired>
              <FormLabel>Project Name</FormLabel>
              <Input
                value={formData.project_name}
                onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                placeholder="e.g., Central Park Analysis"
              />
            </FormControl>
            <FormControl mb={4}>
              <FormLabel>Location</FormLabel>
              <Input
                value={formData.project_location}
                onChange={(e) => setFormData({ ...formData, project_location: e.target.value })}
                placeholder="e.g., New York, NY"
              />
            </FormControl>
            <FormControl mb={4}>
              <FormLabel>Site Scale</FormLabel>
              <Input
                value={formData.site_scale}
                onChange={(e) => setFormData({ ...formData, site_scale: e.target.value })}
                placeholder="e.g., 10-50 ha"
              />
            </FormControl>
            <FormControl>
              <FormLabel>Design Brief</FormLabel>
              <Textarea
                value={formData.design_brief}
                onChange={(e) => setFormData({ ...formData, design_brief: e.target.value })}
                placeholder="Describe the project goals..."
                rows={3}
              />
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose}>
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleCreate}
              isLoading={createProject.isPending}
              isDisabled={!formData.project_name}
            >
              Create
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Container>
  );
}

export default Projects;
