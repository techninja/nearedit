/**
 * The recording of a recipe, made at most once: a pair that is on disk is
 * returned at once, and two requests for one key at the same moment share
 * one recording.
 * Contract: WEBCLIP.md § Recording.
 * @module api/web/cache
 */

import { compileScore, normalizeRecipe, recipeKey } from '#utils/web/index.js';
import { createSingleFlight } from '../lib/concurrency.js';
import { recordRecipe } from './record.js';
import { readRecording, recordingPaths } from './recordings.js';

export { readRecording, recordingPaths, webDir } from './recordings.js';

/** @typedef {import('./recordings.js').Recording} Recording */

const flights = createSingleFlight();

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
