/**
 * Render errors that carry the HTTP status a route should answer with.
 * @module api/render/errors
 */

/** An expected failure: bad request, empty timeline, unreadable source. */
export class RenderError extends Error {
  /**
   * @param {number} status - HTTP status (400, 403, 404, 422…)
   * @param {string} message
   * @param {{ detail?: string, fields?: Record<string, string> }} [extra]
   */
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'RenderError';
    this.status = status;
    this.detail = extra.detail || '';
    this.fields = extra.fields || null;
  }

  /** @returns {{ error: string, detail?: string, fields?: Record<string, string> }} */
  toJSON() {
    return {
      error: this.message,
      ...(this.detail && { detail: this.detail }),
      ...(this.fields && { fields: this.fields }),
    };
  }
}
