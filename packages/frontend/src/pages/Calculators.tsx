import { useState, useRef } from 'react';
import {
  Box,
  Heading,
  Button,
  SimpleGrid,
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
import { Code2, Trash2, Upload } from 'lucide-react';
import { useCalculators, useUploadCalculator } from '../hooks/useApi';
import api from '../api';
import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';
import AnimatedCard from '../components/AnimatedCard';

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
    } catch {
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
    } catch {
      toast({ title: 'Failed to upload calculator', status: 'error' });
    }

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
      } catch {
        toast({ title: 'Failed to delete calculator', status: 'error' });
      }
    }
  };

  return (
    <PageShell isLoading={isLoading} loadingText="Loading calculators...">
      <PageHeader title="Calculators">
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
          leftIcon={<Upload size={16} />}
        >
          Upload Calculator
        </Button>
      </PageHeader>

      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
        {calculators?.map((calc, i) => (
          <AnimatedCard key={calc.id} hoverable delay={i * 0.05}>
            <CardHeader pb={2}>
              <HStack justify="space-between">
                <Badge colorScheme="blue" fontSize="md">
                  {calc.id}
                </Badge>
                <HStack>
                  <Button size="xs" onClick={() => handleViewCode(calc.id)} leftIcon={<Code2 size={12} />}>
                    Code
                  </Button>
                  <Button
                    size="xs"
                    colorScheme="red"
                    variant="ghost"
                    onClick={() => handleDelete(calc.id)}
                    leftIcon={<Trash2 size={12} />}
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
          </AnimatedCard>
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
    </PageShell>
  );
}

export default Calculators;
