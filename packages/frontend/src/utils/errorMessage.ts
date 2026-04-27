/**
 * Pull a user-readable string out of whatever an axios/fetch/JS error happens
 * to be. Prefers FastAPI's standard `{ detail: string }` body over generic
 * Error.message; falls back to the supplied default when nothing useful exists.
 */
export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const axiosErr = err as { response?: { data?: { detail?: string } } };
    if (axiosErr.response?.data?.detail) return axiosErr.response.data.detail;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
