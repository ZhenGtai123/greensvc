import { useRef, type ReactNode } from 'react';
import { Box, SimpleGrid, Text } from '@chakra-ui/react';
import { useContainerWidth } from '../../utils/chartLayout';

/**
 * v4 / Module 7.3.1 — Responsive 4-up wrapper.
 *
 * The original layout used `<SimpleGrid columns={{ base: 1, sm: 2, md: 4 }}>`
 * which forces 4-up layout above ~768px. When the actual container is
 * < 1200px wide (typical when a Reports section is constrained by sidebar +
 * AI report card), each panel gets ~250px which is too narrow for
 * CorrelationHeatmap / RadarProfileChart / ValueSpatialMap to render their
 * labels without collisions. The result was the cramped 4-panel scroll
 * the user flagged in their screenshots.
 *
 * This component measures the actual container width and picks the layout
 * that gives every panel at least `minPanelWidth` px of space:
 *
 *   ≥ minPanelWidth × 4  → 1 × 4 (horizontal small-multiples)
 *   ≥ minPanelWidth × 2  → 2 × 2
 *   else                 → 4 × 1 (vertical stack)
 *
 * Default minPanelWidth is 360px which is the smallest reliable size for
 * a 9-indicator correlation heatmap with rotated labels.
 */

interface ResponsiveSmallMultiplesProps {
  children: ReactNode[];
  /** Minimum readable width per panel in pixels. Defaults to 360. */
  minPanelWidth?: number;
  /** Gap between panels in pixels (passed to SimpleGrid spacing prop). */
  gapPx?: number;
}

const GAP_PX_DEFAULT = 16;

export function ResponsiveSmallMultiples({
  children,
  minPanelWidth = 360,
  gapPx = GAP_PX_DEFAULT,
}: ResponsiveSmallMultiplesProps) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useContainerWidth(ref);
  const panels = children.filter((c) => c != null);
  const n = panels.length;
  // Column counts to try, descending. We pick the widest layout that still
  // gives every panel ≥ minPanelWidth.
  const tryCols = n >= 4 ? [4, 2, 1] : n >= 2 ? [2, 1] : [1];
  const chosenCols = pickColumns(width, n, tryCols, minPanelWidth, gapPx);
  const tooNarrow = width > 0 && chosenCols === 1 && width < minPanelWidth;

  return (
    <Box ref={ref} w="100%">
      {tooNarrow && (
        <Text fontSize="2xs" color="orange.600" mb={1}>
          Container is narrower than {minPanelWidth}px — chart panels may compress label rendering.
          Try expanding the section or rotating the device.
        </Text>
      )}
      <SimpleGrid columns={chosenCols} spacing={`${gapPx}px`}>
        {panels.map((c, i) => (
          <Box key={i} minW={0}>{c}</Box>
        ))}
      </SimpleGrid>
    </Box>
  );
}

function pickColumns(
  width: number,
  panelCount: number,
  tryCols: number[],
  minPanelWidth: number,
  gapPx: number,
): number {
  if (width <= 0) {
    // Width not yet measured — render single-column to avoid first-paint
    // overflow; ResizeObserver will trigger a re-render in microseconds.
    return Math.min(panelCount, 1) || 1;
  }
  for (const cols of tryCols) {
    if (cols > panelCount) continue;
    const totalGap = (cols - 1) * gapPx;
    const panelWidth = (width - totalGap) / cols;
    if (panelWidth >= minPanelWidth) return cols;
  }
  return 1;
}
