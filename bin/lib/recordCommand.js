/**
 * `nearedit record` — play one recipe in the browser and write the
 * recording, with its track beside it.
 * @module bin/lib/recordCommand
 */

import { mkdirSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { normalizeRecipe, recipeKey, validateRecipe } from '#utils/web/index.js';
import { recordRecipe } from '../../src/api/web/record.js';
import { UsageError, parseArgs } from './args.js';
import { DocumentError, parseFile } from './document.js';
import { cliStorage, recordingSetup, withProgress } from './webRecord.js';

const OPTIONS = {
  output: { short: 'o', type: /** @type {'string'} */ ('string') },
  fps: { type: /** @type {'number'} */ ('number') },
  allow: { type: /** @type {'list'} */ ('list') },
};

/**
 * @param {string[]} argv
 * @param {import('./webRecord.js').Io} io
 * @returns {Promise<number>} Exit code
 */
export async function recordCommand(argv, io) {
  const { values, rest } = parseArgs(argv, OPTIONS, 'record');
  if (rest.length !== 1) throw new UsageError('record takes one recipe: a JSON file.', 'record');
  const fps = values.fps ?? 30;
  if (!(fps >= 1 && fps <= 240)) throw new UsageError('--fps must be from 1 to 240.', 'record');
  const file = resolve(rest[0]);
  const raw = parseFile(file);
  const { valid, problems } = validateRecipe(raw);
  for (const { path, message } of problems) io.err(`error   ${path ? `${path}: ` : ''}${message}`);
  if (!valid)
    throw new DocumentError(`${file} cannot be recorded: ${problems.length} error(s) above`);
  const recipe = normalizeRecipe(raw);
  const named = values.output || join(dirname(file), basename(file, extname(file)));
  const output = resolve(extname(named) ? named : `${named}.mp4`);
  // Beside the recording, and never the recipe itself: demo.json → demo.mp4 + demo.track.json
  const trackPath = `${output.slice(0, -extname(output).length)}.track.json`;
  mkdirSync(dirname(output), { recursive: true });
  const setup = await recordingSetup(values.allow);
  const storage = cliStorage(recipe.storage, [dirname(file)]);
  const key = recipeKey(recipe, fps);
  const run = (/** @type {any} */ hooks) =>
    recordRecipe({ ...setup, ...hooks, recipe, fps, key, output, trackPath, storage });
  const track = await withProgress(recipe.url, recipe, fps, run, io);
  if (!track) return 130;
  for (const warning of track.warnings) io.err(`warning ${warning}`);
  io.out(output);
  return 0;
}
