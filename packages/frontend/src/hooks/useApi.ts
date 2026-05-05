import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import type { ProjectCreate, ZoneAnalysisRequest, FullAnalysisRequest, ProjectPipelineRequest, ReportRequest, ClusteringRequest, ClusteringByProjectRequest, MergedExportRequest } from '../types';

// Query keys
export const queryKeys = {
  health: ['health'],
  config: ['config'],
  visionHealth: ['vision-health'],
  llmProviders: ['llm-providers'],
  projects: ['projects'],
  project: (id: string) => ['project', id],
  calculators: ['calculators'],
  calculator: (id: string) => ['calculator', id],
  semanticConfig: ['semanticConfig'],
  knowledgeBase: ['knowledgeBase'],
  providerModels: (provider: string) => ['provider-models', provider],
  task: (id: string) => ['task', id],
  encodingSections: ['encoding-sections'],
};

// Health & Config hooks
export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: () => api.health().then((r) => r.data),
    refetchInterval: 30000,
  });
}

export function useConfig() {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: () => api.getConfig().then((r) => r.data),
  });
}

// Vision API health + model info. Cached for a couple minutes so that
// opening / closing the SettingsDrawer doesn't re-ping a slow Vision API
// every time. Manual refresh (the Test button) calls
// queryClient.invalidateQueries({ queryKey: queryKeys.visionHealth }).
export function useVisionHealth(enabled = true) {
  return useQuery({
    queryKey: ['vision-health'],
    queryFn: () => api.testVision().then((r) => r.data),
    enabled,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: false,
  });
}

// LLM Provider hooks
export function useLLMProviders() {
  return useQuery({
    queryKey: queryKeys.llmProviders,
    queryFn: () => api.getLLMProviders().then((r) => r.data),
  });
}

// Provider models hook
export function useProviderModels(provider: string | undefined) {
  return useQuery({
    queryKey: queryKeys.providerModels(provider || ''),
    queryFn: () => api.getProviderModels(provider!).then((r) => r.data),
    enabled: !!provider,
    staleTime: 5 * 60 * 1000, // cache 5 min
  });
}

// Project hooks
export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => api.projects.list().then((r) => r.data),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => api.projects.get(id).then((r) => r.data),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ProjectCreate) => api.projects.create(data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

// Calculator hooks
export function useCalculators() {
  return useQuery({
    queryKey: queryKeys.calculators,
    queryFn: () => api.metrics.list().then((r) => r.data),
  });
}

export function useCalculator(id: string) {
  return useQuery({
    queryKey: queryKeys.calculator(id),
    queryFn: () => api.metrics.get(id).then((r) => r.data),
    enabled: !!id,
  });
}

export function useUploadCalculator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => api.metrics.upload(file).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.calculators });
    },
  });
}

// Semantic config hooks
export function useSemanticConfig() {
  return useQuery({
    queryKey: queryKeys.semanticConfig,
    queryFn: () => api.vision.getSemanticConfig().then((r) => r.data),
  });
}

// Knowledge base hooks
export function useKnowledgeBaseSummary() {
  return useQuery({
    queryKey: queryKeys.knowledgeBase,
    queryFn: () => api.indicators.getKnowledgeBaseSummary().then((r) => r.data),
  });
}

// Task polling hook
export function useTaskStatus(taskId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.task(taskId || ''),
    queryFn: () => api.tasks.getStatus(taskId!).then((r) => r.data),
    enabled: enabled && !!taskId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      if (data.status === 'SUCCESS' || data.status === 'FAILURE' || data.status === 'REVOKED') {
        return false;
      }
      return 2000;
    },
  });
}

// Analysis mutations
export function useRunZoneAnalysis() {
  return useMutation({
    mutationFn: (data: ZoneAnalysisRequest) =>
      api.analysis.runZoneStatistics(data).then(r => r.data),
  });
}

export function useRunClustering() {
  return useMutation({
    mutationFn: (data: ClusteringRequest) =>
      api.analysis.runClustering(data).then(r => r.data),
  });
}

export function useRunClusteringByProject() {
  return useMutation({
    mutationFn: (data: ClusteringByProjectRequest) =>
      api.analysis.runClusteringByProject(data).then(r => r.data),
  });
}

export function useExportMerged() {
  return useMutation({
    mutationFn: (data: MergedExportRequest) =>
      api.analysis.exportMerged(data).then(r => r.data),
  });
}

export function useRunDesignStrategies() {
  return useMutation({
    mutationFn: (data: unknown) =>
      api.analysis.runDesignStrategies(data).then(r => r.data),
  });
}

export function useRunFullAnalysis() {
  return useMutation({
    mutationFn: (data: FullAnalysisRequest) =>
      api.analysis.runFull(data).then(r => r.data),
  });
}

export function useRunProjectPipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ProjectPipelineRequest) =>
      api.analysis.runProjectPipeline(data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useGenerateReport() {
  return useMutation({
    mutationFn: (data: ReportRequest) =>
      api.analysis.generateReport(data).then(r => r.data),
  });
}

interface ChartSummaryArgs {
  chart_id: string;
  chart_title: string;
  chart_description?: string | null;
  project_id: string;
  payload: Record<string, unknown>;
  project_context?: Record<string, unknown> | null;
  /** #6 — query key includes this so Zone-mode and Cluster-mode summaries
   * don't collide in the React Query cache. */
  grouping_mode?: 'zones' | 'clusters';
  /** When false, the query is held back until the user opens the panel. */
  enabled?: boolean;
}

export function useChartSummary(args: ChartSummaryArgs) {
  const { enabled = false, ...body } = args;
  return useQuery({
    queryKey: [
      'chart-summary',
      body.chart_id,
      body.project_id,
      body.grouping_mode ?? 'zones',
      body.payload,
    ],
    queryFn: () => api.analysis.chartSummary(body).then(r => r.data),
    enabled,
    staleTime: 1000 * 60 * 60, // 1 hour — backend cache is the real TTL
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

// Vision project image analysis mutation
export function useAnalyzeProjectImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, imageId, request }: { projectId: string; imageId: string; request: Record<string, unknown> }) =>
      api.vision.analyzeProjectImage(projectId, imageId, request).then(r => r.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) });
    },
  });
}

// Indicator recommendation mutation
export function useRecommendIndicators() {
  return useMutation({
    mutationFn: (request: {
      project_name: string;
      performance_dimensions: string[];
      subdimensions?: string[];
      design_brief?: string;
      project_location?: string;
      space_type_id?: string;
      koppen_zone_id?: string;
      lcz_type_id?: string;
      age_group_id?: string;
      project_id?: string;
    }) => api.indicators.recommend(request).then((r) => r.data),
  });
}

// Auth mutations
export function useLogin() {
  return useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      api.auth.login(username, password).then(r => r.data),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (data: { email: string; username: string; password: string; full_name?: string }) =>
      api.auth.register(data).then(r => r.data),
  });
}

export function useCurrentUser(enabled = false) {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: () => api.auth.me().then(r => r.data),
    enabled,
    retry: false,
  });
}

// Encoding dictionary (knowledge-base codebook). Static data, cache forever.
export function useEncodingSections() {
  return useQuery({
    queryKey: queryKeys.encodingSections,
    queryFn: () => api.encoding.getSections().then((r) => r.data),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}
