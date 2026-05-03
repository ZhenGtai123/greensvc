import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Card,
  CardHeader,
  CardBody,
  Heading,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Skeleton,
  Box,
  Text,
  Button,
  Spinner,
  Alert,
  AlertIcon,
  VStack,
  Icon,
  Badge,
} from '@chakra-ui/react';
import { MoreHorizontal, Download, EyeOff, Sparkles, ChevronRight, ChevronDown } from 'lucide-react';
import type { ChartDescriptor } from './registry';
import type { ChartContext } from './ChartContext';
import { useChartSummary } from '../../hooks/useApi';

interface ChartHostProps {
  descriptor: ChartDescriptor;
  ctx: ChartContext;
  onHide: (id: string) => void;
  /** Project id used as the chart-summary cache key. Disables AI summary when missing. */
  projectId?: string | null;
  /** Compact project metadata appended to the LLM prompt for grounding. */
  projectContext?: Record<string, unknown> | null;
  /** Show/hide the "What this means →" expandable. Defaults to true. */
  showAiSummary?: boolean;
  /** Force-render the chart even if it hasn't intersected yet. Used during
   * report export to ensure all charts are mounted before capture. */
  forceMount?: boolean;
  /** Fired exactly once when the chart body actually hydrates (lazy-mount or
   * forceMount). Used by the page-level loading progress bar. */
  onMount?: (id: string) => void;
}

/**
 * Imperative handle exposed to parents that need to capture chart images
 * (e.g. report export). Returns a PNG data URL plus dimensions for sizing.
 */
export interface ChartHostHandle {
  capturePNG: () => Promise<{
    dataURL: string;
    widthPx: number;
    heightPx: number;
  } | null>;
  /** Returns true once the chart body has rendered (hasIntersected === true). */
  isMounted: () => boolean;
}

/**
 * Wraps a single ChartDescriptor in a Chakra Card. Returns null when the
 * descriptor's data isn't available, so callers can just `.map()` over the
 * full registry without guards.
 */
export const ChartHost = forwardRef<ChartHostHandle, ChartHostProps>(
  function ChartHost(
    { descriptor, ctx, onHide, projectId, projectContext, showAiSummary = true, forceMount = false, onMount },
    ref,
  ) {
    const cardRef = useRef<HTMLDivElement | null>(null);
    const [hasIntersected, setHasIntersected] = useState(false);
    const [aiOpen, setAiOpen] = useState(true);
    const reportedMountRef = useRef(false);

    // IntersectionObserver lazy mount — defer rendering of heavy chart bodies
    // until the card scrolls near the viewport. Once mounted, stays mounted.
    useEffect(() => {
      if (hasIntersected) return;
      const node = cardRef.current;
      if (!node) return;
      if (typeof IntersectionObserver === 'undefined') {
        setHasIntersected(true);
        return;
      }
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setHasIntersected(true);
              observer.disconnect();
              break;
            }
          }
        },
        { rootMargin: '300px' },
      );
      observer.observe(node);
      return () => observer.disconnect();
    }, [hasIntersected]);

    // forceMount flips on during report export — ensure the body has rendered
    // even if the user hasn't scrolled to it.
    const effectiveMounted = hasIntersected || forceMount;

    // Fire onMount exactly once per chart instance once we've actually rendered
    // the body (either via intersection or forced). The ref guard prevents
    // double-fire across re-renders or strict-mode double effects.
    useEffect(() => {
      if (!effectiveMounted) return;
      if (reportedMountRef.current) return;
      reportedMountRef.current = true;
      onMount?.(descriptor.id);
    }, [effectiveMounted, descriptor.id, onMount]);

    const summaryPayload = descriptor.summaryPayload?.(ctx) ?? {
      chart_id: descriptor.id,
      title: descriptor.title,
    };

    const aiQueryEnabled = aiOpen && !!projectId;
    const summaryQuery = useChartSummary({
      chart_id: descriptor.id,
      chart_title: descriptor.title,
      chart_description: descriptor.description ?? null,
      project_id: projectId ?? '',
      payload: summaryPayload,
      project_context: projectContext ?? null,
      enabled: aiQueryEnabled,
    });

    const captureNode = async () => {
      const node = cardRef.current;
      if (!node) return null;
      const html2canvas = (await import('html2canvas')).default;
      return html2canvas(node, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });
    };

    useImperativeHandle(
      ref,
      (): ChartHostHandle => ({
        async capturePNG() {
          if (!effectiveMounted) {
            // Caller asked too early — chart body isn't rendered yet.
            return null;
          }
          if (!descriptor.isAvailable(ctx)) return null;
          const canvas = await captureNode();
          if (!canvas) return null;
          return {
            dataURL: canvas.toDataURL('image/png'),
            widthPx: canvas.width,
            heightPx: canvas.height,
          };
        },
        isMounted() {
          return effectiveMounted;
        },
      }),
      [effectiveMounted, descriptor, ctx],
    );

    if (!descriptor.isAvailable(ctx)) return null;

    const handleDownloadPng = async () => {
      const canvas = await captureNode();
      if (!canvas) return;
      try {
        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${descriptor.id}.png`;
          a.click();
          URL.revokeObjectURL(url);
        });
      } catch (err) {
        console.error('PNG export failed', err);
      }
    };

    const aiPanelEnabled = showAiSummary && !!projectId;

    return (
      <Card
        ref={cardRef}
        role="region"
        aria-label={descriptor.title}
      >
        <CardHeader pb={2}>
          <HStack justify="space-between" align="start">
            <Box flex="1" minW={0}>
              <HStack spacing={2} align="center">
                <Heading size="sm">{descriptor.title}</Heading>
                {descriptor.refCode && (
                  <Badge variant="subtle" colorScheme="gray" fontSize="2xs">
                    {descriptor.refCode}
                  </Badge>
                )}
              </HStack>
              {descriptor.description && (
                <Text fontSize="xs" color="gray.500" mt={1} lineHeight="1.4">
                  {descriptor.description}
                </Text>
              )}
            </Box>
            <Menu placement="bottom-end" isLazy>
              <MenuButton
                as={IconButton}
                aria-label={`Card menu for ${descriptor.title}`}
                icon={<MoreHorizontal size={14} />}
                size="xs"
                variant="ghost"
              />
              <MenuList minW="160px">
                <MenuItem icon={<Download size={14} />} fontSize="sm" onClick={handleDownloadPng}>
                  Download PNG
                </MenuItem>
                <MenuItem
                  icon={<EyeOff size={14} />}
                  fontSize="sm"
                  onClick={() => onHide(descriptor.id)}
                >
                  Hide chart
                </MenuItem>
              </MenuList>
            </Menu>
          </HStack>
        </CardHeader>
        <CardBody pt={2}>
          {effectiveMounted ? (
            descriptor.render(ctx)
          ) : (
            <Box minH="200px">
              <Skeleton height="200px" borderRadius="md" />
            </Box>
          )}

          {aiPanelEnabled && (
            <Box mt={4} pt={3} borderTop="1px dashed" borderColor="gray.200">
              <Button
                size="xs"
                variant="ghost"
                colorScheme="purple"
                leftIcon={<Icon as={Sparkles} boxSize={3.5} />}
                rightIcon={
                  <Icon as={aiOpen ? ChevronDown : ChevronRight} boxSize={3.5} />
                }
                onClick={() => setAiOpen((o) => !o)}
              >
                What this means
              </Button>
              {aiOpen && (
                <Box mt={2} pl={1}>
                  {summaryQuery.isLoading && (
                    <HStack spacing={2} color="gray.500" fontSize="xs">
                      <Spinner size="xs" />
                      <Text>Generating interpretation…</Text>
                    </HStack>
                  )}
                  {summaryQuery.isError && (
                    <Alert status="warning" size="sm" fontSize="xs" borderRadius="md">
                      <AlertIcon />
                      Could not generate summary. Check the LLM provider in Settings.
                    </Alert>
                  )}
                  {summaryQuery.data && (
                    <VStack align="stretch" spacing={2}>
                      {summaryQuery.data.error ? (
                        <Alert status="warning" size="sm" fontSize="xs" borderRadius="md">
                          <AlertIcon />
                          {summaryQuery.data.error}
                        </Alert>
                      ) : (
                        <Text fontSize="sm" color="gray.700" lineHeight="1.6">
                          {summaryQuery.data.summary || '(no summary returned)'}
                        </Text>
                      )}
                      {summaryQuery.data.highlight_points?.length > 0 && (
                        <Box pl={3}>
                          {summaryQuery.data.highlight_points.map((bullet, i) => (
                            <Text
                              key={i}
                              fontSize="xs"
                              color="gray.600"
                              position="relative"
                              _before={{
                                content: '"•"',
                                position: 'absolute',
                                left: '-12px',
                                color: 'purple.400',
                              }}
                            >
                              {bullet}
                            </Text>
                          ))}
                        </Box>
                      )}
                      {summaryQuery.data.cached && (
                        <Text fontSize="2xs" color="gray.400">
                          Cached · {summaryQuery.data.model || 'unknown model'}
                        </Text>
                      )}
                    </VStack>
                  )}
                </Box>
              )}
            </Box>
          )}
        </CardBody>
      </Card>
    );
  },
);
