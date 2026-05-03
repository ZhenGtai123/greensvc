import { Box, HStack, Progress, Text } from '@chakra-ui/react';

interface ChartLoadingProgressProps {
  total: number;
  mounted: number;
}

/**
 * Slim progress strip rendered above the chart grid. Each ChartHost reports
 * via onMount when its body has hydrated (IntersectionObserver fires); the
 * bar fades to 100% as the user scrolls. When mounted >= total, the bar
 * disappears so it doesn't take up sticky real estate.
 */
export function ChartLoadingProgress({ total, mounted }: ChartLoadingProgressProps) {
  if (total === 0 || mounted >= total) return null;
  const pct = Math.round((mounted / total) * 100);
  return (
    <Box mb={3}>
      <HStack justify="space-between" mb={1}>
        <Text fontSize="xs" color="gray.500">
          Loading charts… {mounted} / {total}
        </Text>
        <Text fontSize="xs" color="gray.400">{pct}%</Text>
      </HStack>
      <Progress
        value={pct}
        size="xs"
        colorScheme="blue"
        borderRadius="full"
        hasStripe
        isAnimated
      />
    </Box>
  );
}
