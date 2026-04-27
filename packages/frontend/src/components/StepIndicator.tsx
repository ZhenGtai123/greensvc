import { Link, useNavigate } from 'react-router-dom';
import { HStack, Box, Text } from '@chakra-ui/react';
import { Check } from 'lucide-react';
import { motion } from 'framer-motion';
import type { StageStatus } from '../utils/pipelineStatus';
import useAppStore from '../store/useAppStore';

const MotionBox = motion.create(Box);

const STEPS = [
  { step: 1, label: 'Project', path: 'edit' },
  { step: 2, label: 'Images', path: '' },
  { step: 3, label: 'Prepare', path: 'vision' },
  { step: 4, label: 'Analysis', path: 'analysis' },
  { step: 5, label: 'Report', path: 'reports' },
];

// Steps whose pages mutate project state (uploaded_images, masks, zone
// assignments, metrics_results). Navigating to these mid-pipeline can race
// with the backend's writes and corrupt the run, so we always confirm first.
const DANGEROUS_STEPS = new Set([1, 2, 3]);

interface StepIndicatorProps {
  currentStep: number;
  projectId: string;
  stageStatuses: StageStatus[];
}

function StepIndicator({ currentStep, projectId, stageStatuses }: StepIndicatorProps) {
  const isNewProject = !projectId;
  const navigate = useNavigate();
  const pipelineRun = useAppStore(s => s.pipelineRun);
  const pipelineRunningHere = pipelineRun.isRunning && pipelineRun.projectId === projectId;

  const handleNavGuarded = (e: React.MouseEvent, targetStep: number, to: string) => {
    if (!pipelineRunningHere) return;
    if (!DANGEROUS_STEPS.has(targetStep)) return;
    e.preventDefault();
    const confirmed = window.confirm(
      'A pipeline is currently running for this project. Navigating to this page can ' +
      "modify image masks or zone assignments while the pipeline is reading them, " +
      'which may corrupt the run.\n\n' +
      'Continue anyway?'
    );
    if (confirmed) navigate(to);
  };

  return (
    <HStack spacing={0} w="full" bg="white" borderBottom="1px solid" borderColor="gray.200" px={4} py={3}>
      {STEPS.map((s, idx) => {
        const status = stageStatuses[idx];
        const isDone = status?.done ?? false;
        const isReady = status?.ready ?? false;
        const isActive = s.step === currentStep;
        const isLocked = !isDone && !isReady && !isActive;
        const connector = idx < STEPS.length - 1;

        // Build link path
        let linkTo: string;
        if (isNewProject) {
          linkTo = s.step === 1 ? '/projects/new' : '#';
        } else if (s.path) {
          linkTo = `/projects/${projectId}/${s.path}`;
        } else {
          linkTo = `/projects/${projectId}`;
        }

        const inner = (
          <>
            {isActive ? (
              <MotionBox
                w={7}
                h={7}
                borderRadius="full"
                display="flex"
                alignItems="center"
                justifyContent="center"
                fontSize="xs"
                fontWeight="bold"
                bg="blue.500"
                color="white"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                {s.step}
              </MotionBox>
            ) : (
              <Box
                w={7}
                h={7}
                borderRadius="full"
                display="flex"
                alignItems="center"
                justifyContent="center"
                fontSize="xs"
                fontWeight="bold"
                bg={isDone ? 'brand.500' : 'gray.200'}
                color={isDone ? 'white' : 'gray.500'}
              >
                {isDone ? <Check size={12} /> : s.step}
              </Box>
            )}
            <Text
              fontSize="xs"
              fontWeight={isActive ? 'bold' : 'normal'}
              color={isDone ? 'brand.600' : isActive ? 'blue.600' : 'gray.500'}
              whiteSpace="nowrap"
            >
              {s.label}
            </Text>
          </>
        );

        return (
          <HStack key={s.step} flex={1} spacing={0}>
            {isLocked || (isNewProject && s.step > 1) ? (
              <Box
                display="flex"
                alignItems="center"
                gap={2}
                px={2}
                py={1}
                borderRadius="md"
                opacity={0.45}
                pointerEvents="none"
              >
                {inner}
              </Box>
            ) : (
              <Box
                as={Link}
                to={linkTo}
                onClick={(e: React.MouseEvent) => handleNavGuarded(e, s.step, linkTo)}
                display="flex"
                alignItems="center"
                gap={2}
                px={2}
                py={1}
                borderRadius="md"
                _hover={{ bg: 'gray.50' }}
                textDecoration="none"
              >
                {inner}
              </Box>
            )}
            {connector && (
              <Box flex={1} h="3px" bg={isDone ? 'brand.300' : 'gray.200'} mx={1} borderRadius="full" />
            )}
          </HStack>
        );
      })}
    </HStack>
  );
}

export default StepIndicator;
