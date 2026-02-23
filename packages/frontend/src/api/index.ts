import apiClient from './client';
import type {
  Project,
  ProjectCreate,
  ProjectUpdate,
  CalculatorInfo,
  CalculationResult,
  RecommendationResponse,
  TaskStatus,
  SemanticClass,
  AppConfig,
  KnowledgeBaseSummary,
  User,
  UserCreate,
  AuthToken,
  ZoneAnalysisRequest,
  ZoneAnalysisResult,
  DesignStrategyResult,
  FullAnalysisRequest,
  FullAnalysisResult,
} from '../types';

// Health & Config
export const api = {
  // Health
  health: () => apiClient.get<{ status: string }>('/health'),

  // Config
  getConfig: () => apiClient.get<AppConfig>('/api/config'),
  testVision: () => apiClient.post<{ healthy: boolean; config: unknown }>('/api/config/test-vision'),
  testGemini: () => apiClient.post<{ configured: boolean; model: string | null }>('/api/config/test-gemini'),

  // Projects
  projects: {
    list: (limit = 50, offset = 0) =>
      apiClient.get<Project[]>('/api/projects', { params: { limit, offset } }),
    get: (id: string) => apiClient.get<Project>(`/api/projects/${id}`),
    create: (data: ProjectCreate) => apiClient.post<Project>('/api/projects', data),
    update: (id: string, data: ProjectUpdate) =>
      apiClient.put<Project>(`/api/projects/${id}`, data),
    delete: (id: string) => apiClient.delete(`/api/projects/${id}`),
    export: (id: string) => apiClient.get(`/api/projects/${id}/export`),
    addZone: (id: string, zone_name: string, zone_types?: string[], description?: string) =>
      apiClient.post(`/api/projects/${id}/zones`, null, {
        params: { zone_name, zone_types, description },
      }),
    deleteZone: (projectId: string, zoneId: string) =>
      apiClient.delete(`/api/projects/${projectId}/zones/${zoneId}`),
    // Image management
    uploadImages: (projectId: string, files: File[], zoneId?: string) => {
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      if (zoneId) formData.append('zone_id', zoneId);
      return apiClient.post(`/api/projects/${projectId}/images`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    assignImageZone: (projectId: string, imageId: string, zoneId: string | null) =>
      apiClient.put(`/api/projects/${projectId}/images/${imageId}/zone`, null, {
        params: { zone_id: zoneId },
      }),
    deleteImage: (projectId: string, imageId: string) =>
      apiClient.delete(`/api/projects/${projectId}/images/${imageId}`),
    listImages: (projectId: string) =>
      apiClient.get(`/api/projects/${projectId}/images`),
  },

  // Metrics/Calculators
  metrics: {
    list: () => apiClient.get<CalculatorInfo[]>('/api/metrics'),
    get: (id: string) => apiClient.get<CalculatorInfo>(`/api/metrics/${id}`),
    getCode: (id: string) => apiClient.get<{ indicator_id: string; code: string }>(`/api/metrics/${id}/code`),
    upload: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.post('/api/metrics/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    delete: (id: string) => apiClient.delete(`/api/metrics/${id}`),
    calculate: (indicator_id: string, image_path: string) =>
      apiClient.post<CalculationResult>('/api/metrics/calculate', null, {
        params: { indicator_id, image_path },
      }),
    calculateBatch: (indicator_id: string, image_paths: string[]) =>
      apiClient.post('/api/metrics/calculate/batch', { indicator_id, image_paths }),
    reload: () => apiClient.post('/api/metrics/reload'),
  },

  // Vision
  vision: {
    getSemanticConfig: () => apiClient.get<{ total_classes: number; classes: SemanticClass[] }>('/api/vision/semantic-config'),
    health: () => apiClient.get<{ healthy: boolean; url: string }>('/api/vision/health'),
    analyze: (file: File, requestData: Record<string, unknown>) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('request_data', JSON.stringify(requestData));
      return apiClient.post('/api/vision/analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    analyzeByPath: (image_path: string, request: Record<string, unknown>) =>
      apiClient.post('/api/vision/analyze/path', request, { params: { image_path } }),
  },

  // Indicators
  indicators: {
    recommend: (request: {
      project_name: string;
      performance_dimensions: string[];
      subdimensions?: string[];
      design_brief?: string;
      space_type_id?: string;
      koppen_zone_id?: string;
    }) => apiClient.post<RecommendationResponse>('/api/indicators/recommend', request),
    getDefinitions: () => apiClient.get<unknown[]>('/api/indicators/definitions'),
    getDimensions: () => apiClient.get<unknown[]>('/api/indicators/dimensions'),
    getSubdimensions: () => apiClient.get<unknown[]>('/api/indicators/subdimensions'),
    getEvidence: (indicator_id: string) => apiClient.get(`/api/indicators/evidence/${indicator_id}`),
    getKnowledgeBaseSummary: () => apiClient.get<KnowledgeBaseSummary>('/api/indicators/knowledge-base/summary'),
  },

  // Tasks
  tasks: {
    getStatus: (taskId: string) => apiClient.get<TaskStatus>(`/api/tasks/${taskId}`),
    cancel: (taskId: string) => apiClient.delete(`/api/tasks/${taskId}`),
    listActive: () => apiClient.get('/api/tasks'),
    submitVisionBatch: (data: {
      image_paths: string[];
      semantic_classes: string[];
      semantic_countability: number[];
      openness_list: number[];
      encoder?: string;
      output_dir?: string;
    }) => apiClient.post('/api/tasks/vision/batch', data),
    submitMetricsBatch: (data: {
      indicator_id: string;
      image_paths: string[];
      output_path?: string;
    }) => apiClient.post('/api/tasks/metrics/batch', data),
    submitMultiIndicator: (data: {
      indicator_ids: string[];
      image_paths: string[];
      output_dir?: string;
    }) => apiClient.post('/api/tasks/metrics/multi', data),
  },

  // Analysis (Stage 2.5 + Stage 3)
  analysis: {
    runZoneStatistics: (data: ZoneAnalysisRequest) =>
      apiClient.post<ZoneAnalysisResult>('/api/analysis/zone-statistics', data),
    runDesignStrategies: (data: unknown) =>
      apiClient.post<DesignStrategyResult>('/api/analysis/design-strategies', data),
    runFull: (data: FullAnalysisRequest) =>
      apiClient.post<FullAnalysisResult>('/api/analysis/run-full', data),
    runFullAsync: (data: FullAnalysisRequest) =>
      apiClient.post<{ task_id: string; status: string; message: string }>('/api/analysis/run-full/async', data),
  },

  // Auth
  auth: {
    register: (data: UserCreate) => apiClient.post<User>('/api/auth/register', data),
    login: (username: string, password: string) => {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);
      return apiClient.post<AuthToken>('/api/auth/login', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    },
    me: () => apiClient.get<User>('/api/auth/me'),
    refresh: () => apiClient.post<AuthToken>('/api/auth/refresh'),
  },
};

export default api;
