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
  MenuDivider,
  MenuGroup,
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
  useToast,
} from '@chakra-ui/react';
import { MoreHorizontal, EyeOff, Sparkles, ChevronRight, ChevronDown, FileImage, FileText, FileSpreadsheet, FileCode } from 'lucide-react';
import type { ChartDescriptor } from './registry';
import type { ChartContext } from './ChartContext';
import { useChartSummary } from '../../hooks/useApi';
import { exportArtifact, type ExportFormat } from '../../utils/exportChart';
import type { GroupingMode } from '../../types';

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
  /** Project slug used as the prefix for export filenames. Falls back to
   * "project" when missing. */
  projectSlug?: string | null;
  /** Active grouping mode (zones | clusters) — appended to export filenames
   * so zone-mode and cluster-mode artifacts don't overwrite each other. */
  groupingMode?: GroupingMode;
}

// ─────────────────────────────────────────────────────────────────────────
// #6 — structured 4-section interpretation
// ─────────────────────────────────────────────────────────────────────────

interface ChartSummaryV2Data {
  overall: string;
  findings: { point: string; evidence: string }[];
  local_breakdown: { unit_id: string; unit_label: string; interpretation: string }[];
  implication: string;
}

interface ChartSummaryData {
  summary: string;
  highlight_points: string[];
  summary_v2?: ChartSummaryV2Data | null;
  cached?: boolean;
  model?: string;
  error?: string | null;
  degraded?: boolean;
}

/** Renders the chart-summary panel. Prefers the structured 4-section v2
 * payload (overall → findings → local breakdown → implication) when the
 * backend returned one; falls back to the legacy paragraph + bullets when
 * v2 parsing failed twice (degraded=true) or for older cached entries. */
function ChartSummaryView({ data }: { data: ChartSummaryData }) {
  if (data.error) {
    return (
      <Alert status="warning" size="sm" fontSize="xs" borderRadius="md">
        <AlertIcon />
        {data.error}
      </Alert>
    );
  }

  const v2 = data.summary_v2 ?? null;

  // ── v2 (structured) ───────────────────────────────────────────────
  if (v2) {
    return (
      <VStack align="stretch" spacing={3}>
        {/* 1. Overall */}
        {v2.overall && (
          <Box>
            <Text fontSize="2xs" fontWeight="bold" color="gray.500" textTransform="uppercase" mb={1}>
              Overall
            </Text>
            <Text fontSize="sm" color="gray.700" lineHeight="1.6">
              {v2.overall}
            </Text>
          </Box>
        )}

        {/* 2. Key findings (with evidence chips) */}
        {v2.findings.length > 0 && (
          <Box>
            <Text fontSize="2xs" fontWeight="bold" color="gray.500" textTransform="uppercase" mb={1}>
              Key findings
            </Text>
            <VStack align="stretch" spacing={2}>
              {v2.findings.map((f, i) => (
                <Box key={i} borderLeft="2px solid" borderColor="purple.300" pl={3} py={0.5}>
                  <Text fontSize="sm" color="gray.700" lineHeight="1.5">
                    {f.point}
                  </Text>
                  {f.evidence && (
                    <Badge variant="subtle" colorScheme="purple" mt={1} fontSize="2xs" whiteSpace="normal">
                      {f.evidence}
                    </Badge>
                  )}
                </Box>
              ))}
            </VStack>
          </Box>
        )}

        {/* 3. Local breakdown (per grouping unit) */}
        {v2.local_breakdown.length > 0 && (
          <Box>
            <Text fontSize="2xs" fontWeight="bold" color="gray.500" textTransform="uppercase" mb={1}>
              Per unit
            </Text>
            <VStack align="stretch" spacing={1}>
              {v2.local_breakdown.map((l, i) => (
                <HStack key={`${l.unit_id}-${i}`} spacing={2} align="start" fontSize="xs">
                  <Badge colorScheme="gray" fontSize="2xs" flexShrink={0}>
                    {l.unit_label || l.unit_id}
                  </Badge>
                  <Text color="gray.700" lineHeight="1.5">
                    {l.interpretation}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </Box>
        )}

        {/* 4. Design implication (highlighted) */}
        {v2.implication && (
          <Box bg="blue.50" border="1px solid" borderColor="blue.100" borderRadius="md" p={2}>
            <Text fontSize="2xs" fontWeight="bold" color="blue.700" textTransform="uppercase" mb={1}>
              Design implication
            </Text>
            <Text fontSize="sm" color="blue.900" lineHeight="1.5">
              {v2.implication}
            </Text>
          </Box>
        )}

        {data.cached && (
          <Text fontSize="2xs" color="gray.400">
            Cached · {data.model || 'unknown model'}
          </Text>
        )}
      </VStack>
    );
  }

  // ── v1 fallback (degraded) ────────────────────────────────────────
  return (
    <VStack align="stretch" spacing={2}>
      {data.degraded && (
        <Alert status="info" size="sm" fontSize="2xs" borderRadius="md">
          <AlertIcon />
          Structured view unavailable; showing the model's free-text reply.
        </Alert>
      )}
      <Text fontSize="sm" color="gray.700" lineHeight="1.6">
        {data.summary || '(no summary returned)'}
      </Text>
      {data.highlight_points?.length > 0 && (
        <Box pl={3}>
          {data.highlight_points.map((bullet, i) => (
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
      {data.cached && (
        <Text fontSize="2xs" color="gray.400">
          Cached · {data.model || 'unknown model'}
        </Text>
      )}
    </VStack>
  );
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
  /** #7-B — direct DOM ref to the Card node for SVG capture. Returning the
   * node lets exporters serialize the inner <svg> straight from the live DOM
   * without fragile aria-label CSS selectors. */
  getNode: () => HTMLElement | null;
}

/**
 * Wraps a single ChartDescriptor in a Chakra Card. Returns null when the
 * descriptor's data isn't available, so callers can just `.map()` over the
 * full registry without guards.
 */
export const ChartHost = forwardRef<ChartHostHandle, ChartHostProps>(
  function ChartHost(
    { descriptor, ctx, onHide, projectId, projectContext, showAiSummary = true, forceMount = false, onMount, projectSlug, groupingMode = 'zones' },
    ref,
  ) {
    const cardRef = useRef<HTMLDivElement | null>(null);
    const [hasIntersected, setHasIntersected] = useState(false);
    const [aiOpen, setAiOpen] = useState(true);
    const reportedMountRef = useRef(false);
    const toast = useToast();

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
      grouping_mode: groupingMode,
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
        getNode() {
          return cardRef.current;
        },
      }),
      [effectiveMounted, descriptor, ctx],
    );

    if (!descriptor.isAvailable(ctx)) return null;

    const tabular = descriptor.exportRows ? descriptor.exportRows(ctx) : null;
    const hasTabular = !!tabular && tabular.rows.length > 0;

    const handleExport = async (format: ExportFormat) => {
      try {
        await exportArtifact(
          {
            chartId: descriptor.id,
            projectSlug,
            groupingMode,
            node: cardRef.current,
            rows: tabular?.rows,
            columns: tabular?.columns,
            sheetName: descriptor.title.slice(0, 31),
          },
          format,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : `${format.toUpperCase()} export failed`;
        toast({ title: message, status: 'error', duration: 4000 });
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
              <MenuList minW="180px">
                <MenuGroup title="Export" fontSize="2xs" color="gray.500">
                  <MenuItem icon={<FileCode size={14} />} fontSize="sm" onClick={() => handleExport('svg')}>
                    SVG (vector)
                  </MenuItem>
                  <MenuItem icon={<FileImage size={14} />} fontSize="sm" onClick={() => handleExport('png')}>
                    PNG (300 dpi)
                  </MenuItem>
                  <MenuItem
                    icon={<FileText size={14} />}
                    fontSize="sm"
                    onClick={() => handleExport('csv')}
                    isDisabled={!hasTabular}
                  >
                    CSV {hasTabular ? '' : '(unavailable)'}
                  </MenuItem>
                  <MenuItem
                    icon={<FileSpreadsheet size={14} />}
                    fontSize="sm"
                    onClick={() => handleExport('xlsx')}
                    isDisabled={!hasTabular}
                  >
                    XLSX {hasTabular ? '' : '(unavailable)'}
                  </MenuItem>
                </MenuGroup>
                <MenuDivider />
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
                    <ChartSummaryView data={summaryQuery.data} />
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
