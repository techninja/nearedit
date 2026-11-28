/**
 * The life of a cutout, the deciding half: looks at what the open document
 * needs cut out and keeps the server working on exactly that — one request
 * for each media file (`flight.js`), never two at once for the same file.
 *
 * - A change of the document is looked at only once it has been quiet for
 *   `delay` ms and no drag is under way: a trim drag starts no job.
 * - A request that no longer covers what is needed (a clip was trimmed
 *   past it, another clip of the file was switched on) is cancelled and
 *   replaced; one that nobody needs any more is cancelled.
 * - What failed, was cancelled by the person, or cannot be made on this
 *   server is held: it is not asked for again until `retry` — or until the
 *   stretch that is needed changes.
 *
 * Everything it touches is handed in, so it runs against a fake server.
 * @module utils/cutoutUi/lifecycle
 */

import { runFlight } from './flight.js';
import { covers, rangeKey } from './needs.js';

/** @typedef {import('./state.js').FileJob} FileJob */
/** @typedef {import('./needs.js').Need} Need */
/** @typedef {import('./flight.js').LifecycleDeps} LifecycleDeps */

/**
 * @typedef {Object} Lifecycle
 * @property {(ms?: number) => void} schedule - Look at the document after `ms` of quiet
 * @property {(path?: string) => void} retry - Ask again for what is held: one
 *   file, or all
 * @property {(path: string) => void} cancel - Stop making a file's cutout
 * @property {() => boolean} idle - Nothing under way and nothing scheduled
 * @property {() => void} stop - Stop looking; jobs under way carry on at the server
 */

/**
 * @param {LifecycleDeps} deps
 * @returns {Lifecycle}
 */
export function createLifecycle(deps) {
  const delay = deps.delay ?? 600;
  /** @type {Map<string, { need: Need, controller: AbortController, replaced: boolean }>} */
  const flying = new Map();
  /** @type {Map<string, string>} File → the stretch that is not asked for again by itself */
  const held = new Map();
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  let stopped = false;

  /** @param {number} [ms] */
  function schedule(ms = delay) {
    if (stopped) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(check, ms);
  }

  /** Compare what is needed with what is under way. */
  function check() {
    timer = null;
    if (deps.busy()) return schedule();
    const wanted = new Map(deps.needs().map((need) => [need.path, need]));
    for (const [path, flight] of flying) {
      const need = wanted.get(path);
      if (need && covers(flight.need, need)) continue;
      flight.replaced = true;
      flight.controller.abort();
    }
    for (const path of [...held.keys()]) {
      if (wanted.has(path)) continue;
      held.delete(path);
      deps.note(path, null);
    }
    for (const need of wanted.values()) {
      if (!flying.has(need.path) && held.get(need.path) !== rangeKey(need)) fly(need);
    }
  }

  /**
   * Start the request for a file and see it out.
   * @param {Need} need
   */
  async function fly(need) {
    const { path } = need;
    const flight = { need, controller: new AbortController(), replaced: false };
    flying.set(path, flight);
    /** @type {FileJob} */
    let job = {
      ...{ status: 'starting', progress: 0, frame: 0, frames: 0, message: '' },
      ...{ start: need.start, end: need.end },
    };
    const live = () => !flight.replaced && !stopped;
    const hold = await runFlight(deps, need, {
      signal: flight.controller.signal,
      say(patch) {
        job = { ...job, ...patch };
        if (live()) deps.note(path, job);
      },
      live,
      stopped: () => stopped,
    });
    if (hold) held.set(path, rangeKey(need));
    flying.delete(path);
    // What replaces it speaks for the file from here on, or nothing does.
    if (flight.replaced && !stopped) deps.note(path, null);
    schedule(0);
  }

  return {
    schedule,
    retry(path) {
      for (const file of path ? [path] : [...held.keys()]) held.delete(file);
      schedule(0);
    },
    cancel: (path) => flying.get(path)?.controller.abort(),
    idle: () => timer === null && flying.size === 0,
    stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
