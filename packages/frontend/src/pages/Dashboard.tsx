import {
  Box,
  Container,
  Heading,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Card,
  CardHeader,
  CardBody,
  Badge,
  Spinner,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { useHealth, useCalculators, useKnowledgeBaseSummary, useProjects } from '../hooks/useApi';

function Dashboard() {
  const { data: health, isLoading: healthLoading } = useHealth();
  const { data: calculators, isLoading: calcsLoading } = useCalculators();
  const { data: knowledgeBase, isLoading: kbLoading } = useKnowledgeBaseSummary();
  const { data: projects, isLoading: projectsLoading } = useProjects();

  const isLoading = healthLoading || calcsLoading || kbLoading || projectsLoading;

  return (
    <Container maxW="container.xl" py={8}>
      <Heading mb={8}>GreenSVC Dashboard</Heading>

      {isLoading ? (
        <Box textAlign="center" py={10}>
          <Spinner size="xl" />
        </Box>
      ) : (
        <>
          {/* Health Status */}
          <Alert status={health?.status === 'healthy' ? 'success' : 'error'} mb={6}>
            <AlertIcon />
            API Status: {health?.status || 'Unknown'}
          </Alert>

          {/* Stats Grid */}
          <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6} mb={8}>
            <Card>
              <CardBody>
                <Stat>
                  <StatLabel>Projects</StatLabel>
                  <StatNumber>{projects?.length || 0}</StatNumber>
                  <StatHelpText>Active projects</StatHelpText>
                </Stat>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Stat>
                  <StatLabel>Calculators</StatLabel>
                  <StatNumber>{calculators?.length || 0}</StatNumber>
                  <StatHelpText>Available indicators</StatHelpText>
                </Stat>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Stat>
                  <StatLabel>Evidence Records</StatLabel>
                  <StatNumber>{knowledgeBase?.total_evidence || 0}</StatNumber>
                  <StatHelpText>In knowledge base</StatHelpText>
                </Stat>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <Stat>
                  <StatLabel>Indicators with Evidence</StatLabel>
                  <StatNumber>{knowledgeBase?.indicators_with_evidence || 0}</StatNumber>
                  <StatHelpText>Research-backed</StatHelpText>
                </Stat>
              </CardBody>
            </Card>
          </SimpleGrid>

          {/* Calculators List */}
          <Card mb={6}>
            <CardHeader>
              <Heading size="md">Available Calculators</Heading>
            </CardHeader>
            <CardBody>
              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                {calculators?.map((calc) => (
                  <Box
                    key={calc.id}
                    p={4}
                    borderWidth="1px"
                    borderRadius="md"
                    _hover={{ shadow: 'md' }}
                  >
                    <Heading size="sm" mb={2}>
                      {calc.name}
                    </Heading>
                    <Badge colorScheme="blue" mr={2}>
                      {calc.id}
                    </Badge>
                    <Badge colorScheme="green">{calc.unit}</Badge>
                    <Box mt={2} fontSize="sm" color="gray.600">
                      {calc.target_direction === 'DECREASE' ? '↓ Lower is better' :
                       calc.target_direction === 'INCREASE' ? '↑ Higher is better' :
                       '↔ Neutral'}
                    </Box>
                  </Box>
                ))}
              </SimpleGrid>
            </CardBody>
          </Card>
        </>
      )}
    </Container>
  );
}

export default Dashboard;
