import { useRef } from 'react';
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  IconButton,
  useDisclosure,
  useToast,
  Badge,
  HStack,
  Card,
  CardBody,
} from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Plus, Eye, Trash2, FolderPlus } from 'lucide-react';
import { useProjects, useDeleteProject } from '../hooks/useApi';
import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

function Projects() {
  const { data: projects, isLoading } = useProjects();
  const deleteProject = useDeleteProject();
  const toast = useToast();

  const { isOpen, onOpen, onClose } = useDisclosure();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const askDelete = (id: string) => {
    setPendingDeleteId(id);
    onOpen();
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await deleteProject.mutateAsync(pendingDeleteId);
      toast({ title: 'Project deleted', status: 'success' });
    } catch {
      toast({ title: 'Failed to delete project', status: 'error' });
    } finally {
      onClose();
      setPendingDeleteId(null);
    }
  };

  return (
    <PageShell isLoading={isLoading} loadingText="Loading projects...">
      <PageHeader title="Projects">
        <Button as={Link} to="/projects/new" colorScheme="green" leftIcon={<Plus size={16} />}>
          New Project
        </Button>
      </PageHeader>

      {projects?.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="No projects yet"
          description="Create one to get started."
        >
          <Button as={Link} to="/projects/new" colorScheme="green" leftIcon={<Plus size={16} />}>
            New Project
          </Button>
        </EmptyState>
      ) : (
        <Card>
          <CardBody p={0}>
            <Box overflowX="auto">
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
                            leftIcon={<Eye size={14} />}
                          >
                            View
                          </Button>
                          <IconButton
                            aria-label="Delete project"
                            icon={<Trash2 size={14} />}
                            size="sm"
                            colorScheme="red"
                            variant="ghost"
                            onClick={() => askDelete(project.id)}
                          />
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          </CardBody>
        </Card>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog isOpen={isOpen} leastDestructiveRef={cancelRef} onClose={onClose}>
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Delete Project
            </AlertDialogHeader>
            <AlertDialogBody>
              Are you sure? This action cannot be undone.
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={onClose}>
                Cancel
              </Button>
              <Button
                colorScheme="red"
                onClick={confirmDelete}
                ml={3}
                isLoading={deleteProject.isPending}
              >
                Delete
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </PageShell>
  );
}

export default Projects;
