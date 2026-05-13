import { Box, HStack, Progress, Text } from '@chakra-ui/react';

interface ChartLoadingProgressProps {
  total: number;
  mounted: number;
  /** v4 / Module 3 — separate non-blocking counter for AI summary fetches.
   * When provided, a second strip is rendered below the main chart loader
   * showing how many "What this means" interpretations are still in flight.
   * Hidden once interpretations >= interpretationsTotal. */
  interpretationsTotal?: number;
  interpretationsMounted?: number;
}

/**
 * Slim progress strip rendered above the chart grid.
 *
 * v4 / Module 3 split-progress UX:
 *   1. Top strip — chart bodies hydrating (blocks the Skeleton overlay).
 *   2. Bottom strip — AI interpretations loading (does NOT block the
 *      Skeleton; charts are usable while these trickle in).
 *
 * When `total` is exhausted the top strip disappears. The bottom strip
 * only renders when interpretationsTotal > 0 and remains until all are
 * done — its purpose is to tell users "your summaries are still cooking,
 * the page isn't frozen".
 */
export function ChartLoadingProgress({
  total,
  mounted,
  interpretationsTotal,
  interpretationsMounted,
}: ChartLoadingProgressProps) {
  const showCharts = total > 0 && mounted < total;
  const showInterp =
    interpretationsTotal != null &&
    interpretationsMounted != null &&
    interpretationsTotal > 0 &&
    interpretationsMounted < interpretationsTotal;

  if (!showCharts && !showInterp) return null;

  const chartPct = total > 0 ? Math.round((mounted / total) * 100) : 0;
  const interpPct = interpretationsTotal && interpretationsTotal > 0
    ? Math.round(((interpretationsMounted ?? 0) / interpretationsTotal) * 100)
    : 0;

  return (
    <Box mb={3}>
      {showCharts && (
        <Box mb={showInterp ? 2 : 0}>
          <HStack justify="space-between" mb={1}>
            <Text fontSize="xs" color="gray.500">
              Rendering charts… {mounted} / {total}
            </Text>
            <Text fontSize="xs" color="gray.400">{chartPct}%</Text>
          </HStack>
          <Progress
            value={chartPct}
            size="xs"
            colorScheme="blue"
            borderRadius="full"
            hasStripe
            isAnimated
          />
        </Box>
      )}
      {showInterp && (
        <Box>
          <HStack justify="space-between" mb={1}>
            <Text fontSize="xs" color="purple.500">
              Generating interpretations… {interpretationsMounted} / {interpretationsTotal}
            </Text>
            <Text fontSize="xs" color="purple.300">{interpPct}%</Text>
          </HStack>
          <Progress
            value={interpPct}
            size="xs"
            colorScheme="purple"
            borderRadius="full"
            hasStripe
            isAnimated
          />
        </Box>
      )}
    </Box>
  );
}
