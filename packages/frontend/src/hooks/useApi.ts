import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import type { ProjectCreate } from '../types';

// Query keys
export const queryKeys = {
  health: ['health'],
  config: ['config'],
  projects: ['projects'],
  project: (id: string) => ['project', id],
  calculators: ['calculators'],
  calculator: (id: string) => ['calculator', id],
  semanticConfig: ['semanticConfig'],
  knowledgeBase: ['knowledgeBase'],
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

// Indicator recommendation mutation
export function useRecommendIndicators() {
  return useMutation({
    mutationFn: (request: {
      project_name: string;
      performance_dimensions: string[];
      subdimensions?: string[];
      design_brief?: string;
    }) => api.indicators.recommend(request).then((r) => r.data),
  });
}
