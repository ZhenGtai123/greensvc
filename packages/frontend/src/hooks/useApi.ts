import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import type { ProjectCreate, ZoneAnalysisRequest, FullAnalysisRequest, ProjectPipelineRequest, ReportRequest, ClusteringRequest, MergedExportRequest } from '../types';

// Query keys
export const queryKeys = {
  health: ['health'],
  config: ['config'],
  llmProviders: ['llm-providers'],
  projects: ['projects'],
  project: (id: string) => ['project', id],
  calculators: ['calculators'],
  calculator: (id: string) => ['calculator', id],
  semanticConfig: ['semanticConfig'],
  knowledgeBase: ['knowledgeBase'],
  providerModels: (provider: string) => ['provider-models', provider],
  task: (id: string) => ['task', id],
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
