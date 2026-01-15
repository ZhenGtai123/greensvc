import { useState, useRef } from 'react';
import {
  Box,
  Container,
  Heading,
  Button,
  SimpleGrid,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Text,
  Code,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  useToast,
  Spinner,
  Input,
  VStack,
  HStack,
} from '@chakra-ui/react';
import { useCalculators, useUploadCalculator } from '../hooks/useApi';
import api from '../api';

function Calculators() {
  const { data: calculators, isLoading, refetch } = useCalculators();
  const uploadCalculator = useUploadCalculator();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedCalc, setSelectedCalc] = useState<string | null>(null);
  const [code, setCode] = useState<string>('');
  const [codeLoading, setCodeLoading] = useState(false);

  const handleViewCode = async (id: string) => {
    setSelectedCalc(id);
    setCodeLoading(true);
    onOpen();
    try {
      const response = await api.metrics.getCode(id);
      setCode(response.data.code);
    } catch (error) {
      toast({ title: 'Failed to load code', status: 'error' });
      setCode('// Failed to load code');
    }
    setCodeLoading(false);
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await uploadCalculator.mutateAsync(file);
      toast({ title: 'Calculator uploaded successfully', status: 'success' });
      refetch();
    } catch (error) {
      toast({ title: 'Failed to upload calculator', status: 'error' });
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm(`Are you sure you want to delete calculator ${id}?`)) {
      try {
        await api.metrics.delete(id);
        toast({ title: 'Calculator deleted', status: 'success' });
        refetch();
      } catch (error) {
        toast({ title: 'Failed to delete calculator', status: 'error' });
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
        <Heading>Calculators</Heading>
        <HStack>
          <Input
            ref={fileInputRef}
            type="file"
            accept=".py"
            display="none"
            onChange={handleUpload}
          />
          <Button
            colorScheme="blue"
            onClick={() => fileInputRef.current?.click()}
            isLoading={uploadCalculator.isPending}
          >
            Upload Calculator
          </Button>
        </HStack>
      </Box>

      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
        {calculators?.map((calc) => (
          <Card key={calc.id}>
            <CardHeader pb={2}>
              <HStack justify="space-between">
                <Badge colorScheme="blue" fontSize="md">
                  {calc.id}
                </Badge>
                <HStack>
                  <Button size="xs" onClick={() => handleViewCode(calc.id)}>
                    View Code
                  </Button>
                  <Button
                    size="xs"
                    colorScheme="red"
                    variant="ghost"
                    onClick={() => handleDelete(calc.id)}
                  >
                    Delete
                  </Button>
                </HStack>
              </HStack>
            </CardHeader>
            <CardBody pt={2}>
              <VStack align="start" spacing={2}>
                <Heading size="sm">{calc.name}</Heading>

                <HStack>
                  <Badge colorScheme="green">{calc.unit}</Badge>
                  <Badge
                    colorScheme={
                      calc.target_direction === 'DECREASE'
                        ? 'orange'
                        : calc.target_direction === 'INCREASE'
                        ? 'green'
                        : 'gray'
                    }
                  >
                    {calc.target_direction}
                  </Badge>
                  <Badge colorScheme="purple">{calc.calc_type}</Badge>
                </HStack>

                <Text fontSize="sm" color="gray.600" noOfLines={2}>
                  {calc.definition || calc.formula}
                </Text>

                {calc.target_classes.length > 0 && (
                  <Box>
                    <Text fontSize="xs" fontWeight="bold" color="gray.500">
                      Target Classes:
                    </Text>
                    <Text fontSize="xs" color="gray.600" noOfLines={2}>
                      {calc.target_classes.slice(0, 5).join(', ')}
                      {calc.target_classes.length > 5 && ` +${calc.target_classes.length - 5} more`}
                    </Text>
                  </Box>
                )}
              </VStack>
            </CardBody>
          </Card>
        ))}
      </SimpleGrid>

      {/* Code Viewer Modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl">
        <ModalOverlay />
        <ModalContent maxW="800px">
          <ModalHeader>Calculator Code: {selectedCalc}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {codeLoading ? (
              <Spinner />
            ) : (
              <Box
                as="pre"
                p={4}
                bg="gray.900"
                color="green.300"
                borderRadius="md"
                overflow="auto"
                maxH="500px"
                fontSize="sm"
              >
                <Code bg="transparent" color="inherit" whiteSpace="pre">
                  {code}
                </Code>
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Container>
  );
}

export default Calculators;
