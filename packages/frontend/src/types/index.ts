// Project types
export interface SpatialZone {
  zone_id: string;
  zone_name: string;
  zone_types: string[];
  description: string;
}

export interface UploadedImage {
  image_id: string;
  filename: string;
  filepath: string;
  zone_id: string | null;
  has_gps: boolean;
  latitude: number | null;
  longitude: number | null;
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
  uploaded_images: UploadedImage[];
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
  error?: string;
}

// Config types
export interface AppConfig {
  vision_api_url: string;
  gemini_model: string;
  data_dir: string;
  metrics_code_dir: string;
  knowledge_base_dir: string;
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
