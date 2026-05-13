import { Link, useNavigate } from 'react-router-dom';
import { HStack, Box, Text, Tooltip } from '@chakra-ui/react';
import { Check, AlertCircle } from 'lucide-react';
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
        // Layer 2 — stale: this step had output that got wiped by upstream
        // edits. Renders as an amber `!` instead of a gray number to tell
        // the user "you finished this once, please re-run." Suppressed when
        // the step is currently active (the active pulse takes precedence)
        // or when it's already done (nothing stale about completed work).
        const isStale = (status?.stale ?? false) && !isDone;
        const isActive = s.step === currentStep;
        const isLocked = !isDone && !isReady && !isActive;
        const connector = idx < STEPS.length - 1;

        // Tooltip copy explaining why a stale step needs attention. Step 3
        // and Step 4 are the only ones that surface this state in
        // pipelineStatus.ts; copy is tailored to each.
        const staleHint = !isStale
          ? null
          : s.step === 3
            ? 'Out of date — new images need processing or recommendations were cleared. Re-run Prepare.'
            : s.step === 4
              ? 'Out of date — analysis was cleared after an upstream change. Re-run Pipeline.'
              : 'Out of date — re-run this step to refresh.';

        // Build link path
        let linkTo: string;
        if (isNewProject) {
          linkTo = s.step === 1 ? '/projects/new' : '#';
        } else if (s.path) {
          linkTo = `/projects/${projectId}/${s.path}`;
        } else {
          linkTo = `/projects/${projectId}`;
        }

        // Visual decision tree for the circle:
        //   active → blue pulsing
        //   done   → green check
        //   stale  → amber `!`  (NEW in Layer 2)
        //   else   → gray step number
        const circleBg = isActive
          ? 'blue.500'
          : isDone
            ? 'brand.500'
            : isStale
              ? 'orange.400'
              : 'gray.200';
        const circleFg = isActive || isDone || isStale ? 'white' : 'gray.500';
        const labelColor = isDone
          ? 'brand.600'
          : isActive
            ? 'blue.600'
            : isStale
              ? 'orange.600'
              : 'gray.500';

        const circleContent = isActive ? (
          <MotionBox
            w={7}
            h={7}
            borderRadius="full"
            display="flex"
            alignItems="center"
            justifyContent="center"
            fontSize="xs"
            fontWeight="bold"
            bg={circleBg}
            color={circleFg}
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
            bg={circleBg}
            color={circleFg}
          >
            {isDone
              ? <Check size={12} />
              : isStale
                ? <AlertCircle size={14} />
                : s.step}
          </Box>
        );

        const inner = (
          <>
            {staleHint ? (
              <Tooltip label={staleHint} placement="top" hasArrow openDelay={200}>
                {circleContent}
              </Tooltip>
            ) : (
              circleContent
            )}
            <Text
              fontSize="xs"
              fontWeight={isActive || isStale ? 'bold' : 'normal'}
              color={labelColor}
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
