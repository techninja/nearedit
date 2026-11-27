/**
 * HTTP client for the NearEdit API — one place for JSON handling and errors.
 * Contract: docs/app-spec/API.md.
 * @module utils/api/http
 */

/** Error thrown for any non-2xx API response. */
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {any} [body]
   */
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Call the API. Paths are relative to `/api` (e.g. `/projects`).
 * @param {string} path
 * @param {{ method?: string, body?: unknown, signal?: AbortSignal }} [opts]
 * @returns {Promise<any>} Parsed JSON, or null for an empty response
 */
export async function api(path, opts = {}) {
  const { method = opts.body === undefined ? 'GET' : 'POST', body, signal } = opts;
  const res = await fetch(`/api${path}`, {
    method,
    signal,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = res.status === 204 ? '' : await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 200) };
    }
  }
  if (!res.ok)
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  return data;
}

/**
 * Build a query string from an object, skipping empty values.
 * @param {Record<string, string|number|boolean|undefined|null>} params
 * @returns {string} Including the leading "?" when non-empty
 */
export function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
