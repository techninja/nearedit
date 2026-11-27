/**
 * Turns transport failures of the LLM client into DirectorErrors with a
 * status and a message a user can act on.
 * @module api/director/llm/failures
 */

import { DirectorError, unavailable } from '../errors.js';

/**
 * @param {any} err - Whatever fetch or the stream threw
 * @param {''|'aborted'|'timeout'|'idle'} reason - Watchdog verdict
 * @param {{ provider: string, url: string }} cfg
 * @returns {Error}
 */
export function translateError(err, reason, cfg) {
  if (reason === 'aborted') {
    const cancelled = new DirectorError('Cancelled', { status: 499 });
    cancelled.name = 'AbortError';
    return cancelled;
  }
  if (reason === 'timeout' || reason === 'idle') {
    const what = reason === 'idle' ? 'stopped responding' : 'took too long';
    return new DirectorError(`The LLM server at ${cfg.url} ${what}`, { status: 504 });
  }
  if (err instanceof DirectorError) return err;
  const cause = err?.cause?.code || err?.cause?.message || err?.message || String(err);
  return unavailable(`Cannot reach the ${cfg.provider} LLM server at ${cfg.url}`, String(cause));
}

/**
 * Error for a non-2xx answer, with the server's own message when it sent one.
 * @param {{ status: number, text: () => Promise<string> }} res
 * @param {{ provider: string, url: string, model: string }} cfg
 * @returns {Promise<DirectorError>}
 */
export async function httpError(res, cfg) {
  let message = '';
  try {
    const body = await res.text();
    try {
      const parsed = JSON.parse(body);
      message = String(parsed.error?.message || parsed.error || parsed.message || '');
    } catch {
      message = body; // not JSON: show the raw body
    }
  } catch (err) {
    message = `unreadable body: ${err.message}`;
  }
  const detail = message.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (res.status === 401 || res.status === 403)
    return unavailable(
      `The LLM server at ${cfg.url} rejected the request (check LLM_API_KEY)`,
      detail,
    );
  if (res.status === 404)
    return unavailable(
      `The LLM server at ${cfg.url} has no model "${cfg.model}" or no chat endpoint`,
      detail,
    );
  return new DirectorError(`The LLM server answered HTTP ${res.status}`, { status: 502, detail });
}
