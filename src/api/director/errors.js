/**
 * Director errors carry the HTTP status a route should answer with
 * (docs/app-spec/API.md: 400 bad input, 404 missing, 422 failed validation,
 * 503 provider not configured or unreachable).
 * @module api/director/errors
 */

export class DirectorError extends Error {
  /**
   * @param {string} message
   * @param {{ status?: number, detail?: string, fields?: Record<string, string> }} [info]
   */
  constructor(message, info = {}) {
    super(message);
    this.name = 'DirectorError';
    this.status = info.status || 500;
    this.detail = info.detail || '';
    this.fields = info.fields;
  }
}

/**
 * The LLM provider is not configured or cannot be reached.
 * @param {string} message
 * @param {string} [detail]
 * @returns {DirectorError}
 */
export function unavailable(message, detail = '') {
  return new DirectorError(message, { status: 503, detail });
}

/**
 * JSON error body for a response (API.md error shape).
 * @param {any} err
 * @returns {{ status: number, body: { error: string, detail?: string, fields?: object } }}
 */
export function errorResponse(err) {
  const status = err instanceof DirectorError ? err.status : 500;
  const body = { error: err?.message || 'Unexpected error' };
  if (err?.detail) body.detail = err.detail;
  if (err?.fields) body.fields = err.fields;
  return { status, body };
}
