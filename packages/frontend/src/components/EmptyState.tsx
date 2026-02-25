import { Flex, Heading, Text, Box } from '@chakra-ui/react';
import type { ReactNode, ElementType } from 'react';

interface EmptyStateProps {
  icon?: ElementType;
  title: string;
  description?: string;
  children?: ReactNode;
}

function EmptyState({ icon: Icon, title, description, children }: EmptyStateProps) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      py={16}
      px={8}
      bg="white"
      borderRadius="xl"
      border="2px dashed"
      borderColor="gray.200"
    >
      {Icon && (
        <Box mb={4} color="gray.300">
          <Icon size={48} strokeWidth={1.5} />
        </Box>
      )}
      <Heading size="md" mb={2} textAlign="center">
        {title}
      </Heading>
      {description && (
        <Text color="gray.500" mb={6} textAlign="center" maxW="sm">
          {description}
        </Text>
      )}
      {children}
    </Flex>
  );
}

export default EmptyState;
