/**
 * Can this server make cutouts? Asked once, when somebody first needs to
 * know, and remembered in `cutoutJobs.availability` for everyone who shows
 * it; a no is asked again only when a person asks for it.
 * Contract: docs/app-spec/CUTOUT.md § Server, `GET /cutout/status`.
 * @module utils/cutoutUi/availability
 */

import { serverStatus } from './request.js';
import { UNKNOWN, cutoutJobs } from './state.js';

/** @typedef {import('./state.js').Availability} Availability */

/** @type {Promise<Availability>|null} */
let asking = null;
/** The first, unasked-for question was put: a server that cannot be reached is not asked on. */
let tried = false;

/**
 * Ask the server whether it can make cutouts; everyone watching
 * `cutoutJobs` sees the answer. Questions asked at the same time share one.
 * @param {boolean} [fresh] - Have the server look again
 * @returns {Promise<Availability>}
 */
export function checkAvailability(fresh = false) {
  if (asking) return asking;
  cutoutJobs.set(({ availability }) => ({ availability: { ...availability, checking: true } }));
  asking = serverStatus(fresh)
    .then((status) => ({ ...status, known: true, checking: false }))
    .finally(() => (asking = null));
  asking.then(
    (availability) => cutoutJobs.set({ availability }),
    () => cutoutJobs.set({ availability: UNKNOWN }),
  );
  return asking;
}

/**
 * The lifecycle's question before every request: the server's answer is
 * remembered — a no until a person asks to look again (`retryCutout`).
 * @returns {Promise<Availability>}
 */
export function available() {
  const { availability } = cutoutJobs.get();
  return availability.known ? Promise.resolve(availability) : checkAvailability();
}

/**
 * Make sure the question was asked once — for a view that wants to say,
 * before anybody switches a cutout on, that the server cannot make one.
 */
export function ensureAvailability() {
  if (tried || cutoutJobs.get().availability.known) return;
  tried = true;
  checkAvailability().catch((err) => console.warn('[cutout] status failed:', err));
}

/** Forget the answer (tests). */
export function resetAvailability() {
  tried = false;
  cutoutJobs.set({ availability: UNKNOWN });
}
