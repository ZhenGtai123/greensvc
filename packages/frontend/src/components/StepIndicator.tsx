import { Link } from 'react-router-dom';
import { HStack, Box, Text } from '@chakra-ui/react';

const STEPS = [
  { step: 1, label: 'Vision Analysis', path: 'vision' },
  { step: 2, label: 'Indicators', path: 'indicators' },
  { step: 3, label: 'Analysis', path: 'analysis' },
  { step: 4, label: 'Reports', path: 'reports' },
];

interface StepIndicatorProps {
  currentStep: number;
  projectId: string;
}

function StepIndicator({ currentStep, projectId }: StepIndicatorProps) {
  return (
    <HStack spacing={0} w="full" bg="white" borderBottom="1px solid" borderColor="gray.200" px={6} py={3}>
      {STEPS.map((s, idx) => {
        const isCompleted = s.step < currentStep;
        const isActive = s.step === currentStep;
        const connector = idx < STEPS.length - 1;

        return (
          <HStack key={s.step} flex={1} spacing={0}>
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
              <Box
                w={6}
                h={6}
                borderRadius="full"
                display="flex"
                alignItems="center"
                justifyContent="center"
                fontSize="xs"
                fontWeight="bold"
                bg={isCompleted ? 'green.500' : isActive ? 'blue.500' : 'gray.200'}
                color={isCompleted || isActive ? 'white' : 'gray.500'}
              >
                {isCompleted ? '\u2713' : s.step}
              </Box>
              <Text
                fontSize="sm"
                fontWeight={isActive ? 'bold' : 'normal'}
                color={isCompleted ? 'green.600' : isActive ? 'blue.600' : 'gray.500'}
                whiteSpace="nowrap"
              >
                {s.label}
              </Text>
            </Box>
            {connector && (
              <Box flex={1} h="2px" bg={isCompleted ? 'green.300' : 'gray.200'} mx={1} />
            )}
          </HStack>
        );
      })}
    </HStack>
  );
}

export default StepIndicator;
