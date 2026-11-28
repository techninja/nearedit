/**
 * The unfinished file of a cutout: written under a name of its own beside
 * the place it is moved to when complete, so a cutout that exists is always
 * whole — and what a killed process left behind can be told apart and
 * removed. As `music/partial.js` does for renderings.
 * @module api/cutout/partial
 */

import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** A partial file of ours: `<key>.mp4.<pid>-<time>-<n>.part`. */
const PART = /\.mp4\.\d+-[0-9a-z]+-\d+\.part$/;
/** Longer than a cutout goes without writing: a partial file this old belongs to nobody. */
const STALE_MS = 60 * 60_000;
let serial = 0;

/**
 * @param {string} output - The file a cutout will become
 * @returns {string} The name it is written under, unique to this run
 */
export function partialPath(output) {
  return `${output}.${process.pid}-${Date.now().toString(36)}-${serial++}.part`;
}

/**
 * Remove what a process that was killed outright left half-written.
 * @param {string} dir - A folder of cutouts
 */
export function sweepPartials(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return; // no folder yet: nothing was ever cut out here
  }
  for (const name of names.filter((entry) => PART.test(entry))) {
    const path = join(dir, name);
    try {
      if (Date.now() - statSync(path).mtimeMs > STALE_MS) rmSync(path, { force: true });
    } catch (err) {
      console.warn(`[cutout] cannot clean ${path}: ${err.message}`);
    }
  }
}

/**
 * Remove a partial file the moment its run is cancelled, not only once the
 * run has wound down: a server that is shutting down does not wait for that.
 * @param {string} partial
 * @param {AbortSignal} signal
 * @returns {() => void} Call when the run is over: stops waiting for the signal
 */
export function removeOnAbort(partial, signal) {
  const remove = () => {
    try {
      rmSync(partial, { force: true });
    } catch (err) {
      // Still held open (Windows): the run's own clean-up removes it when the process is gone.
      console.warn(`[cutout] cannot remove ${partial} yet: ${err.message}`);
    }
  };
  signal.addEventListener('abort', remove, { once: true });
  return () => signal.removeEventListener('abort', remove);
}
