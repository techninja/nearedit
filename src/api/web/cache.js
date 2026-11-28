/**
 * Recordings on disk: `<folder>/.nearedit/web/<key>.mp4` with the track
 * `<key>.json` beside it. A pair that exists is the recording of its
 * recipe — it is never made twice — and two requests for one key at the
 * same moment share one recording.
 * Contract: WEBCLIP.md § Recording.
 * @module api/web/cache
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { KEY_PATTERN, compileScore, normalizeRecipe, recipeKey } from '#utils/web/index.js';
import { createSingleFlight } from '../lib/concurrency.js';
import { readJson } from '../lib/registry.js';
import { recordRecipe } from './record.js';

/**
 * @typedef {Object} Recording - The result of a `web` job (WEBCLIP.md § Server)
 * @property {string} file - The MP4
 * @property {string} key
 * @property {number} duration
 * @property {number} fps
 * @property {number} width
 * @property {number} height
 * @property {string} title
 * @property {import('#utils/web/types.js').Track} track
 * @property {boolean} cached - True when nothing had to be recorded
 */

const flights = createSingleFlight();

/**
 * @param {string} folder - A project folder, or the folder of a document
 * @returns {string} Where its recordings live
 */
export const webDir = (folder) => join(folder, '.nearedit', 'web');

/**
 * @param {string} folder
 * @param {string} key
 * @returns {{ file: string, trackPath: string }}
 * @throws {Error} For something that is not a key (it would be a path)
 */
export function recordingPaths(folder, key) {
  if (!KEY_PATTERN.test(key)) throw new Error(`Not a recording key: ${key}`);
  return {
    file: join(webDir(folder), `${key}.mp4`),
    trackPath: join(webDir(folder), `${key}.json`),
  };
}

/**
 * The recording of a key, when it is complete.
 * @param {string} folder
 * @param {string} key
 * @returns {Recording|null}
 */
export function readRecording(folder, key) {
  const { file, trackPath } = recordingPaths(folder, key);
  if (!existsSync(file) || !existsSync(trackPath)) return null;
  /** @type {any} */
  const track = readJson(trackPath, null);
  if (!track || track.key !== key || !Array.isArray(track.steps)) return null;
  const { duration, fps, width, height, title } = track;
  return { file, key, duration, fps, width, height, title, track, cached: true };
}

/**
 * The recording of a recipe: the one on disk, or a new one.
 * @param {Omit<import('./record.js').RecordOptions, 'output'|'trackPath'|'key'> & { folder: string }} options -
 *   `recipe` may be raw; it is normalised here
 * @returns {Promise<Recording>}
 */
export async function recordToCache({ folder, ...options }) {
  const recipe = normalizeRecipe(options.recipe);
  const { fps } = compileScore(recipe, options.fps);
  const key = recipeKey(recipe, fps);
  const { file, trackPath } = recordingPaths(folder, key);
  for (;;) {
    const known = readRecording(folder, key);
    if (known) return known;
    try {
      return await flights(`${file}`, async () => {
        const track = await recordRecipe({ ...options, recipe, fps, key, output: file, trackPath });
        const { duration, width, height, title } = track;
        return { file, key, duration, fps, width, height, title, track, cached: false };
      });
    } catch (err) {
      // Someone else's recording of this key was cancelled, not ours: start again.
      if (err.killedBy !== 'aborted' || options.signal?.aborted) throw err;
    }
  }
}
