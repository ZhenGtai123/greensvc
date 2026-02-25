import { Flex, Box, Heading, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <Flex justify="space-between" align="center" mb={6}>
      <Box>
        <Heading size="lg">{title}</Heading>
        {subtitle && (
          <Text fontSize="sm" color="gray.500" mt={1}>{subtitle}</Text>
        )}
      </Box>
      {children && <Flex gap={2} align="center">{children}</Flex>}
    </Flex>
  );
}

export default PageHeader;
