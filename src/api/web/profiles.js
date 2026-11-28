/**
 * The profile folders of the recording browser: every launch gets a fresh
 * one in the system's temporary folder. They are removed when a browser is
 * closed, when this process exits with browsers still open, and — for the
 * rare process that was killed outright — by the next launch, once they
 * are old.
 * @module api/web/profiles
 */

import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PROFILE_PREFIX = 'nearedit-web-';
/** Longer than any recording may run. */
const STALE_MS = 60 * 60_000;

/** Profile folder → how to end its browser at once. */
/** @type {Map<string, () => void>} */
const live = new Map();
let hooked = false;

/** Remove profile folders nobody can still be using. */
function sweepStale() {
  const dir = tmpdir();
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!name.startsWith(PROFILE_PREFIX) || live.has(path)) continue;
    try {
      if (Date.now() - statSync(path).mtimeMs > STALE_MS)
        rmSync(path, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[web] cannot clean ${path}: ${err.message}`);
    }
  }
}

/**
 * Make a profile folder.
 * @param {(profileDir: string) => () => void} killer - Given the folder, returns
 *   what ends the browser using it, synchronously
 * @returns {string} The folder
 */
export function createProfile(killer) {
  if (!hooked) {
    hooked = true;
    // The last line of defence: nothing asynchronous can run here.
    process.once('exit', () => {
      for (const [profileDir, kill] of live) {
        kill();
        rmSync(profileDir, { recursive: true, force: true });
      }
    });
    sweepStale();
  }
  const profileDir = mkdtempSync(join(tmpdir(), PROFILE_PREFIX));
  live.set(profileDir, killer(profileDir));
  return profileDir;
}

/**
 * Remove a profile folder once its browser is gone.
 * @param {string} profileDir
 */
export function removeProfile(profileDir) {
  live.delete(profileDir);
  // Chrome's children may still be letting go of files.
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
