/**
 * HTTP error plumbing shared by the routers: a throwable error that carries
 * a status, the JSON 404 for unknown API routes, and the error middleware.
 * Error bodies follow API.md: `{ error, detail?, fields? }`.
 * @module api/lib/httpErrors
 */

/** An error that knows which HTTP status and JSON body it should produce. */
export class HttpError extends Error {
  /**
   * @param {number} status - 4xx or 5xx
   * @param {string} message - Becomes `error` in the response body
   * @param {{ detail?: string, fields?: Record<string, string> }} [extra]
   */
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.detail = extra.detail;
    this.fields = extra.fields;
  }
}

/**
 * Throw a 422 when any field failed validation.
 * @param {Record<string, string>} fields - Field name → problem
 */
export function assertValid(fields) {
  if (Object.keys(fields).length) throw new HttpError(422, 'Validation failed', { fields });
}

/** Problems raised by the body parser, by `err.type`. */
const BODY_ERRORS = {
  'entity.parse.failed': 'Malformed JSON body',
  'entity.too.large': 'Request body too large',
  'encoding.unsupported': 'Unsupported content encoding',
  'charset.unsupported': 'Unsupported charset',
  'request.aborted': 'Request aborted',
};

/**
 * @param {any} err
 * @returns {number} A valid error status; anything unknown is a 500
 */
function statusOf(err) {
  const status = err?.status ?? err?.statusCode;
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

/**
 * JSON 404 for anything under /api that no router claimed.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function apiNotFound(req, res) {
  res.status(404).json({ error: 'Unknown API route', detail: `${req.method} ${req.path}` });
}

/**
 * Express error middleware. Expected failures (HttpError, body-parser and
 * static-file errors) answer with their own status; anything else is logged
 * with its stack and answered as a 500 — the process keeps running.
 * @param {any} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = statusOf(err);
  const message = String(err?.message || err || 'Unknown error');
  if (status >= 500) {
    console.error(`[http] ${req.method} ${req.originalUrl} failed:`, err?.stack || err);
    return res.status(status).json({ error: 'Internal server error', detail: message });
  }
  /** @type {{ error: string, detail?: string, fields?: Record<string, string> }} */
  const body = { error: message };
  const bodyError = BODY_ERRORS[err.type];
  if (bodyError) Object.assign(body, { error: bodyError, detail: message });
  if (err.detail) body.detail = String(err.detail);
  if (err.fields) body.fields = err.fields;
  res.status(status).json(body);
}
