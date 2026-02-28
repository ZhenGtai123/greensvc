import { BrowserRouter, Routes, Route, Link, Outlet, useParams, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ChakraProvider, Box, Divider, Flex, Heading, Text, VStack } from '@chakra-ui/react';
import { LayoutDashboard, FolderKanban, Calculator, Settings as SettingsIcon } from 'lucide-react';
import theme from './theme';
import StepIndicator from './components/StepIndicator';
import useAppStore from './store/useAppStore';
import { getStageStatuses } from './utils/pipelineStatus';
import api from './api';

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

const SIDEBAR_W = '224px';

// ---------------------------------------------------------------------------
// Sidebar nav item
// ---------------------------------------------------------------------------
function NavItem({ to, label, active, icon: Icon }: { to: string; label: string; active: boolean; icon: React.ElementType }) {
  return (
    <Box
      as={Link}
      to={to}
      display="flex"
      alignItems="center"
      gap={3}
      px={5}
      py={2.5}
      fontSize="sm"
      fontWeight={active ? '600' : '400'}
      color={active ? 'brand.700' : 'gray.600'}
      bg={active ? 'brand.50' : 'transparent'}
      borderRight="3px solid"
      borderColor={active ? 'brand.500' : 'transparent'}
      _hover={{ bg: active ? 'brand.50' : 'gray.100', color: 'gray.800' }}
      textDecoration="none"
      transition="all 0.2s ease"
    >
      <Icon size={18} />
      {label}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------
function Sidebar() {
  const { pathname } = useLocation();

  const mainItems = [
    { label: 'Dashboard', to: '/', active: pathname === '/', icon: LayoutDashboard },
    { label: 'Projects', to: '/projects', active: pathname.startsWith('/projects'), icon: FolderKanban },
    { label: 'Calculators', to: '/calculators', active: pathname.startsWith('/calculators'), icon: Calculator },
  ];

  return (
    <Flex
      direction="column"
      w={SIDEBAR_W}
      minW={SIDEBAR_W}
      h="100vh"
      position="fixed"
      top={0}
      left={0}
      bg="white"
      borderRight="1px solid"
      borderColor="gray.200"
      zIndex={10}
    >
      {/* Logo */}
      <Box px={5} py={5}>
        <Heading
          as={Link}
          to="/"
          size="md"
          color="brand.600"
          textDecoration="none"
          _hover={{ color: 'brand.700' }}
        >
          GreenSVC
        </Heading>
        <Text fontSize="2xs" color="gray.400" mt={0.5} letterSpacing="wide">
          Urban Greenspace Platform
        </Text>
      </Box>

      <Divider />

      {/* Main section */}
      <VStack spacing={0} align="stretch" flex={1} pt={4}>
        <Text
          px={5}
          mb={2}
          fontSize="2xs"
          fontWeight="700"
          color="gray.400"
          textTransform="uppercase"
          letterSpacing="widest"
        >
          Main
        </Text>
        {mainItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </VStack>

      {/* Bottom */}
      <Divider />
      <Box py={3}>
        <NavItem
          to="/settings"
          label="Settings"
          active={pathname.startsWith('/settings')}
          icon={SettingsIcon}
        />
      </Box>
    </Flex>
  );
}

// ---------------------------------------------------------------------------
// Pipeline layout — wraps project pipeline pages with StepIndicator
// ---------------------------------------------------------------------------
function ProjectPipelineLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const { pathname } = useLocation();
  const { recommendations, zoneAnalysisResult } = useAppStore();

  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.projects.get(projectId!).then(res => res.data),
    enabled: !!projectId,
  });

  const segment = pathname.split('/').pop() || '';
  const stepMap: Record<string, number> = { vision: 1, indicators: 2, analysis: 3, reports: 4 };
  const currentStep = stepMap[segment] || 1;

  const stageStatuses = getStageStatuses(project ?? null, { recommendations, zoneAnalysisResult });

  return (
    <>
      <StepIndicator currentStep={currentStep} projectId={projectId || ''} stageStatuses={stageStatuses} />
      <Outlet />
    </>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider theme={theme}>
        <BrowserRouter>
          <Flex minH="100vh">
            <Sidebar />

            {/* Main content area */}
            <Box ml={SIDEBAR_W} flex={1} minH="100vh">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/projects/new" element={<ProjectWizard />} />
                <Route path="/projects/:projectId" element={<ProjectDetail />} />
                <Route path="/projects/:projectId/edit" element={<ProjectWizard />} />

                {/* Pipeline stages — always under a project */}
                <Route path="/projects/:projectId/vision" element={<ProjectPipelineLayout />}>
                  <Route index element={<VisionAnalysis />} />
                </Route>
                <Route path="/projects/:projectId/indicators" element={<ProjectPipelineLayout />}>
                  <Route index element={<Indicators />} />
                </Route>
                <Route path="/projects/:projectId/analysis" element={<ProjectPipelineLayout />}>
                  <Route index element={<Analysis />} />
                </Route>
                <Route path="/projects/:projectId/reports" element={<ProjectPipelineLayout />}>
                  <Route index element={<Reports />} />
                </Route>

                <Route path="/calculators" element={<Calculators />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </Box>
          </Flex>
        </BrowserRouter>
      </ChakraProvider>
    </QueryClientProvider>
  );
}

export default App;
