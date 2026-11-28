/**
 * The unfinished file of a render: written under a name of its own beside
 * the place it is moved to when complete, so a rendering that exists is
 * always whole — and what a killed process left behind can be told apart
 * and removed.
 * @module api/music/partial
 */

import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** A partial file of ours: `<name>.wav.<pid>-<time>-<n>.part`. */
const PART = /\.wav\.\d+-[0-9a-z]+-\d+\.part$/;
/** Longer than a render goes without writing: a partial file this old belongs to nobody. */
const STALE_MS = 30 * 60_000;
let serial = 0;

/**
 * @param {string} output - The file a render will become
 * @returns {string} The name it is written under, unique to this render
 */
export function partialPath(output) {
  return `${output}.${process.pid}-${Date.now().toString(36)}-${serial++}.part`;
}

/**
 * Remove what a process that was killed outright left half-written.
 * @param {string} dir - A folder of renderings
 */
export function sweepPartials(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return; // no folder yet: nothing was ever rendered here
  }
  for (const name of names.filter((entry) => PART.test(entry))) {
    const path = join(dir, name);
    try {
      if (Date.now() - statSync(path).mtimeMs > STALE_MS) rmSync(path, { force: true });
    } catch (err) {
      console.warn(`[music] cannot clean ${path}: ${err.message}`);
    }
  }
}
