/**
 * Small HTTP helpers shared by the transcription, vision and status code:
 * OpenAI-style URL joining, bearer headers, cheap reachability pings and
 * readable error text.
 * @module api/intelligence/http
 */

/**
 * Join an OpenAI-compatible base URL and an API path. Accepts bases given
 * with or without the `/v1` suffix ("https://api.groq.com/openai/v1").
 * @param {string} base
 * @param {string} path - e.g. "/audio/transcriptions"
 * @returns {string}
 */
export function openAiUrl(base, path) {
  const trimmed = base.replace(/\/+$/, '');
  return `${/\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`}${path}`;
}

/**
 * Host part of a URL for status text; the raw value when it does not parse.
 * @param {string} url
 * @returns {string}
 */
export function hostOf(url) {
  return URL.canParse(url) ? new URL(url).host : url;
}

/**
 * @param {string} apiKey
 * @returns {Record<string, string>}
 */
export function bearer(apiKey) {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

/**
 * Explain a failed fetch in a few words ("connection refused").
 * @param {any} err
 * @returns {string}
 */
export function describeFetchError(err) {
  const code = err?.cause?.code || err?.code || '';
  if (code === 'ECONNREFUSED') return 'connection refused';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'host not found';
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'timed out';
  if (/^UND_ERR_.*TIMEOUT$/.test(code) || code === 'ETIMEDOUT') return 'timed out';
  return String(err?.cause?.message || err?.message || err);
}

/**
 * GET a URL with a short timeout. Never throws.
 * @param {typeof fetch} fetchFn
 * @param {string} url
 * @param {{ headers?: Record<string, string>, timeout?: number }} [options]
 * @returns {Promise<{ ok: boolean, status: number, body: any, detail: string }>}
 *   `body` is parsed JSON when the response had any
 */
export async function ping(fetchFn, url, options = {}) {
  const { headers = {}, timeout = 1500 } = options;
  try {
    const res = await fetchFn(url, { headers, signal: AbortSignal.timeout(timeout) });
    const body = await res.json().catch(() => null);
    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, body, detail: 'unauthorized (check the API key)' };
    }
    const detail = res.ok ? '' : `HTTP ${res.status}`;
    return { ok: res.ok, status: res.status, body, detail };
  } catch (err) {
    return { ok: false, status: 0, body: null, detail: describeFetchError(err) };
  }
}

/**
 * Throw a readable error for a non-2xx response.
 * @param {Response} res
 * @param {string} what - e.g. "Transcription request"
 * @returns {Promise<Response>} The same response when it is OK
 */
export async function ensureOk(res, what) {
  if (res.ok) return res;
  const text = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
  throw Object.assign(new Error(`${what} failed: HTTP ${res.status} ${text}`.trim()), {
    status: res.status,
  });
}

/**
 * Parse JSON that should be valid but sometimes is not (control characters,
 * log lines printed before the document).
 * @param {string} text
 * @param {(broken: string) => string} repair - e.g. jsonrepair
 * @returns {any}
 */
export function parseJsonLoose(text, repair) {
  const from = text.indexOf('{');
  const body = from > 0 ? text.slice(from, text.lastIndexOf('}') + 1) : text;
  try {
    return JSON.parse(body);
  } catch {
    return JSON.parse(repair(body));
  }
}
