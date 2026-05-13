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
  LLMProviderInfo,
  KnowledgeBaseSummary,
  User,
  UserCreate,
  AuthToken,
  ZoneAnalysisRequest,
  ZoneAnalysisResult,
  DesignStrategyResult,
  FullAnalysisRequest,
  FullAnalysisResult,
  ProjectPipelineRequest,
  ProjectPipelineResult,
  ProjectPipelineStreamEvent,
  DesignStrategiesStreamEvent,
  GenerateReportStreamEvent,
  ReportRequest,
  ReportResult,
  ClusteringRequest,
  ClusteringByProjectRequest,
  ClusteringResponse,
  MergedExportRequest,
  GroupingMode,
  EncodingEntry,
  EncodingSections,
} from '../types';

/**
 * Consume an SSE stream produced by a FastAPI ``StreamingResponse`` that emits
 * ``data: {...}\n\n`` JSON lines. Resolves once the stream finishes; rejects on
 * HTTP error, parse failure, or premature close (no `result`/`error` event).
 *
 * Shared by ``runProjectPipelineStream``, ``runDesignStrategiesStream``, and
 * ``generateReportStream`` — all three follow the exact same wire protocol.
 */
async function consumeSseStream<TEvent extends { type: string }>(
  path: string,
  body: unknown,
  onEvent: (event: TEvent) => void,
  logPrefix: string,
  prematureCloseMessage: string,
  signal?: AbortSignal,
): Promise<void> {
  const baseURL = apiClient.defaults.baseURL || '';
  const res = await fetch(`${baseURL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let gotResult = false;
  let gotError = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE event boundaries are `\n\n`; everything left after the last
    // boundary is an unfinished chunk we'll see again on the next read.
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const line = part.trim();
      if (line.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(line.slice(6)) as TEvent;
          if (parsed.type === 'result') gotResult = true;
          if (parsed.type === 'error') gotError = true;
          onEvent(parsed);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`${logPrefix} Failed to parse event:`, line.slice(6, 200), e);
        }
      }
    }
  }
  if (!gotResult && !gotError) {
    throw new Error(prematureCloseMessage);
  }
}

// Health & Config
export const api = {
  // Health
  health: () => apiClient.get<{ status: string }>('/health'),

  // Config
  getConfig: () => apiClient.get<AppConfig>('/api/config'),
  testVision: () => apiClient.post<{
    healthy: boolean;
    // The backend forwards the upstream Vision service's /health JSON
    // verbatim. Older Vision builds don't include every field, so anything
    // beyond the basic status flags is marked optional — render code must
    // tolerate missing arrays / null GPU info.
    info: {
      status: string;
      gpu_available: boolean;
      gpu_name?: string | null;
      gpu_memory?: string | null;
      gpu_memory_gb?: number | null;
      models_loaded?: boolean;
      semantic_classes?: number;
      depth_backend?: string;
      depth_model: string;
      available_depth_models?: Array<{
        id: string;
        label: string;
        params_billions: number;
        vram_gb: number;
        depth_type: string;
        sky_detection: string;
        notes: string;
      }>;
    } | null;
    config: unknown;
  }>('/api/config/test-vision'),
  testGemini: () => apiClient.post<{ configured: boolean; provider: string; model: string | null }>('/api/config/test-gemini'),
  testLLM: () => apiClient.post<{ configured: boolean; provider: string; model: string | null }>('/api/config/test-llm'),
  getLLMProviders: () => apiClient.get<LLMProviderInfo[]>('/api/config/llm-providers'),
  switchLLMProvider: (provider: string, model?: string) =>
    apiClient.put('/api/config/llm-provider', null, { params: { provider, model } }),
  updateLLMApiKey: (provider: string, api_key: string) =>
    apiClient.put('/api/config/llm-api-key', null, { params: { provider, api_key } }),
  updateVisionUrl: (url: string) =>
    apiClient.put<{ message: string; vision_api_url: string }>(
      '/api/config/vision-url', null, { params: { url } },
    ),
  getProviderModels: (provider: string) =>
    apiClient.get<{ id: string; label: string }[]>(`/api/config/models/${provider}`),

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
        params: zoneId != null ? { zone_id: zoneId } : {},
      }),
    batchAssignZones: (projectId: string, assignments: Array<{ image_id: string; zone_id: string | null }>) =>
      apiClient.put(`/api/projects/${projectId}/images/batch-zone`, assignments),
    deleteImage: (projectId: string, imageId: string) =>
      apiClient.delete(`/api/projects/${projectId}/images/${imageId}`),
    batchDeleteImages: (projectId: string, imageIds: string[]) =>
      apiClient.post<{ success: boolean; deleted: number; deleted_ids: string[]; not_found: string[] }>(
        `/api/projects/${projectId}/images/batch-delete`,
        { image_ids: imageIds },
      ),
    listImages: (projectId: string) =>
      apiClient.get(`/api/projects/${projectId}/images`),
    reparseGps: (projectId: string) =>
      apiClient.post<{
        project_id: string;
        total_images: number;
        already_had_gps: number;
        updated_from_filename: number;
        still_no_gps: number;
      }>(`/api/projects/${projectId}/images/reparse-gps`),
    updateSelectedIndicators: (projectId: string, indicators: unknown[]) =>
      apiClient.put<{ success: boolean; count: number }>(
        `/api/projects/${projectId}/selected-indicators`,
        indicators,
      ),
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
    analyzePanorama: (file: File, requestData: Record<string, unknown>) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('request_data', JSON.stringify(requestData));
      return apiClient.post('/api/vision/analyze/panorama', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    analyzeByPath: (image_path: string, request: Record<string, unknown>) =>
      apiClient.post('/api/vision/analyze/path', request, { params: { image_path } }),
    analyzeProjectImage: (projectId: string, imageId: string, request: Record<string, unknown>) =>
      apiClient.post('/api/vision/analyze/project-image', request, {
        params: { project_id: projectId, image_id: imageId },
      }),
    analyzeProjectImagePanorama: (projectId: string, imageId: string, request: Record<string, unknown>) =>
      apiClient.post('/api/vision/analyze/project-image/panorama', request, {
        params: { project_id: projectId, image_id: imageId },
      }),
  },

  // Indicators
  indicators: {
    recommend: (request: {
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
    }) => apiClient.post<RecommendationResponse>('/api/indicators/recommend', request),

    recommendStream: (
      request: {
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
      },
      onEvent: (event: { type: string; text?: string; message?: string; data?: RecommendationResponse }) => void,
    ) => {
      const baseURL = apiClient.defaults.baseURL || '';
      return fetch(`${baseURL}/api/indicators/recommend/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `HTTP ${res.status}`);
        }
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';
          for (const part of parts) {
            const line = part.trim();
            if (line.startsWith('data: ')) {
              try { onEvent(JSON.parse(line.slice(6))); }
              catch { /* skip malformed */ }
            }
          }
        }
      });
    },
    getDefinitions: () => apiClient.get<unknown[]>('/api/indicators/definitions'),
    getDimensions: () => apiClient.get<unknown[]>('/api/indicators/dimensions'),
    getSubdimensions: () => apiClient.get<unknown[]>('/api/indicators/subdimensions'),
    getEvidence: (indicator_id: string) => apiClient.get(`/api/indicators/evidence/${indicator_id}`),
    getKnowledgeBaseSummary: () => apiClient.get<KnowledgeBaseSummary>('/api/indicators/knowledge-base/summary'),
  },

  // Encoding dictionary (knowledge-base codebook)
  encoding: {
    getSections: () => apiClient.get<EncodingSections>('/api/encoding/sections'),
    getSection: (section: string) =>
      apiClient.get<EncodingEntry[]>(`/api/encoding/sections/${section}`),
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
    runClustering: (data: ClusteringRequest) =>
      apiClient.post<ClusteringResponse>('/api/analysis/clustering', data),
    runClusteringByProject: (data: ClusteringByProjectRequest) =>
      apiClient.post<ClusteringResponse>('/api/analysis/clustering/by-project', data),
    runClusteringWithinZones: (data: ClusteringByProjectRequest) =>
      apiClient.post<ClusteringResponse>('/api/analysis/clustering/within-zones', data),
    exportMerged: (data: MergedExportRequest) =>
      apiClient.post<Record<string, unknown>>('/api/analysis/export-merged', data),
    runDesignStrategies: (data: unknown) =>
      apiClient.post<DesignStrategyResult>('/api/analysis/design-strategies', data),
    runFull: (data: FullAnalysisRequest) =>
      apiClient.post<FullAnalysisResult>('/api/analysis/run-full', data),
    runFullAsync: (data: FullAnalysisRequest) =>
      apiClient.post<{ task_id: string; status: string; message: string }>('/api/analysis/run-full/async', data),
    runProjectPipeline: (data: ProjectPipelineRequest) =>
      apiClient.post<ProjectPipelineResult>('/api/analysis/project-pipeline', data),
    runProjectPipelineStream: (
      data: ProjectPipelineRequest,
      onEvent: (event: ProjectPipelineStreamEvent) => void,
      signal?: AbortSignal,
    ) =>
      consumeSseStream<ProjectPipelineStreamEvent>(
        '/api/analysis/project-pipeline/stream',
        data,
        onEvent,
        '[Pipeline SSE]',
        'Connection lost during pipeline execution. The server may still be processing — please check and retry.',
        signal,
      ),
    runDesignStrategiesStream: (
      data: unknown,
      onEvent: (event: DesignStrategiesStreamEvent) => void,
      signal?: AbortSignal,
    ) =>
      consumeSseStream<DesignStrategiesStreamEvent>(
        '/api/analysis/design-strategies/stream',
        data,
        onEvent,
        '[DesignStrategies SSE]',
        'Connection lost during strategy generation. The LLM call may still be running on the server — please check and retry.',
        signal,
      ),
    generateReport: (data: ReportRequest) =>
      apiClient.post<ReportResult>('/api/analysis/generate-report', data),
    generateReportStream: (
      data: ReportRequest,
      onEvent: (event: GenerateReportStreamEvent) => void,
      signal?: AbortSignal,
    ) =>
      consumeSseStream<GenerateReportStreamEvent>(
        '/api/analysis/generate-report/stream',
        data,
        onEvent,
        '[Report SSE]',
        'Connection lost during report generation. The LLM call may still be running on the server — please check and retry.',
        signal,
      ),
    chartSummary: (data: {
      chart_id: string;
      chart_title: string;
      chart_description?: string | null;
      project_id: string;
      payload: Record<string, unknown>;
      project_context?: Record<string, unknown> | null;
      /** #6 — folded into the cache key so toggling Zone vs Cluster view
       * fetches a fresh interpretation pinned to the active grouping unit. */
      grouping_mode?: GroupingMode;
    }) =>
      apiClient.post<{
        summary: string;
        highlight_points: string[];
        cached: boolean;
        model: string;
        error?: string | null;
        // #6 — structured 4-section output. Null when the LLM failed twice
        // to return parseable JSON; in that case `degraded` is true and the
        // legacy `summary` field is the only thing worth rendering.
        summary_v2?: {
          overall: string;
          findings: { point: string; evidence: string }[];
          local_breakdown: { unit_id: string; unit_label: string; interpretation: string }[];
          implication: string;
        } | null;
        degraded?: boolean;
      }>('/api/analysis/chart-summary', data),
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
