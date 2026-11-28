/**
 * `nearedit music` — render one song to a WAV file with NearEdit's own
 * synth: the sound a music clip holding that song has in a timeline.
 * @module bin/lib/musicCommand
 */

import { basename, dirname, extname, join, resolve } from 'node:path';
import { normalizeSong } from '#utils/music/normalize.js';
import { validateSong } from '#utils/music/validate.js';
import { renderSongFile } from '../../src/api/music/render.js';
import { UsageError, parseArgs } from './args.js';
import { DocumentError, parseFile } from './document.js';
import { withProgress } from './musicRender.js';

const OPTIONS = {
  output: { short: 'o', type: /** @type {'string'} */ ('string') },
};

/**
 * @param {string[]} argv
 * @param {import('./musicRender.js').Io} io
 * @returns {Promise<number>} Exit code
 */
export async function musicCommand(argv, io) {
  const { values, rest } = parseArgs(argv, OPTIONS, 'music');
  if (rest.length !== 1) throw new UsageError('music takes one song: a JSON file.', 'music');
  const file = resolve(rest[0]);
  const named = values.output || join(dirname(file), basename(file, extname(file)));
  const typed = extname(named).toLowerCase();
  if (typed && typed !== '.wav')
    throw new UsageError(
      `music writes WAV files: name the output ${basename(named, extname(named))}.wav.`,
      'music',
    );
  const raw = parseFile(file);
  const { valid, problems } = validateSong(raw);
  for (const { path, message } of problems) io.err(`error   ${path ? `${path}: ` : ''}${message}`);
  if (!valid)
    throw new DocumentError(`${file} cannot be rendered: ${problems.length} error(s) above`);
  const song = normalizeSong(raw);
  const output = resolve(typed ? named : `${named}.wav`);
  const run = (/** @type {any} */ hooks) => renderSongFile({ song, output, ...hooks });
  if (!(await withProgress(basename(file), song, run, io))) return 130;
  io.out(output);
  return 0;
}
