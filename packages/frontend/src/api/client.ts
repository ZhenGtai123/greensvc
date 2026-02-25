import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
apiClient.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor — extract backend error detail into error.message
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const data = error.response?.data;
    // Extract error message from various API response formats:
    // FastAPI:    { "detail": "..." }
    // Anthropic:  { "error": { "message": "..." } }
    // Generic:    { "message": "..." } or { "error": "..." }
    const detail =
      (typeof data?.detail === 'string' && data.detail) ||
      (typeof data?.error?.message === 'string' && data.error.message) ||
      (typeof data?.message === 'string' && data.message) ||
      (typeof data?.error === 'string' && data.error) ||
      null;
    console.error('[API Error]', detail || data || error.message);
    if (detail) {
      error.message = detail;
    }
    return Promise.reject(error);
  }
);

export default apiClient;
