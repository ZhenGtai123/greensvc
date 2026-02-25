import { Box, Flex, Spinner, Text } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

const MotionBox = motion.create(Box);

interface PageShellProps {
  children?: ReactNode;
  isLoading?: boolean;
  loadingText?: string;
}

function PageShell({ children, isLoading, loadingText = 'Loading...' }: PageShellProps) {
  if (isLoading) {
    return (
      <Flex px={8} py={6} align="center" justify="center" minH="50vh" direction="column" gap={3}>
        <Spinner size="xl" color="brand.500" thickness="3px" />
        <Text color="gray.500" fontSize="sm">{loadingText}</Text>
      </Flex>
    );
  }

  return (
    <MotionBox
      px={8}
      py={6}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {children}
    </MotionBox>
  );
}

export default PageShell;
