/**
 * `nearedit frame` — draw the frame a document shows at a moment, footage
 * included, as a PNG.
 * @module bin/lib/frameCommand
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { UsageError, parseArgs } from './args.js';
import { checkDocument } from './check.js';
import { byLevel, describe, DocumentError } from './document.js';

const OPTIONS = {
  time: { short: 't', type: /** @type {'number'} */ ('number') },
  output: { short: 'o', type: /** @type {'string'} */ ('string') },
  width: { short: 'w', type: /** @type {'number'} */ ('number') },
  media: { type: /** @type {'list'} */ ('list') },
  allow: { type: /** @type {'list'} */ ('list') },
};

/**
 * @param {string[]} argv
 * @param {{ out: (line: string) => void, err: (line: string) => void }} io
 * @returns {Promise<number>} Exit code
 */
export async function frameCommand(argv, io) {
  const { values, rest } = parseArgs(argv, OPTIONS, 'frame');
  if (rest.length !== 1)
    throw new UsageError('frame takes one document: an EDL JSON file.', 'frame');
  if (values.time === undefined)
    throw new UsageError('frame needs --time <seconds>: the moment to draw.', 'frame');
  if (values.time < 0) throw new UsageError('--time must not be negative.', 'frame');
  const { width } = values;
  if (width !== undefined && !(Number.isInteger(width) && width >= 16 && width <= 8192))
    throw new UsageError('--width must be a whole number of pixels from 16 to 8192.', 'frame');

  // Loaded late too: only a document with unrecorded web clips starts a browser. Music
  // clips are rendered as `render` renders them, so both leave the same files behind.
  const { renderMusicClips } = await import('./musicMissing.js');
  if (!(await renderMusicClips(rest[0], values, io))) return 130;
  const { recordWebClips } = await import('./webMissing.js');
  if (!(await recordWebClips(rest[0], values, io))) return 130;
  const checked = await checkDocument(rest[0], { media: values.media });
  for (const line of describe(checked.findings)) io.err(line);
  if (!checked.valid)
    throw new DocumentError(
      `${checked.file} cannot be drawn: ${byLevel(checked.findings).errors.length} error(s) above`,
    );
  // Loaded late: the canvas is only needed once the arguments are known to be good.
  const { renderStill } = await import('../../src/api/render/canvas/still.js');
  const { probes, words } = checked;
  const options = { probes, words, width, warn: io.err };
  const still = await renderStill(checked.edl, values.time, options);
  const stem = join(dirname(checked.file), basename(checked.file, extname(checked.file)));
  const named = values.output || `${stem}-${Number(still.time.toFixed(3))}s.png`;
  const output = resolve(extname(named) ? named : `${named}.png`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, still.canvas.toBuffer('image/png'));
  io.out(output);
  return 0;
}
