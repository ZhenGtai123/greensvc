import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChakraProvider, Box, Flex, VStack, HStack, Heading, Button, extendTheme } from '@chakra-ui/react';

import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Calculators from './pages/Calculators';
import VisionAnalysis from './pages/VisionAnalysis';
import Indicators from './pages/Indicators';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import ProjectWizard from './pages/ProjectWizard';
import ProjectDetail from './pages/ProjectDetail';
import Analysis from './pages/Analysis';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

// Custom theme
const theme = extendTheme({
  styles: {
    global: {
      body: {
        bg: 'gray.50',
      },
    },
  },
});

// Navigation component
function Navigation() {
  return (
    <Box bg="white" shadow="sm" px={6} py={4}>
      <Flex maxW="container.xl" mx="auto" justify="space-between" align="center">
        <HStack spacing={8}>
          <Heading size="md" color="green.600">
            GreenSVC
          </Heading>
          <HStack spacing={4}>
            <Button as={Link} to="/" variant="ghost" size="sm">
              Dashboard
            </Button>
            <Button as={Link} to="/projects" variant="ghost" size="sm">
              Projects
            </Button>
            <Button as={Link} to="/vision" variant="ghost" size="sm">
              Vision
            </Button>
            <Button as={Link} to="/indicators" variant="ghost" size="sm">
              Indicators
            </Button>
            <Button as={Link} to="/calculators" variant="ghost" size="sm">
              Calculators
            </Button>
            <Button as={Link} to="/reports" variant="ghost" size="sm">
              Reports
            </Button>
            <Button as={Link} to="/analysis" variant="ghost" size="sm">
              Analysis
            </Button>
            <Button as={Link} to="/settings" variant="ghost" size="sm">
              Settings
            </Button>
          </HStack>
        </HStack>
      </Flex>
    </Box>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider theme={theme}>
        <BrowserRouter>
          <VStack spacing={0} minH="100vh" align="stretch">
            <Navigation />
            <Box flex="1">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/new" element={<ProjectWizard />} />
                <Route path="/projects/:projectId" element={<ProjectDetail />} />
                <Route path="/projects/:projectId/edit" element={<ProjectWizard />} />
                <Route path="/vision" element={<VisionAnalysis />} />
                <Route path="/indicators" element={<Indicators />} />
                <Route path="/calculators" element={<Calculators />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/analysis" element={<Analysis />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Box>
          </VStack>
        </BrowserRouter>
      </ChakraProvider>
    </QueryClientProvider>
  );
}

export default App;
