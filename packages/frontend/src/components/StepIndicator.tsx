import { Link } from 'react-router-dom';
import { HStack, Box, Text } from '@chakra-ui/react';
import { Check } from 'lucide-react';
import { motion } from 'framer-motion';
import type { StageStatus } from '../utils/pipelineStatus';

const MotionBox = motion.create(Box);

const STEPS = [
  { step: 1, label: 'Vision Analysis', path: 'vision' },
  { step: 2, label: 'Indicators', path: 'indicators' },
  { step: 3, label: 'Analysis', path: 'analysis' },
  { step: 4, label: 'Reports', path: 'reports' },
];

interface StepIndicatorProps {
  currentStep: number;
  projectId: string;
  stageStatuses: StageStatus[];
}

function StepIndicator({ currentStep, projectId, stageStatuses }: StepIndicatorProps) {
  return (
    <HStack spacing={0} w="full" bg="white" borderBottom="1px solid" borderColor="gray.200" px={6} py={3}>
      {STEPS.map((s, idx) => {
        const status = stageStatuses[idx];
        const isDone = status?.done ?? false;
        const isReady = status?.ready ?? false;
        const isActive = s.step === currentStep;
        const isLocked = !isDone && !isReady && !isActive;
        const connector = idx < STEPS.length - 1;

        const inner = (
          <>
            {isActive ? (
              <MotionBox
                w={8}
                h={8}
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
                w={8}
                h={8}
                borderRadius="full"
                display="flex"
                alignItems="center"
                justifyContent="center"
                fontSize="xs"
                fontWeight="bold"
                bg={isDone ? 'brand.500' : 'gray.200'}
                color={isDone ? 'white' : 'gray.500'}
              >
                {isDone ? <Check size={14} /> : s.step}
              </Box>
            )}
            <Text
              fontSize="sm"
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
                px={3}
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
                to={`/projects/${projectId}/${s.path}`}
                display="flex"
                alignItems="center"
                gap={2}
                px={3}
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
