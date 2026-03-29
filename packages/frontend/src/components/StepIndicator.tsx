import { Link } from 'react-router-dom';
import { HStack, Box, Text } from '@chakra-ui/react';
import { Check } from 'lucide-react';
import { motion } from 'framer-motion';
import type { StageStatus } from '../utils/pipelineStatus';

const MotionBox = motion.create(Box);

const STEPS = [
  { step: 1, label: 'Setup', path: '' },
  { step: 2, label: 'Prepare', path: 'vision' },
  { step: 3, label: 'Analysis', path: 'analysis' },
  { step: 4, label: 'Report', path: 'reports' },
];

interface StepIndicatorProps {
  currentStep: number;
  projectId: string;
  stageStatuses: StageStatus[];
}

function StepIndicator({ currentStep, projectId, stageStatuses }: StepIndicatorProps) {
  return (
    <HStack spacing={0} w="full" bg="white" borderBottom="1px solid" borderColor="gray.200" px={4} py={3}>
      {STEPS.map((s, idx) => {
        const status = stageStatuses[idx];
        const isDone = status?.done ?? false;
        const isReady = status?.ready ?? false;
        const isActive = s.step === currentStep;
        const isLocked = !isDone && !isReady && !isActive;
        const connector = idx < STEPS.length - 1;

        const linkTo = s.path
          ? `/projects/${projectId}/${s.path}`
          : `/projects/${projectId}`;

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
            {isLocked ? (
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
