/**
 * Whether this server can record web pages: what `GET /api/web/status`
 * says, asked once and remembered. When it cannot, `reason` is the
 * server's own sentence — why not, and exactly what to do about it.
 * @module utils/webUi/captureStatus
 */

import { api } from '#utils/api/http.js';
import { createObservable } from '#utils/ui/observable.js';

/**
 * @typedef {Object} CaptureState
 * @property {'unknown'|'loading'|'ready'|'failed'} status - Of the question itself
 * @property {boolean} available - A browser to record with was found
 * @property {string} reason - Why not, and what to do; '' when available
 * @property {string} version - The browser's version
 * @property {string[]} allow - Private addresses the server may record
 */

/** @type {CaptureState} */
const UNKNOWN = { status: 'unknown', available: false, reason: '', version: '', allow: [] };

/** @type {import('#utils/ui/observable.js').Observable<CaptureState>} */
export const captureState = createObservable({ ...UNKNOWN });

/** @type {Promise<CaptureState>|null} */
let asking = null;

/**
 * Ask the server whether it can record.
 * @param {{ fresh?: boolean }} [opts] - `fresh`: ask again (after installing a browser)
 * @returns {Promise<CaptureState>}
 */
export function loadCaptureStatus({ fresh = false } = {}) {
  if (asking && !fresh) return asking;
  if (captureState.get().status === 'ready' && !fresh) return Promise.resolve(captureState.get());
  captureState.set({ status: 'loading' });
  const mine = api(`/web/status${fresh ? '?fresh=1' : ''}`)
    .then((answer) => ({
      status: /** @type {const} */ ('ready'),
      available: answer?.available === true,
      reason: typeof answer?.reason === 'string' ? answer.reason : '',
      version: answer?.browser?.version || '',
      allow: Array.isArray(answer?.allow) ? answer.allow : [],
    }))
    .catch((err) => ({
      ...UNKNOWN,
      status: /** @type {const} */ ('failed'),
      reason: `The server could not say whether it can record web pages: ${err.message}`,
    }))
    .then((state) => {
      if (asking === mine) {
        asking = null;
        captureState.set(state);
      }
      return state;
    });
  asking = mine;
  return mine;
}

/** Forget the answer (tests, leaving the editor). */
export function resetCaptureStatus() {
  asking = null;
  captureState.set({ ...UNKNOWN });
}
