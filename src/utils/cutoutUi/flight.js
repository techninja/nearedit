/**
 * One request for the cutout of one media file, from asking to attaching:
 * is the server able, make it (following the job's progress), put the
 * result into the document, and make sure the document took it. How it
 * ends decides whether the same stretch may be asked for again by itself.
 * Everything it touches is handed in (`LifecycleDeps`).
 * @module utils/cutoutUi/flight
 */

import { covers } from './needs.js';

/** @typedef {import('./state.js').FileJob} FileJob */
/** @typedef {import('./needs.js').Need} Need */

/**
 * What the life of a cutout needs of its surroundings.
 * @typedef {Object} LifecycleDeps
 * @property {() => Need[]} needs - What the document needs now: `cutoutNeeds(getDoc())`
 * @property {() => boolean} busy - A drag is under way
 * @property {(need: Need, opts: { signal: AbortSignal,
 *   onProgress: (patch: Partial<FileJob>) => void }) => Promise<any>} make - Ask
 *   the server and follow the job; resolves to its result, rejects when it
 *   fails or `signal` fires
 * @property {(made: any) => Promise<void>|void} attach - Put a result into the document
 * @property {() => Promise<{ available: boolean, reason: string }>} available - Can
 *   the server make cutouts?
 * @property {(path: string, job: FileJob|null) => void} note - Publish where a file stands
 * @property {(ended: { path: string, made?: any, error?: string }) => void} [announce] - A
 *   cutout was made or failed
 * @property {number} [delay] - Quiet time before the document is looked at, ms
 */

/**
 * @typedef {Object} FlightWatch
 * @property {AbortSignal} signal - Fires when the request is cancelled
 * @property {(patch: Partial<FileJob>) => void} say - Publish the file's state
 * @property {() => boolean} live - False once the request was replaced or the
 *   lifecycle stopped: nothing more is said for the file
 * @property {() => boolean} stopped - The lifecycle stopped: nothing more is done
 */

/** A result that the document did not take: asking again would only loop. */
export const NOT_ATTACHED = 'The cutout was made, but it does not cover what the clip plays';

/**
 * Run one request to its end.
 * @param {LifecycleDeps} deps
 * @param {Need} need
 * @param {FlightWatch} watch
 * @returns {Promise<boolean>} True when the stretch is to be held: it
 *   failed, was cancelled, cannot be made on this server or was not taken —
 *   it is not asked for again until somebody says so
 */
export async function runFlight(deps, need, { signal, say, live, stopped }) {
  const { path } = need;
  say({});
  try {
    const status = await deps.available();
    if (!status.available) {
      say({ status: 'unavailable', message: status.reason });
      return true;
    }
    const made = await deps.make(need, { signal, onProgress: say });
    if (stopped()) return false;
    // Also when it was replaced meanwhile: the file is real and may cover some clips.
    await deps.attach(made);
    if (!live()) return false;
    const still = deps.needs().find((other) => other.path === path);
    if (still && covers(need, still)) {
      say({ status: 'error', message: NOT_ATTACHED });
      return true;
    }
    deps.note(path, null);
    deps.announce?.({ path, made });
    return false;
  } catch (err) {
    if (!live()) return false;
    const cancelled = signal.aborted;
    const error = cancelled ? '' : String(/** @type {any} */ (err)?.message || err);
    say({ status: cancelled ? 'cancelled' : 'error', message: error });
    if (!cancelled) deps.announce?.({ path, error });
    return true;
  }
}
