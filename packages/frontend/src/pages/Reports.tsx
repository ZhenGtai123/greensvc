import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Heading,
  Button,
  VStack,
  HStack,
  SimpleGrid,
  Card,
  CardHeader,
  CardBody,
  Text,
  Badge,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Alert,
  AlertIcon,
  Divider,
  Wrap,
  WrapItem,
  Tag,
  TagLabel,
  Icon,
  Tabs,
  TabList,
  Tab,
  TabPanel,
  TabPanels,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Tooltip,
} from '@chakra-ui/react';
import { Download, FileText, FileImage, FileSpreadsheet, CheckCircle, AlertTriangle, Sparkles, RefreshCw } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { generateReport } from '../utils/generateReport';
import { exportAnalysisExcel } from '../utils/exportExcel';
import { useGenerateReport, useRunDesignStrategies, useRunClusteringByProject } from '../hooks/useApi';
import useAppToast from '../hooks/useAppToast';
import PageShell from '../components/PageShell';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import {
  CHART_REGISTRY,
  SECTION_ORDER,
  type ChartSection,
} from '../components/analysisCharts/registry';
import { SectionHeading } from '../components/analysisCharts/SectionHeading';
import { ChartHost, type ChartHostHandle } from '../components/analysisCharts/ChartHost';
import { ChartPicker } from '../components/analysisCharts/ChartPicker';
import { buildChartContext } from '../components/analysisCharts/ChartContext';
import { ModeAlert } from '../components/analysisCharts/ModeAlert';
import { DataQualitySummary } from '../components/analysisCharts/DataQualitySummary';
import { LayerSelector } from '../components/analysisCharts/LayerSelector';
import { LAYER_OPTIONS } from '../components/analysisCharts/layerOptions';
import { AnalysisConfidenceGauge } from '../components/analysisCharts/AnalysisConfidenceGauge';
import { GlossaryDrawer } from '../components/GlossaryDrawer';
import {
  captureChartsForReport,
  waitForPaint,
  type CapturedChart,
} from '../utils/captureCharts';
import type { ReportRequest, ZoneDiagnostic, ZoneDesignOutput, ClusteringResponse } from '../types';

// ---------------------------------------------------------------------------
// Non-chart helpers (chart formatting is now in analysisCharts/registry.tsx)
// ---------------------------------------------------------------------------

// v6.0: deviation-based coloring (purely descriptive)
function deviationBgColor(meanAbsZ: number): string {
  if (meanAbsZ >= 1.5) return 'red.50';
  if (meanAbsZ >= 1.0) return 'orange.50';
  if (meanAbsZ >= 0.5) return 'yellow.50';
  return 'green.50';
}

function deviationColorScheme(meanAbsZ: number): string {
  if (meanAbsZ >= 1.5) return 'red';
  if (meanAbsZ >= 1.0) return 'orange';
  if (meanAbsZ >= 0.5) return 'yellow';
  return 'green';
}

// ---------------------------------------------------------------------------
// Simple markdown renderer (no external dependency)
// ---------------------------------------------------------------------------

function renderMarkdown(md: string) {
  const lines = md.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      elements.push(<Heading key={i} size="sm" mt={4} mb={2}>{line.slice(4)}</Heading>);
    } else if (line.startsWith('## ')) {
      elements.push(<Heading key={i} size="md" mt={5} mb={2} borderBottom="1px solid" borderColor="gray.200" pb={1}>{line.slice(3)}</Heading>);
    } else if (line.startsWith('# ')) {
      elements.push(<Heading key={i} size="lg" mt={6} mb={3}>{line.slice(2)}</Heading>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <Text key={i} fontSize="sm" pl={4} position="relative" _before={{ content: '"•"', position: 'absolute', left: '4px' }}>
          {line.slice(2)}
        </Text>
      );
    } else if (line.startsWith('> ')) {
      elements.push(
        <Box key={i} borderLeft="3px solid" borderColor="blue.300" pl={3} py={1} my={1} bg="blue.50" borderRadius="sm">
          <Text fontSize="sm" fontStyle="italic">{line.slice(2)}</Text>
        </Box>
      );
    } else if (line.startsWith('|') && line.includes('|')) {
      // Collect table rows
      const tableRows: string[] = [line];
      while (i + 1 < lines.length && lines[i + 1].startsWith('|')) {
        i++;
        tableRows.push(lines[i]);
      }
      const dataRows = tableRows.filter(r => !r.match(/^\|[\s-:|]+\|$/));
      if (dataRows.length > 0) {
        const headers = dataRows[0].split('|').filter(c => c.trim()).map(c => c.trim());
        const body = dataRows.slice(1).map(r => r.split('|').filter(c => c.trim()).map(c => c.trim()));
        elements.push(
          <Box key={i} overflowX="auto" my={2} maxW="100%">
            <Table size="sm" variant="simple" w="auto">
              <Thead><Tr>{headers.map((h, hi) => <Th key={hi} fontSize="xs" whiteSpace="nowrap">{h}</Th>)}</Tr></Thead>
              <Tbody>
                {body.map((row, ri) => (
                  <Tr key={ri}>{row.map((cell, ci) => <Td key={ci} fontSize="xs">{cell}</Td>)}</Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        );
      }
    } else if (line.trim() === '') {
      elements.push(<Box key={i} h={2} />);
    } else {
      // Apply inline formatting
      const formatted = line
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>');
      elements.push(
        <Text key={i} fontSize="sm" dangerouslySetInnerHTML={{ __html: formatted }} sx={{ '& code': { bg: 'gray.100', px: 1, borderRadius: 'sm', fontFamily: 'mono', fontSize: 'xs' }, '& strong': { fontWeight: 'bold' } }} />
      );
    }
    i++;
  }

  return <VStack align="stretch" spacing={0} w="100%" minW={0} sx={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{elements}</VStack>;
}

// ---------------------------------------------------------------------------
// Reports Component
// ---------------------------------------------------------------------------

/**
 * Walk the React Query cache for chart-summary entries belonging to the
 * current project and roll them into the analysis_narratives shape consumed
 * by the design-strategies endpoint. All current registry summaries are
 * cross-zone, so we file them under "_global".
 */
function collectAnalysisNarratives(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId: string | null | undefined,
): Record<string, Record<string, string>> {
  if (!projectId) return {};
  const queries = queryClient.getQueryCache().findAll({ queryKey: ['chart-summary'] });
  const globals: Record<string, string> = {};
  for (const q of queries) {
    const key = q.queryKey as unknown[];
    if (key[2] !== projectId) continue;
    const data = q.state.data as
      | { summary?: string; highlight_points?: string[] }
      | undefined;
    if (!data?.summary) continue;
    const chartId = String(key[1] ?? '');
    if (!chartId) continue;
    const bullets = data.highlight_points?.length
      ? '\n  • ' + data.highlight_points.join('\n  • ')
      : '';
    globals[chartId] = `${data.summary}${bullets}`;
  }
  if (Object.keys(globals).length === 0) return {};
  return { _global: globals };
}

function Reports() {
  const { projectId: routeProjectId } = useParams<{ projectId: string }>();
  const toast = useAppToast();
  const queryClient = useQueryClient();

  const {
    currentProject,
    recommendations,
    selectedIndicators,
    indicatorRelationships,
    recommendationSummary,
    zoneAnalysisResult,
    designStrategyResult,
    pipelineResult,
    aiReport,
    setAiReport,
    aiReportMeta,
    setAiReportMeta,
    hiddenChartIds,
    toggleChart,
    resetCharts,
    showAiSummary,
    setShowAiSummary,
    colorblindMode,
    setColorblindMode,
  } = useAppStore();

  const projectName = currentProject?.project_name || pipelineResult?.project_name || 'Unknown Project';

  // Agent C report
  const generateReportMutation = useGenerateReport();

  // Clustering + retry strategies
  const clusteringMutation = useRunClusteringByProject();
  const designStrategiesMutation = useRunDesignStrategies();
  const [clusteringResult, setClusteringResult] = useState<ClusteringResponse | null>(null);

  // Chart export plumbing (6.B(1)). chartRefs is populated by ref callbacks
  // on every ChartHost; exporting flips forceMount so lazy-loaded cards and
  // the clustering accordion render before captureChartsForReport runs.
  const chartRefs = useRef<Map<string, ChartHostHandle | null>>(new Map());
  const [exporting, setExporting] = useState(false);
  const setChartRef = useCallback((id: string) => (handle: ChartHostHandle | null) => {
    if (handle) chartRefs.current.set(id, handle);
    else chartRefs.current.delete(id);
  }, []);

  // Global layer selector — drives any chart with `layerAware: true`. Synced
  // to ?layer=... so reloads / shared links keep the view.
  const [searchParams, setSearchParams] = useSearchParams();
  const initialLayer = (() => {
    const fromUrl = searchParams.get('layer');
    if (fromUrl && LAYER_OPTIONS.some((o) => o.value === fromUrl)) return fromUrl;
    return 'full';
  })();
  const [selectedLayer, setSelectedLayer] = useState<string>(initialLayer);
  useEffect(() => {
    const current = searchParams.get('layer');
    if (selectedLayer === 'full') {
      if (current) {
        const next = new URLSearchParams(searchParams);
        next.delete('layer');
        setSearchParams(next, { replace: true });
      }
      return;
    }
    if (current === selectedLayer) return;
    const next = new URLSearchParams(searchParams);
    next.set('layer', selectedLayer);
    setSearchParams(next, { replace: true });
  }, [selectedLayer, searchParams, setSearchParams]);

  // Check if Stage 3 failed in pipeline
  const stage3Failed = pipelineResult?.steps?.some(s => s.step === 'design_strategies' && s.status === 'failed') ?? false;
  const stage3Error = stage3Failed
    ? pipelineResult?.steps?.find(s => s.step === 'design_strategies')?.detail ?? 'Unknown error'
    : null;

  const handleRetryStagе3 = useCallback(async () => {
    if (!zoneAnalysisResult) return;
    toast({ title: 'Retrying design strategies...', status: 'info', duration: 3000 });
    try {
      const narratives = collectAnalysisNarratives(queryClient, routeProjectId);
      const result = await designStrategiesMutation.mutateAsync({
        zone_analysis: zoneAnalysisResult,
        analysis_narratives: narratives,
        use_llm: true,
        project_id: routeProjectId ?? undefined,
      });
      useAppStore.getState().setDesignStrategyResult(result);
      // Stage 3 changed → backend cleared the cached AI report; mirror that
      // locally so the Report step's "done" indicator and the AI-report
      // card don't show stale content.
      useAppStore.getState().setAiReport(null);
      useAppStore.getState().setAiReportMeta(null);
      toast({ title: 'Design strategies generated', status: 'success' });
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || 'Strategy generation failed'
        : 'Strategy generation failed';
      toast({ title: msg, status: 'error' });
    }
  }, [zoneAnalysisResult, designStrategiesMutation, toast, queryClient, routeProjectId]);

  const handleRunClustering = useCallback(async () => {
    if (!zoneAnalysisResult || !currentProject) return;
    try {
      const indicatorIds = Object.keys(zoneAnalysisResult.indicator_definitions);
      const result = await clusteringMutation.mutateAsync({
        project_id: currentProject.id,
        indicator_ids: indicatorIds,
        layer: 'full',
      });
      setClusteringResult(result);
      if (result.skipped) {
        toast({ title: `Clustering skipped: ${result.reason}`, status: 'info', duration: 6000 });
      } else if (result.clustering) {
        useAppStore.getState().setZoneAnalysisResult({
          ...zoneAnalysisResult,
          clustering: result.clustering,
          segment_diagnostics: result.segment_diagnostics,
        });
        const gpsNote = result.n_points_with_gps ? ` · ${result.n_points_with_gps}/${result.n_points_used} with GPS` : '';
        toast({
          title: `${result.clustering.k} archetypes found (silhouette: ${result.clustering.silhouette_score.toFixed(2)})${gpsNote}`,
          status: 'success',
        });
      }
    } catch {
      toast({ title: 'Clustering failed', status: 'error' });
    }
  }, [zoneAnalysisResult, currentProject, clusteringMutation, toast]);

  const handleGenerateAiReport = useCallback(async () => {
    if (!zoneAnalysisResult) return;
    toast({ title: 'Generating AI report...', status: 'info', duration: 3000 });
    try {
      // Strip image_records before sending — they can be 10K+ entries and
      // the report service doesn't use them.  Keeps the HTTP body small.
      const { image_records: _ir, ...zoneAnalysisCompact } = zoneAnalysisResult;
      const request: ReportRequest = {
        zone_analysis: zoneAnalysisCompact as typeof zoneAnalysisResult,
        design_strategies: designStrategyResult ?? undefined,
        stage1_recommendations: recommendations.length > 0
          ? (recommendations as unknown as Record<string, unknown>[])
          : undefined,
        project_context: currentProject ? {
          project: { name: currentProject.project_name, location: currentProject.project_location },
          context: {
            climate: { koppen_zone_id: currentProject.koppen_zone_id },
            urban_form: { space_type_id: currentProject.space_type_id, lcz_type_id: currentProject.lcz_type_id },
            user: { age_group_id: currentProject.age_group_id },
          },
          performance_query: {
            design_brief: currentProject.design_brief,
            dimensions: currentProject.performance_dimensions,
          },
        } : undefined,
        format: 'markdown',
        project_id: routeProjectId ?? undefined,
      };
      const result = await generateReportMutation.mutateAsync(request);
      setAiReport(result.content);
      setAiReportMeta(result.metadata);
      const wc = Number(result.metadata?.word_count ?? 0);
      const dataWarning = result.metadata?.data_quality_warning as string | undefined;
      if (dataWarning) {
        toast({
          title: 'AI report generated with caveats',
          description: dataWarning,
          status: 'warning',
          duration: 8000,
        });
      } else if (wc < 100) {
        toast({
          title: 'AI report has minimal content',
          description: `Only ${wc} words returned — likely thin source data. Check that analysis charts have non-zero values.`,
          status: 'warning',
          duration: 8000,
        });
      } else {
        toast({ title: `AI report generated — ${wc} words`, status: 'success' });
      }
    } catch {
      toast({ title: 'AI report generation failed', status: 'error' });
    }
  }, [zoneAnalysisResult, designStrategyResult, recommendations, currentProject, generateReportMutation, toast, setAiReport, setAiReportMeta, routeProjectId]);

  // Completion status
  const hasVision = (currentProject?.uploaded_images?.length ?? 0) > 0;
  const hasIndicators = recommendations.length > 0;
  const hasAnalysis = zoneAnalysisResult !== null;
  const hasDesign = designStrategyResult !== null || pipelineResult?.design_strategies !== null && pipelineResult?.design_strategies !== undefined;
  const isEmpty = !hasIndicators && !hasAnalysis && !hasDesign;

  const steps = [
    { name: 'Vision', done: hasVision },
    { name: 'Indicators', done: hasIndicators },
    { name: 'Analysis', done: hasAnalysis },
    { name: 'Design', done: hasDesign },
  ];
  const completedSteps = steps.filter(s => s.done).length;

  // Unified chart context (memoized — cheap, recomputes only when inputs change)
  const chartCtx = useMemo(
    () =>
      buildChartContext({
        zoneAnalysisResult,
        pipelineResult: pipelineResult ?? null,
        clusteringResult,
        currentProject: currentProject ?? null,
        selectedLayer,
        colorblindMode,
      }),
    [zoneAnalysisResult, pipelineResult, clusteringResult, currentProject, selectedLayer, colorblindMode],
  );

  // Compact project context handed to chart-summary requests so LLM grounding
  // doesn't require a separate fetch per chart.
  const chartProjectContext = useMemo<Record<string, unknown> | null>(() => {
    if (!currentProject) return null;
    return {
      project_name: currentProject.project_name,
      project_location: currentProject.project_location,
      koppen_zone: currentProject.koppen_zone_id,
      space_type: currentProject.space_type_id,
      lcz_type: currentProject.lcz_type_id,
      age_group: currentProject.age_group_id,
      performance_dimensions: currentProject.performance_dimensions,
      design_brief: currentProject.design_brief,
    };
  }, [currentProject]);

  const hiddenSet = useMemo(() => new Set(hiddenChartIds), [hiddenChartIds]);
  // Unified analysis tab — all 'analysis' charts (formerly split between diagnostics+statistics)
  const analysisCharts = useMemo(
    () => CHART_REGISTRY.filter(c => c.tab === 'analysis' && !hiddenSet.has(c.id)),
    [hiddenSet],
  );
  const clusteringCharts = useMemo(
    () => analysisCharts.filter(c => c.section === 'clustering'),
    [analysisCharts],
  );
  // Group non-clustering charts by section so Reports.tsx can render
  // sub-headings (5.10.2). Sections that have zero available charts (after
  // ChartHost's own isAvailable check) still render their group header but
  // the rendered list will be empty — handled with a fallback in the JSX.
  const sectionedCharts = useMemo(() => {
    const grouped: Partial<Record<ChartSection, typeof analysisCharts>> = {};
    for (const c of analysisCharts) {
      if (c.section === 'clustering') continue;
      const list = grouped[c.section] ?? [];
      list.push(c);
      grouped[c.section] = list;
    }
    return grouped;
  }, [analysisCharts]);
  const sortedDiagnostics = chartCtx.sortedDiagnostics;

  // Pull cached chart-summary captions out of React Query so embedded images
  // get human-readable captions when the user has generated them.
  const captionFor = useCallback(
    (chartId: string): string | null => {
      const queries = queryClient.getQueryCache().findAll({ queryKey: ['chart-summary'] });
      for (const q of queries) {
        const key = q.queryKey as unknown[];
        if (key[1] !== chartId) continue;
        if (key[2] !== routeProjectId) continue;
        const data = q.state.data as { summary?: string } | undefined;
        if (data?.summary) return data.summary;
      }
      return null;
    },
    [queryClient, routeProjectId],
  );

  // Capture all exportByDefault charts. Sets `exporting` so lazy-loaded cards
  // and the clustering accordion render before html2canvas runs.
  const captureChartsForDownload = useCallback(async (): Promise<CapturedChart[]> => {
    if (!hasAnalysis) return [];
    setExporting(true);
    try {
      // Two paint frames — first lets React commit `exporting=true`,
      // second lets ChartHosts unfold lazy bodies + the accordion.
      await waitForPaint();
      await waitForPaint();
      return await captureChartsForReport({
        charts: CHART_REGISTRY.filter((c) => c.tab === 'analysis'),
        ctx: chartCtx,
        refs: chartRefs.current,
        captionFor,
      });
    } finally {
      setExporting(false);
    }
  }, [hasAnalysis, chartCtx, captionFor]);

  // Downloads
  const handleDownloadMarkdown = useCallback(async () => {
    if (!zoneAnalysisResult) return;
    toast({ title: 'Capturing charts…', status: 'info', duration: 2000 });
    const chartImages = await captureChartsForDownload();
    const md = generateReport({
      projectName,
      pipelineResult,
      zoneResult: zoneAnalysisResult,
      designResult: designStrategyResult,
      radarProfiles: zoneAnalysisResult.radar_profiles ?? null,
      correlationByLayer: zoneAnalysisResult.correlation_by_layer ?? null,
      chartImages,
    });
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}_report.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast({
      title: chartImages.length > 0
        ? `Report downloaded — ${chartImages.length} chart(s) embedded`
        : 'Report downloaded (no charts captured)',
      status: 'success',
    });
  }, [zoneAnalysisResult, captureChartsForDownload, projectName, pipelineResult, designStrategyResult, toast]);

  const handleExportJson = () => {
    // Per-image metrics: flatten uploaded_images to id + zone + GPS + metrics
    const imageMetrics = currentProject?.uploaded_images?.map(img => ({
      image_id: img.image_id,
      filename: img.filename,
      zone_id: img.zone_id,
      has_gps: img.has_gps,
      latitude: img.latitude,
      longitude: img.longitude,
      metrics: img.metrics_results,
    })) ?? [];

    const data = {
      project_name: projectName,
      project_location: currentProject?.project_location ?? null,
      exported_at: new Date().toISOString(),
      recommendations,
      selected_indicators: selectedIndicators,
      image_metrics: imageMetrics,
      zone_analysis: zoneAnalysisResult,
      design_strategies: designStrategyResult,
      pipeline_result: pipelineResult,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.replace(/\s+/g, '_')}_data.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'JSON exported', status: 'success' });
  };

  const handleExportExcel = async () => {
    try {
      await exportAnalysisExcel({
        projectName,
        images: currentProject?.uploaded_images ?? [],
        zoneStats: zoneAnalysisResult?.zone_statistics ?? [],
        diagnostics: zoneAnalysisResult?.zone_diagnostics ?? [],
        correlationByLayer: zoneAnalysisResult?.correlation_by_layer ?? null,
        pvalueByLayer: zoneAnalysisResult?.pvalue_by_layer ?? null,
        globalStats: zoneAnalysisResult?.global_indicator_stats ?? [],
      });
      toast({ title: 'Excel exported', status: 'success' });
    } catch {
      toast({ title: 'Excel export failed', status: 'error' });
    }
  };

  const handleDownloadPdf = useCallback(async () => {
    if (!zoneAnalysisResult) return;
    toast({ title: 'Capturing charts…', status: 'info', duration: 2000 });
    try {
      const chartImages = await captureChartsForDownload();
      const { jsPDF } = await import('jspdf');
      const md = generateReport({
        projectName,
        pipelineResult,
        zoneResult: zoneAnalysisResult,
        designResult: designStrategyResult,
        radarProfiles: zoneAnalysisResult.radar_profiles ?? null,
        correlationByLayer: zoneAnalysisResult.correlation_by_layer ?? null,
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const margin = 15;
      const pageW = 210 - margin * 2;
      const pageH = 297 - margin * 2;
      let y = margin;

      const addText = (text: string, size: number, style: 'normal' | 'bold' = 'normal') => {
        pdf.setFontSize(size);
        pdf.setFont('helvetica', style);
        const lines = pdf.splitTextToSize(text, pageW);
        for (const line of lines) {
          if (y + size * 0.4 > margin + pageH) {
            pdf.addPage();
            y = margin;
          }
          pdf.text(line, margin, y);
          y += size * 0.45;
        }
      };

      const addChartImage = (chart: CapturedChart) => {
        // Equal-aspect resize: cap width at pageW, scale height proportionally,
        // then if it would overflow 60% of the page height shrink to fit.
        const aspect = chart.heightPx > 0 ? chart.widthPx / chart.heightPx : 1;
        let imgW = pageW;
        let imgH = imgW / aspect;
        const maxH = pageH * 0.6;
        if (imgH > maxH) {
          imgH = maxH;
          imgW = imgH * aspect;
        }
        if (y + imgH + 12 > margin + pageH) {
          pdf.addPage();
          y = margin;
        }
        addText(chart.title, 11, 'bold');
        try {
          pdf.addImage(chart.dataURL, 'PNG', margin, y, imgW, imgH, undefined, 'FAST');
        } catch (err) {
          console.warn('PDF addImage failed for', chart.chart_id, err);
        }
        y += imgH + 2;
        if (chart.caption) {
          pdf.setFontSize(8);
          pdf.setFont('helvetica', 'italic');
          pdf.setTextColor(110);
          const captionLines = pdf.splitTextToSize(chart.caption, pageW);
          for (const line of captionLines) {
            if (y + 4 > margin + pageH) { pdf.addPage(); y = margin; }
            pdf.text(line, margin, y);
            y += 3.5;
          }
          pdf.setTextColor(0);
          pdf.setFont('helvetica', 'normal');
        }
        y += 4;
      };

      // Title page
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text(projectName, margin, 40);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      pdf.text('SceneRx Analysis Report', margin, 50);
      pdf.text(new Date().toLocaleDateString(), margin, 58);
      if (pipelineResult) {
        pdf.setFontSize(10);
        pdf.text(`Images: ${pipelineResult.zone_assigned_images}/${pipelineResult.total_images}`, margin, 70);
        pdf.text(`Calculations: ${pipelineResult.calculations_succeeded} succeeded`, margin, 76);
        pdf.text(`Zone Stats: ${pipelineResult.zone_statistics_count}`, margin, 82);
        pdf.text(`Zones: ${sortedDiagnostics.length}`, margin, 88);
        if (chartImages.length > 0) {
          pdf.text(`Embedded Charts: ${chartImages.length}`, margin, 94);
        }
      }
      pdf.addPage();
      y = margin;

      // Embedded charts page (right after title, before text body)
      if (chartImages.length > 0) {
        addText('Charts', 16, 'bold');
        y += 2;
        for (const chart of chartImages) {
          addChartImage(chart);
        }
        pdf.addPage();
        y = margin;
      }

      // Render markdown content (text body — image lines already embedded above)
      for (const line of md.split('\n')) {
        if (line.startsWith('![')) continue; // images already embedded
        if (line.startsWith('### ')) {
          y += 2;
          addText(line.slice(4), 12, 'bold');
          y += 1;
        } else if (line.startsWith('## ')) {
          y += 3;
          addText(line.slice(3), 14, 'bold');
          y += 1;
        } else if (line.startsWith('# ')) {
          y += 4;
          addText(line.slice(2), 16, 'bold');
          y += 2;
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          addText(`  \u2022 ${line.slice(2)}`, 10);
        } else if (line.startsWith('|') && !line.match(/^\|[\s-:|]+\|$/)) {
          // Table rows — render as tab-separated text
          const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
          addText(cells.join('    '), 9);
        } else if (line.trim() === '') {
          y += 2;
        } else {
          const clean = line
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/`(.+?)`/g, '$1');
          addText(clean, 10);
        }
      }

      // Footer with page numbers
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(150);
        pdf.text(`${projectName} — Page ${i}/${totalPages}`, 105, 290, { align: 'center' });
        pdf.setTextColor(0);
      }

      pdf.save(`${projectName.replace(/\s+/g, '_')}_report.pdf`);
      toast({
        title: chartImages.length > 0
          ? `PDF downloaded — ${chartImages.length} chart(s) embedded`
          : 'PDF downloaded',
        status: 'success',
      });
    } catch (err) {
      console.error('PDF generation failed', err);
      toast({ title: 'PDF generation failed', status: 'error' });
    }
  }, [zoneAnalysisResult, designStrategyResult, pipelineResult, projectName, sortedDiagnostics, toast, captureChartsForDownload]);

  const handleDownloadAiReportPdf = useCallback(async () => {
    if (!aiReport) return;
    toast({ title: 'Generating PDF...', status: 'info', duration: 2000 });
    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const margin = 15;
      const pageW = 210 - margin * 2;
      const pageH = 297 - margin * 2;
      let y = margin;

      const addText = (text: string, size: number, style: 'normal' | 'bold' = 'normal') => {
        pdf.setFontSize(size);
        pdf.setFont('helvetica', style);
        const lines = pdf.splitTextToSize(text, pageW);
        for (const line of lines) {
          if (y + size * 0.4 > margin + pageH) {
            pdf.addPage();
            y = margin;
          }
          pdf.text(line, margin, y);
          y += size * 0.45;
        }
      };

      for (const line of aiReport.split('\n')) {
        if (line.startsWith('### ')) {
          y += 2;
          addText(line.slice(4), 12, 'bold');
          y += 1;
        } else if (line.startsWith('## ')) {
          y += 3;
          addText(line.slice(3), 14, 'bold');
          y += 1;
        } else if (line.startsWith('# ')) {
          y += 4;
          addText(line.slice(2), 16, 'bold');
          y += 2;
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          addText(`  \u2022 ${line.slice(2)}`, 10);
        } else if (line.trim() === '') {
          y += 3;
        } else {
          // Strip markdown bold/italic for PDF
          const clean = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1');
          addText(clean, 10);
        }
      }

      pdf.save(`${projectName.replace(/\s+/g, '_')}_ai_report.pdf`);
      toast({ title: 'PDF downloaded', status: 'success' });
    } catch {
      toast({ title: 'PDF generation failed', status: 'error' });
    }
  }, [aiReport, projectName, toast]);

  return (
    <PageShell>
      <PageHeader title="Results & Report">
        <HStack spacing={2}>
          <GlossaryDrawer />
          {hasAnalysis && (
            <ChartPicker
              hiddenIds={hiddenChartIds}
              onToggle={toggleChart}
              onReset={resetCharts}
              showAiSummary={showAiSummary}
              onShowAiSummaryChange={setShowAiSummary}
              colorblindMode={colorblindMode}
              onColorblindModeChange={setColorblindMode}
            />
          )}
          <Tooltip label="Readable report with zone diagnostics, correlations, and design strategies" placement="bottom" hasArrow>
            <Button size="sm" leftIcon={<Download size={14} />} onClick={handleDownloadMarkdown} isDisabled={!hasAnalysis} colorScheme="blue">
              Report (.md)
            </Button>
          </Tooltip>
          <Tooltip label="Same report content as Markdown, formatted as PDF" placement="bottom" hasArrow>
            <Button size="sm" leftIcon={<FileImage size={14} />} onClick={handleDownloadPdf} isDisabled={!hasAnalysis} colorScheme="green">
              Report (.pdf)
            </Button>
          </Tooltip>
          <Tooltip label="Multi-sheet spreadsheet: image metrics, zone statistics, correlations, and global stats" placement="bottom" hasArrow>
            <Button size="sm" leftIcon={<FileSpreadsheet size={14} />} onClick={handleExportExcel} isDisabled={isEmpty} colorScheme="teal">
              Data (.xlsx)
            </Button>
          </Tooltip>
          <Tooltip label="Complete raw data dump: all pipeline results, zone analysis, and per-image metrics" placement="bottom" hasArrow>
            <Button size="sm" leftIcon={<FileText size={14} />} onClick={handleExportJson} isDisabled={isEmpty} variant="outline">
              Raw (.json)
            </Button>
          </Tooltip>
        </HStack>
      </PageHeader>

      {isEmpty ? (
        pipelineResult !== null ? (
          <EmptyState
            icon={AlertTriangle}
            title="Pipeline finished but the result didn't reach the browser"
            description={
              `The backend reported ${pipelineResult.zone_statistics_count} zone-stat ` +
              `record(s) and ${pipelineResult.calculations_succeeded} successful calculations, ` +
              `but the streamed result event was lost in transit (most often a proxy or buffer ` +
              `truncating a multi-MB SSE chunk). Re-run the pipeline; if it persists, check the ` +
              `browser console for "[Pipeline SSE] Failed to parse event" and the network tab ` +
              `for the final data: line of /api/analysis/project-pipeline/stream.`
            }
          />
        ) : (
          <EmptyState
            icon={AlertTriangle}
            title="No results yet"
            description="Run the analysis pipeline first, then come back here to view results and generate reports."
          />
        )
      ) : (
        <Box>
          {/* Pipeline Overview */}
          <Card mb={6} role="region" aria-label="Pipeline overview">
            <CardHeader>
              <HStack justify="space-between">
                <Heading size="md">Pipeline Overview</Heading>
                <Text fontSize="sm" color="gray.500">{completedSteps}/{steps.length} steps</Text>
              </HStack>
            </CardHeader>
            <CardBody>
              <HStack spacing={4} flexWrap="wrap" mb={3}>
                {steps.map(s => (
                  <HStack key={s.name} spacing={1}>
                    <Icon as={s.done ? CheckCircle : AlertTriangle} color={s.done ? 'green.500' : 'gray.400'} boxSize={4} />
                    <Text fontSize="sm" color={s.done ? 'green.600' : 'gray.500'}>{s.name}</Text>
                  </HStack>
                ))}
              </HStack>
              {pipelineResult && (
                <SimpleGrid columns={{ base: 2, md: 5 }} spacing={3}>
                  <Box><Text fontSize="xs" color="gray.500">Images</Text><Text fontWeight="bold">{pipelineResult.zone_assigned_images}/{pipelineResult.total_images}</Text></Box>
                  <Box><Text fontSize="xs" color="gray.500">Calculations</Text><Text fontWeight="bold" color="green.600">{pipelineResult.calculations_succeeded} OK</Text></Box>
                  <Box><Text fontSize="xs" color="gray.500">Zone Stats</Text><Text fontWeight="bold">{pipelineResult.zone_statistics_count}</Text></Box>
                  <Box><Text fontSize="xs" color="gray.500">Zones</Text><Text fontWeight="bold">{sortedDiagnostics.length}</Text></Box>
                  <Box>
                    <Text fontSize="xs" color="gray.500">GPS Coverage</Text>
                    <Text fontWeight="bold" color={chartCtx.gpsImages.length > 0 ? 'green.600' : 'gray.400'}>
                      {chartCtx.gpsImages.length}/{currentProject?.uploaded_images?.length ?? 0}
                      {currentProject?.uploaded_images?.length ? ` (${Math.round(chartCtx.gpsImages.length / currentProject.uploaded_images.length * 100)}%)` : ''}
                    </Text>
                  </Box>
                </SimpleGrid>
              )}
            </CardBody>
          </Card>

          {/* AI Report Section — always visible when analysis exists */}
          {hasAnalysis && (
            <Card
              mb={6}
              borderColor={aiReport ? 'purple.300' : 'gray.200'}
              borderWidth={aiReport ? 2 : 1}
              overflow="hidden"
              role="region"
              aria-label="AI-generated report"
            >
              <CardHeader>
                <VStack align="stretch" spacing={3}>
                  <HStack spacing={2} flexWrap="wrap">
                    <Icon as={Sparkles} color="purple.500" boxSize={5} />
                    <Heading size="md">AI Report</Heading>
                    {!aiReport && <Badge colorScheme="gray" variant="subtle">Not generated</Badge>}
                    {aiReportMeta && (
                      <Badge colorScheme="purple" variant="subtle">
                        {String(aiReportMeta.word_count || '?')} words
                      </Badge>
                    )}
                    <Box flex="1" />
                    <AnalysisConfidenceGauge
                      ctx={chartCtx}
                      aiReportWordCount={
                        aiReportMeta?.word_count != null
                          ? Number(aiReportMeta.word_count)
                          : null
                      }
                    />
                  </HStack>
                  <HStack spacing={2} flexWrap="wrap">
                    <Button
                      size="sm"
                      leftIcon={<Sparkles size={14} />}
                      onClick={handleGenerateAiReport}
                      isLoading={generateReportMutation.isPending}
                      loadingText="Generating..."
                      colorScheme="purple"
                    >
                      {aiReport ? 'Regenerate' : 'Generate AI Report'}
                    </Button>
                    {aiReport && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => {
                          const blob = new Blob([aiReport], { type: 'text/markdown' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${projectName.replace(/\s+/g, '_')}_ai_report.md`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}>
                          Download MD
                        </Button>
                        <Button size="sm" colorScheme="green" variant="outline" leftIcon={<FileImage size={12} />} onClick={handleDownloadAiReportPdf}>
                          Download PDF
                        </Button>
                      </>
                    )}
                  </HStack>
                </VStack>
              </CardHeader>
              {aiReport && (
                <CardBody pt={0}>
                  <Box maxH="70vh" overflowY="auto" p={4} bg="white" borderRadius="md" border="1px solid" borderColor="gray.100">
                    {renderMarkdown(aiReport)}
                  </Box>
                </CardBody>
              )}
            </Card>
          )}

          {/* Main Tabs */}
          <Tabs colorScheme="blue" variant="enclosed" mb={6}>
            <TabList>
              <Tab>Analysis</Tab>
              {hasAnalysis && <Tab>Design Strategies {stage3Failed && <Badge colorScheme="red" ml={1} fontSize="2xs">failed</Badge>}</Tab>}
              <Tab>Indicators</Tab>
            </TabList>

            <TabPanels>
              {/* ── Tab: Analysis (unified — replaces former Diagnostics + Statistics) ── */}
              <TabPanel px={0}>
                {/* Sticky layer selector — drives any layerAware chart */}
                <Box
                  position="sticky"
                  top={0}
                  zIndex={2}
                  bg="white"
                  borderBottom="1px solid"
                  borderColor="gray.200"
                  py={2}
                  px={1}
                  mb={3}
                >
                  <HStack justify="space-between" flexWrap="wrap" gap={2}>
                    <LayerSelector value={selectedLayer} onChange={setSelectedLayer} />
                    <Text fontSize="xs" color="gray.500">
                      Layer-independent charts ignore this selector.
                    </Text>
                  </HStack>
                </Box>

                {/* Single-zone / image-level mode banner */}
                <ModeAlert
                  analysisMode={chartCtx.analysisMode}
                  zoneSource={chartCtx.zoneSource}
                  projectId={routeProjectId ?? null}
                  zoneCount={
                    currentProject?.spatial_zones?.length ?? sortedDiagnostics.length
                  }
                  imageCount={chartCtx.imageRecords.length}
                  onRunClustering={handleRunClustering}
                  isClusteringRunning={clusteringMutation.isPending}
                  canRunClustering={!!currentProject}
                />

                {/* Data Quality summary — surfaces report warning + key metrics */}
                <DataQualitySummary
                  ctx={chartCtx}
                  reportWarning={
                    (aiReportMeta?.data_quality_warning as string | undefined) ?? null
                  }
                />

                {/* Computation warnings */}
                {zoneAnalysisResult?.computation_metadata?.warnings?.length ? (
                  <Alert status="warning" mb={4} borderRadius="md" alignItems="flex-start">
                    <AlertIcon />
                    <Box>
                      <Text fontWeight="bold" fontSize="sm">Analysis warnings</Text>
                      <VStack align="stretch" spacing={0} mt={1}>
                        {zoneAnalysisResult.computation_metadata.warnings.map((w, i) => (
                          <Text key={i} fontSize="xs" color="gray.700">• {w}</Text>
                        ))}
                      </VStack>
                    </Box>
                  </Alert>
                ) : null}

                {sortedDiagnostics.length > 0 && (
                  <VStack spacing={6} align="stretch">
                    {/* Zone Cards */}
                    <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 4 }} spacing={4}>
                      {sortedDiagnostics.map((diag: ZoneDiagnostic) => (
                        <Card key={diag.zone_id} bg={deviationBgColor(diag.mean_abs_z)}>
                          <CardBody>
                            <VStack align="stretch" spacing={2}>
                              <HStack justify="space-between">
                                <HStack spacing={1}>
                                  {diag.rank > 0 && <Badge colorScheme="purple" fontSize="xs">#{diag.rank}</Badge>}
                                  <Text fontWeight="bold" fontSize="sm" noOfLines={1}>{diag.zone_name}</Text>
                                </HStack>
                                <Badge colorScheme={deviationColorScheme(diag.mean_abs_z)}>|z|={diag.mean_abs_z?.toFixed(2) ?? '—'}</Badge>
                              </HStack>
                              <HStack justify="space-between"><Text fontSize="xs" color="gray.600">Mean |z|</Text><Text fontWeight="bold">{diag.mean_abs_z?.toFixed(2) ?? '—'}</Text></HStack>
                              <HStack justify="space-between"><Text fontSize="xs" color="gray.600">Points</Text><Text fontWeight="bold">{diag.point_count}</Text></HStack>
                            </VStack>
                          </CardBody>
                        </Card>
                      ))}
                    </SimpleGrid>

                    {/* Sectioned analysis charts (5.10.2 — narrative ordering) */}
                    {SECTION_ORDER.filter(s => s !== 'clustering').map(section => {
                      const charts = sectionedCharts[section] ?? [];
                      if (charts.length === 0) return null;
                      const visibleCount = charts.filter(c => c.isAvailable(chartCtx)).length;
                      if (visibleCount === 0) return null;
                      return (
                        <Box key={section}>
                          <SectionHeading section={section} />
                          <VStack spacing={4} align="stretch">
                            {charts.map(chart => (
                              <ChartHost
                                key={chart.id}
                                ref={setChartRef(chart.id)}
                                descriptor={chart}
                                ctx={chartCtx}
                                onHide={toggleChart}
                                projectId={routeProjectId ?? null}
                                projectContext={chartProjectContext}
                                showAiSummary={showAiSummary}
                                forceMount={exporting}
                              />
                            ))}
                          </VStack>
                        </Box>
                      );
                    })}

                    {/* GPS coverage hint — shown when no spatial charts rendered */}
                    {chartCtx.gpsImages.length === 0 && (
                      <Alert status="info" borderRadius="md" variant="left-accent">
                        <AlertIcon />
                        <Box>
                          <Text fontSize="sm" fontWeight="bold">Spatial Distribution Charts unavailable</Text>
                          <Text fontSize="xs" color="gray.600">
                            None of the images have GPS coordinates (EXIF lat/lng). Spatial scatter maps require at least a few geo-located images — they don't need 100% coverage.
                            If some images have GPS, they will appear automatically.
                          </Text>
                        </Box>
                      </Alert>
                    )}

                    {/* Clustering — collapsed group (5.9). Forced open during
                        report export so the inner ChartHosts get a chance to
                        render before captureChartsForReport runs. */}
                    <Accordion allowToggle index={exporting ? [0] : undefined}>
                      <AccordionItem border="1px solid" borderColor="gray.200" borderRadius="md">
                        <AccordionButton bg="gray.50" _hover={{ bg: 'gray.100' }}>
                          <Box flex="1" textAlign="left">
                            <HStack spacing={2}>
                              <Text fontWeight="bold" fontSize="sm">SVC Archetype Clustering</Text>
                              {clusteringResult?.clustering && (
                                <Badge colorScheme="green" fontSize="2xs">
                                  k={clusteringResult.clustering.k} · silhouette={clusteringResult.clustering.silhouette_score.toFixed(2)}
                                </Badge>
                              )}
                              {clusteringResult?.skipped && (
                                <Badge colorScheme="yellow" fontSize="2xs">{clusteringResult.reason}</Badge>
                              )}
                            </HStack>
                            <Text fontSize="xs" color="gray.500" mt={0.5}>
                              Discover spatial archetypes via KMeans on image-level metrics (requires 10+ images with computed indicators).
                            </Text>
                          </Box>
                          <AccordionIcon />
                        </AccordionButton>
                        <AccordionPanel pb={4}>
                          <VStack align="stretch" spacing={4}>
                            <HStack justify="flex-end">
                              <Button
                                size="sm"
                                colorScheme="teal"
                                variant="outline"
                                onClick={handleRunClustering}
                                isLoading={clusteringMutation.isPending}
                                isDisabled={!currentProject}
                              >
                                {clusteringResult?.clustering ? 'Re-run Clustering' : 'Run Clustering'}
                              </Button>
                            </HStack>
                            {clusteringResult?.clustering && clusteringResult.clustering.archetype_profiles.length > 0 && (
                              <Wrap spacing={2}>
                                {clusteringResult.clustering.archetype_profiles.map(a => (
                                  <WrapItem key={a.archetype_id}>
                                    <Tag size="sm" colorScheme="teal" variant="subtle">
                                      <TagLabel>Archetype {a.archetype_id}: {a.archetype_label} ({a.point_count} pts)</TagLabel>
                                    </Tag>
                                  </WrapItem>
                                ))}
                              </Wrap>
                            )}
                            {clusteringCharts.map(chart => (
                              <ChartHost
                                key={chart.id}
                                ref={setChartRef(chart.id)}
                                descriptor={chart}
                                ctx={chartCtx}
                                onHide={toggleChart}
                                projectId={routeProjectId ?? null}
                                projectContext={chartProjectContext}
                                showAiSummary={showAiSummary}
                                forceMount={exporting}
                              />
                            ))}
                          </VStack>
                        </AccordionPanel>
                      </AccordionItem>
                    </Accordion>
                  </VStack>
                )}
              </TabPanel>

              {/* ── Tab: Design Strategies ── */}
              {hasAnalysis && (
                <TabPanel px={0}>
                  {/* Stage 3 failed — show retry */}
                  {(stage3Failed || !hasDesign) && (
                    <Alert status={stage3Failed ? 'error' : 'info'} mb={4} borderRadius="md">
                      <AlertIcon />
                      <Box flex="1">
                        <Text fontWeight="bold" fontSize="sm">
                          {stage3Failed ? 'Design strategy generation failed' : 'No design strategies yet'}
                        </Text>
                        {stage3Error && <Text fontSize="xs" color="gray.600" mt={1}>{stage3Error}</Text>}
                      </Box>
                      <Button
                        size="sm"
                        leftIcon={<RefreshCw size={14} />}
                        colorScheme={stage3Failed ? 'red' : 'blue'}
                        variant="outline"
                        onClick={handleRetryStagе3}
                        isLoading={designStrategiesMutation.isPending}
                        loadingText="Running..."
                        ml={3}
                        flexShrink={0}
                      >
                        {stage3Failed ? 'Retry Stage 3' : 'Generate Strategies'}
                      </Button>
                    </Alert>
                  )}

                  {hasDesign && <Accordion allowMultiple defaultIndex={[0]}>
                    {Object.entries(designStrategyResult!.zones).map(([zoneId, zone]: [string, ZoneDesignOutput]) => (
                      <AccordionItem key={zoneId}>
                        <AccordionButton>
                          <HStack flex="1" justify="space-between" pr={2}>
                            <HStack spacing={3}>
                              <Text fontWeight="bold">{zone.zone_name}</Text>
                              <Badge colorScheme={deviationColorScheme(zone.mean_abs_z)}>|z|={zone.mean_abs_z?.toFixed(2) ?? '—'}</Badge>
                            </HStack>
                            <Text fontSize="sm" color="gray.500">{zone.design_strategies.length} strategies</Text>
                          </HStack>
                          <AccordionIcon />
                        </AccordionButton>
                        <AccordionPanel>
                          <VStack align="stretch" spacing={4}>
                            {zone.overall_assessment && (
                              <Alert status="info" variant="left-accent"><AlertIcon /><Text fontSize="sm">{zone.overall_assessment}</Text></Alert>
                            )}

                            {zone.design_strategies.map((strategy, idx) => (
                              <Card key={idx} variant="outline">
                                <CardBody>
                                  <VStack align="stretch" spacing={3}>
                                    <HStack justify="space-between">
                                      <HStack spacing={2}>
                                        <Badge colorScheme="purple">P{strategy.priority}</Badge>
                                        <Text fontWeight="bold" fontSize="sm">{strategy.strategy_name}</Text>
                                      </HStack>
                                      <Badge colorScheme={strategy.confidence === 'High' ? 'green' : strategy.confidence === 'Medium' ? 'yellow' : 'gray'}>
                                        {strategy.confidence}
                                      </Badge>
                                    </HStack>

                                    <Wrap>{strategy.target_indicators.map(ind => <WrapItem key={ind}><Tag size="sm" colorScheme="blue"><TagLabel>{ind}</TagLabel></Tag></WrapItem>)}</Wrap>

                                    {strategy.spatial_location && (
                                      <Text fontSize="xs" color="gray.600"><Text as="span" fontWeight="bold">Location:</Text> {strategy.spatial_location}</Text>
                                    )}

                                    <Box bg="gray.50" p={3} borderRadius="md">
                                      <Text fontSize="xs" fontWeight="bold" mb={1}>Intervention</Text>
                                      <SimpleGrid columns={2} spacing={1} fontSize="xs">
                                        <Text><strong>Object:</strong> {strategy.intervention.object}</Text>
                                        <Text><strong>Action:</strong> {strategy.intervention.action}</Text>
                                        <Text><strong>Variable:</strong> {strategy.intervention.variable}</Text>
                                      </SimpleGrid>
                                      {strategy.intervention.specific_guidance && <Text fontSize="xs" mt={1} fontStyle="italic">{strategy.intervention.specific_guidance}</Text>}
                                    </Box>

                                    {strategy.signatures && strategy.signatures.length > 0 && (
                                      <Box>
                                        <Text fontSize="xs" fontWeight="bold" mb={1}>Signatures</Text>
                                        <Wrap>
                                          {strategy.signatures.slice(0, 4).map((sig, si) => (
                                            <WrapItem key={si}>
                                              <Tag size="sm" colorScheme="teal" variant="subtle">
                                                <TagLabel>{sig.operation?.name || '?'} x {sig.semantic_layer?.name || '?'} @ {sig.spatial_layer?.name || '?'} / {sig.morphological_layer?.name || '?'}</TagLabel>
                                              </Tag>
                                            </WrapItem>
                                          ))}
                                        </Wrap>
                                      </Box>
                                    )}

                                    {strategy.pathway?.mechanism_description && (
                                      <Text fontSize="xs" color="blue.600" fontStyle="italic">
                                        <Text as="span" fontWeight="bold">Pathway:</Text> {strategy.pathway.pathway_type?.name ? `(${strategy.pathway.pathway_type.name}) ` : ''}{strategy.pathway.mechanism_description}
                                      </Text>
                                    )}

                                    {strategy.expected_effects.length > 0 && (
                                      <Box>
                                        <Text fontSize="xs" fontWeight="bold" mb={1}>Expected Effects</Text>
                                        <Wrap>{strategy.expected_effects.map((eff, i) => <WrapItem key={i}><Tag size="sm" colorScheme={eff.direction === 'increase' ? 'green' : 'red'}><TagLabel>{eff.indicator} {eff.direction} ({eff.magnitude})</TagLabel></Tag></WrapItem>)}</Wrap>
                                      </Box>
                                    )}

                                    {strategy.potential_tradeoffs && <Text fontSize="xs" color="orange.600"><Text as="span" fontWeight="bold">Tradeoffs:</Text> {strategy.potential_tradeoffs}</Text>}
                                    {strategy.boundary_effects && <Text fontSize="xs" color="purple.600"><Text as="span" fontWeight="bold">Boundary Effects:</Text> {strategy.boundary_effects}</Text>}
                                    {strategy.implementation_guidance && (
                                      <Box bg="green.50" p={2} borderRadius="md">
                                        <Text fontSize="xs" fontWeight="bold" color="green.700" mb={1}>Implementation Guidance</Text>
                                        <Text fontSize="xs" color="green.800">{strategy.implementation_guidance}</Text>
                                      </Box>
                                    )}

                                    {strategy.supporting_ioms.length > 0 && (
                                      <Box>
                                        <Text fontSize="xs" fontWeight="bold" mb={1}>Supporting IOMs</Text>
                                        <Wrap>{strategy.supporting_ioms.map((iom, i) => <WrapItem key={i}><Tag size="sm" variant="outline" colorScheme="gray"><TagLabel>{iom}</TagLabel></Tag></WrapItem>)}</Wrap>
                                      </Box>
                                    )}
                                  </VStack>
                                </CardBody>
                              </Card>
                            ))}

                            <Divider />
                            {zone.implementation_sequence && <Box><Text fontSize="xs" fontWeight="bold">Implementation Sequence</Text><Text fontSize="xs">{zone.implementation_sequence}</Text></Box>}
                            {zone.synergies && <Box><Text fontSize="xs" fontWeight="bold">Synergies</Text><Text fontSize="xs">{zone.synergies}</Text></Box>}
                          </VStack>
                        </AccordionPanel>
                      </AccordionItem>
                    ))}
                  </Accordion>}
                </TabPanel>
              )}

              {/* ── Tab: Indicators ── */}
              <TabPanel px={0}>
                <VStack spacing={6} align="stretch">
                  {recommendations.length > 0 && (
                    <Card>
                      <CardHeader>
                        <HStack justify="space-between">
                          <Heading size="sm">Recommended Indicators ({recommendations.length})</Heading>
                          <Badge colorScheme="blue">{selectedIndicators.length} selected</Badge>
                        </HStack>
                      </CardHeader>
                      <CardBody>
                        <Wrap spacing={3}>
                          {recommendations.map(rec => {
                            const selected = selectedIndicators.some(s => s.indicator_id === rec.indicator_id);
                            return (
                              <WrapItem key={rec.indicator_id}>
                                <Tag size="lg" colorScheme={selected ? 'green' : 'gray'} variant={selected ? 'solid' : 'outline'}>
                                  <TagLabel>{rec.indicator_id} {(rec.relevance_score * 100).toFixed(0)}%</TagLabel>
                                </Tag>
                              </WrapItem>
                            );
                          })}
                        </Wrap>
                      </CardBody>
                    </Card>
                  )}

                  {indicatorRelationships.length > 0 && (
                    <Card>
                      <CardHeader><Heading size="sm">Indicator Relationships</Heading></CardHeader>
                      <CardBody>
                        <VStack align="stretch" spacing={2}>
                          {indicatorRelationships.map((rel, i) => (
                            <HStack key={i} fontSize="sm" spacing={2}>
                              <Badge colorScheme="blue">{rel.indicator_a}</Badge>
                              <Badge colorScheme={rel.relationship_type === 'synergistic' ? 'green' : rel.relationship_type === 'inverse' ? 'red' : 'gray'}>{rel.relationship_type}</Badge>
                              <Badge colorScheme="blue">{rel.indicator_b}</Badge>
                              {rel.explanation && <Text fontSize="xs" color="gray.500" noOfLines={1} flex={1}>{rel.explanation}</Text>}
                            </HStack>
                          ))}
                        </VStack>
                      </CardBody>
                    </Card>
                  )}

                  {recommendationSummary && (
                    <Card>
                      <CardHeader><Heading size="sm">Recommendation Summary</Heading></CardHeader>
                      <CardBody>
                        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                          {recommendationSummary.key_findings.length > 0 && (
                            <Box>
                              <Text fontSize="sm" fontWeight="bold" mb={1}>Key Findings</Text>
                              <VStack align="stretch" spacing={1}>
                                {recommendationSummary.key_findings.map((f, i) => <Text key={i} fontSize="sm">&#x2713; {f}</Text>)}
                              </VStack>
                            </Box>
                          )}
                          {recommendationSummary.evidence_gaps.length > 0 && (
                            <Box>
                              <Text fontSize="sm" fontWeight="bold" mb={1}>Evidence Gaps</Text>
                              <VStack align="stretch" spacing={1}>
                                {recommendationSummary.evidence_gaps.map((g, i) => <Text key={i} fontSize="sm">&#x26A0; {g}</Text>)}
                              </VStack>
                            </Box>
                          )}
                        </SimpleGrid>
                      </CardBody>
                    </Card>
                  )}
                </VStack>
              </TabPanel>

            </TabPanels>
          </Tabs>
        </Box>
      )}

      {/* Navigation */}
      {routeProjectId && (
        <HStack justify="space-between" mt={6}>
          <Button as={Link} to={`/projects/${routeProjectId}/analysis`} variant="outline">
            Back: Analysis
          </Button>
          <Button as={Link} to={`/projects/${routeProjectId}`} colorScheme="green">
            Back to Project
          </Button>
        </HStack>
      )}
    </PageShell>
  );
}

export default Reports;
