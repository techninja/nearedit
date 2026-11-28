/**
 * Errors of the web recorder. Every one of them is written for the person
 * who asked for the recording: it says what went wrong and, where there is
 * one, what to change.
 * @module api/web/errors
 */

/** An expected failure, with the HTTP status a route answers it with. */
export class WebError extends Error {
  /**
   * @param {number} status - 400, 403, 404, 422, 503…
   * @param {string} message
   * @param {{ detail?: string, fields?: Record<string, string>, step?: number }} [extra]
   */
  constructor(status, message, extra = {}) {
    super(message);
    this.name = 'WebError';
    this.status = status;
    this.detail = extra.detail || '';
    this.fields = extra.fields || null;
    /** Index of the step that failed, -1 when it was not a step. */
    this.step = extra.step ?? -1;
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

/** A DevTools command the browser refused, did not answer, or never received. */
export class ProtocolError extends Error {
  /**
   * @param {string} message
   * @param {{ method?: string, code?: number, closed?: boolean, timedOut?: boolean }} [facts]
   */
  constructor(message, facts = {}) {
    super(message);
    this.name = 'ProtocolError';
    this.method = facts.method || '';
    this.code = facts.code || 0;
    /** The browser went away: nothing more can be asked of it. */
    this.closed = !!facts.closed;
    this.timedOut = !!facts.timedOut;
  }
}

/** @returns {Error} What a cancelled recording throws, as `lib/ffmpeg.js` `run` does. */
export const aborted = () =>
  Object.assign(new Error('recording cancelled'), { killedBy: 'aborted' });
