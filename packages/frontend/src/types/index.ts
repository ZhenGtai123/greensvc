// Project types
export interface SpatialZone {
  zone_id: string;
  zone_name: string;
  zone_types: string[];
  area?: number;
  status?: string;
  description: string;
}

export interface SpatialRelation {
  from_zone: string;
  to_zone: string;
  relation_type: string;
  direction?: string;
}

export interface UploadedImage {
  image_id: string;
  filename: string;
  filepath: string;
  zone_id: string | null;
  has_gps: boolean;
  latitude: number | null;
  longitude: number | null;
  metrics_results: Record<string, number | null>;
  mask_filepaths: Record<string, string>;
}

export interface Project {
  id: string;
  project_name: string;
  project_location: string;
  site_scale: string;
  project_phase: string;
  koppen_zone_id: string;
  country_id: string;
  space_type_id: string;
  lcz_type_id: string;
  age_group_id: string;
  design_brief: string;
  performance_dimensions: string[];
  subdimensions: string[];
  created_at: string;
  updated_at?: string;
  spatial_zones: SpatialZone[];
  spatial_relations: SpatialRelation[];
  uploaded_images: UploadedImage[];
}

export interface SpatialZoneCreate {
  zone_id?: string;
  zone_name: string;
  zone_types?: string[];
  area?: number;
  status?: string;
  description?: string;
}

export interface ProjectCreate {
  project_name: string;
  project_location?: string;
  site_scale?: string;
  project_phase?: string;
  koppen_zone_id?: string;
  country_id?: string;
  space_type_id?: string;
  lcz_type_id?: string;
  age_group_id?: string;
  design_brief?: string;
  performance_dimensions?: string[];
  subdimensions?: string[];
  spatial_zones?: SpatialZoneCreate[];
  spatial_relations?: SpatialRelation[];
}

export interface ProjectUpdate {
  project_name?: string;
  project_location?: string;
  site_scale?: string;
  project_phase?: string;
  koppen_zone_id?: string;
  country_id?: string;
  space_type_id?: string;
  lcz_type_id?: string;
  age_group_id?: string;
  design_brief?: string;
  performance_dimensions?: string[];
  subdimensions?: string[];
  spatial_zones?: SpatialZoneCreate[];
  spatial_relations?: SpatialRelation[];
}

// Calculator types
export interface CalculatorInfo {
  id: string;
  name: string;
  unit: string;
  formula: string;
  target_direction: string;
  definition: string;
  category: string;
  calc_type: string;
  target_classes: string[];
  filepath: string;
  filename: string;
}

export interface CalculationResult {
  success: boolean;
  indicator_id: string;
  indicator_name: string;
  value: number | null;
  unit: string;
  target_pixels: number | null;
  total_pixels: number | null;
  class_breakdown: Record<string, number>;
  error: string | null;
  image_path: string;
}

// Indicator types
export interface IndicatorRecommendation {
  indicator_id: string;
  indicator_name: string;
  relevance_score: number;
  rationale: string;
  evidence_ids: string[];
  relationship_direction: string;
  confidence: string;
}

export interface RecommendationResponse {
  success: boolean;
  recommendations: IndicatorRecommendation[];
  total_evidence_reviewed: number;
  model_used: string;
  error?: string;
}

// Task types
export interface TaskStatus {
  task_id: string;
  status: 'PENDING' | 'STARTED' | 'PROGRESS' | 'SUCCESS' | 'FAILURE' | 'REVOKED';
  progress?: {
    current: number;
    total: number;
    status: string;
  };
  result?: Record<string, unknown>;
  error?: string;
}

// Vision types
export interface SemanticClass {
  name: string;
  color: string;
  countable: number;
  openness: number;
}

export interface VisionAnalysisResponse {
  status: string;
  image_path: string;
  processing_time: number;
  statistics: Record<string, unknown>;
  mask_paths: Record<string, string>;
  instances: Record<string, unknown>[];
  error?: string;
}

// Config types
export interface AppConfig {
  vision_api_url: string;
  llm_provider: string;
  gemini_model: string;
  openai_model: string;
  anthropic_model: string;
  deepseek_model: string;
  data_dir: string;
  metrics_code_dir: string;
  knowledge_base_dir: string;
}

export interface LLMProviderInfo {
  id: string;
  name: string;
  default_model: string;
  configured: boolean;
  active: boolean;
  current_model: string;
}

// Knowledge base types
export interface KnowledgeBaseSummary {
  loaded: boolean;
  total_evidence: number;
  indicators_with_evidence: number;
  dimensions_with_evidence: number;
  appendix_sections: string[];
  iom_records: number;
}

// Auth types
export interface User {
  id: string;
  email: string;
  username: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface UserCreate {
  email: string;
  username: string;
  password: string;
  full_name?: string;
}

export interface UserLogin {
  username: string;
  password: string;
}

export interface AuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// Analysis types (Stage 2.5 + Stage 3)
export interface IndicatorDefinitionInput {
  id: string;
  name: string;
  unit?: string;
  target_direction?: string;
  definition?: string;
  category?: string;
}

export interface IndicatorLayerValue {
  zone_id: string;
  zone_name: string;
  indicator_id: string;
  layer: string;
  n_images?: number;
  mean?: number | null;
  std?: number | null;
  min?: number | null;
  max?: number | null;
  unit?: string;
  area_sqm?: number;
}

export interface EnrichedZoneStat extends IndicatorLayerValue {
  z_score?: number | null;
  percentile?: number | null;
  priority: number;
  classification: string;
}

export interface ZoneProblem {
  indicator_id: string;
  indicator_name: string;
  layer: string;
  value?: number | null;
  unit?: string;
  z_score: number;
  priority: number;
  classification: string;
  target_direction: string;
}

export interface ZoneDiagnostic {
  zone_id: string;
  zone_name: string;
  area_sqm: number;
  status: string;
  total_priority: number;
  priority_by_layer: Record<string, number>;
  problems_by_layer: Record<string, ZoneProblem[]>;
  indicator_status: Record<string, Record<string, unknown>>;
}

export interface ComputationMetadata {
  version: string;
  generated_at: string;
  n_indicators: number;
  n_zones: number;
  layers: string[];
}

export interface ZoneAnalysisResult {
  zone_statistics: EnrichedZoneStat[];
  zone_diagnostics: ZoneDiagnostic[];
  correlation_by_layer: Record<string, Record<string, Record<string, number>>>;
  pvalue_by_layer: Record<string, Record<string, Record<string, number>>>;
  indicator_definitions: Record<string, IndicatorDefinitionInput>;
  layer_statistics: Record<string, Record<string, { N: number; Mean: number | null; Std: number | null; Min: number | null; Max: number | null }>>;
  computation_metadata: ComputationMetadata;
}

export interface DesignStrategy {
  priority: number;
  strategy_name: string;
  target_indicators: string[];
  spatial_location: string;
  intervention: {
    object: string;
    action: string;
    variable: string;
    specific_guidance: string;
  };
  expected_effects: { indicator: string; direction: string; magnitude: string }[];
  confidence: string;
  potential_tradeoffs: string;
  supporting_ioms: string[];
}

export interface MatchedIOM {
  iom_id: string | null;
  indicator_id: string;
  indicator_name: string;
  direction: string;
  score: number;
  operation: Record<string, unknown>;
  confidence_expanded: Record<string, unknown>;
}

export interface ZoneDesignOutput {
  zone_id: string;
  zone_name: string;
  status: string;
  overall_assessment: string;
  matched_ioms: MatchedIOM[];
  design_strategies: DesignStrategy[];
  implementation_sequence: string;
  synergies: string;
}

export interface DesignStrategyResult {
  zones: Record<string, ZoneDesignOutput>;
  metadata: { diagnosis_mode: string; total_zones: number; total_strategies: number };
}

export interface FullAnalysisResult {
  zone_analysis: ZoneAnalysisResult;
  design_strategies: DesignStrategyResult;
}

export interface ZoneAnalysisRequest {
  indicator_definitions: Record<string, IndicatorDefinitionInput>;
  zone_statistics: IndicatorLayerValue[];
  zscore_moderate?: number;
  zscore_significant?: number;
  zscore_critical?: number;
}

export interface FullAnalysisRequest extends ZoneAnalysisRequest {
  project_context?: { project?: Record<string, unknown>; context?: Record<string, unknown>; performance_query?: Record<string, unknown> };
  allowed_indicator_ids?: string[];
  use_llm?: boolean;
  max_ioms_per_query?: number;
  max_strategies_per_zone?: number;
}

// Project Pipeline types
export interface ProjectPipelineRequest {
  project_id: string;
  indicator_ids: string[];
  run_stage3?: boolean;
  use_llm?: boolean;
  zscore_moderate?: number;
  zscore_significant?: number;
  zscore_critical?: number;
}

export interface ProjectPipelineProgress {
  step: string;
  status: string;
  detail: string;
}

export interface ProjectPipelineResult {
  project_id: string;
  project_name: string;
  total_images: number;
  zone_assigned_images: number;
  calculations_run: number;
  calculations_succeeded: number;
  calculations_failed: number;
  zone_statistics_count: number;
  zone_analysis: ZoneAnalysisResult | null;
  design_strategies: DesignStrategyResult | null;
  steps: ProjectPipelineProgress[];
}
