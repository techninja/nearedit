/**
 * `nearedit render` — encode a document to a video file, with the same
 * passes the server's render job runs.
 * @module bin/lib/renderCommand
 */

import { mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { encodeTimeline } from '../../src/api/render/passes.js';
import { UsageError, parseArgs, parseRange } from './args.js';
import { checkDocument } from './check.js';
import { byLevel, describe, DocumentError } from './document.js';
import { renderMusicClips } from './musicMissing.js';
import { recordWebClips } from './webMissing.js';

const OPTIONS = {
  output: { short: 'o', type: /** @type {'string'} */ ('string') },
  preset: { type: /** @type {'string'} */ ('string'), choices: ['draft', 'standard', 'high'] },
  range: { type: /** @type {'string'} */ ('string') },
  media: { type: /** @type {'list'} */ ('list') },
  allow: { type: /** @type {'list'} */ ('list') },
  workers: { type: /** @type {'number'} */ ('number') },
};

/**
 * Progress on stderr: one line that updates in a terminal, a line every
 * tenth otherwise (a log, a pipe, an agent reading the output).
 * @param {NodeJS.WriteStream} stream
 * @returns {{ at: (percent: number) => void, end: () => void }}
 */
function progressLine(stream) {
  let shown = -1;
  return {
    at(percent) {
      const whole = Math.floor(percent);
      if (stream.isTTY && whole !== shown) stream.write(`\rrendering ${whole}%`);
      else if (!stream.isTTY && Math.floor(whole / 10) > Math.floor(shown / 10))
        stream.write(`rendering ${Math.floor(whole / 10) * 10}%\n`);
      shown = Math.max(shown, whole);
    },
    end() {
      if (stream.isTTY && shown >= 0) stream.write('\r\x1b[K');
    },
  };
}

/**
 * @param {string[]} argv
 * @param {{ out: (line: string) => void, err: (line: string) => void }} io
 * @returns {Promise<number>} Exit code
 */
export async function renderCommand(argv, io) {
  const { values, rest } = parseArgs(argv, OPTIONS, 'render');
  if (rest.length !== 1)
    throw new UsageError('render takes one document: an EDL JSON file.', 'render');
  const range = values.range ? parseRange(values.range, 'render') : null;
  const { workers } = values;
  if (workers !== undefined && !(Number.isInteger(workers) && workers >= 1))
    throw new UsageError('--workers must be a whole number, 1 or more.', 'render');
  // Music clips are sound like any other once rendered, web clips footage once recorded:
  // make the missing ones first.
  if (!(await renderMusicClips(rest[0], values, io))) return 130;
  if (!(await recordWebClips(rest[0], values, io))) return 130;
  const checked = await checkDocument(rest[0], { media: values.media });
  for (const line of describe(checked.findings)) io.err(line);
  if (!checked.valid)
    throw new DocumentError(
      `${checked.file} cannot be rendered: ${byLevel(checked.findings).errors.length} error(s) above`,
    );

  const named =
    values.output || join(dirname(checked.file), basename(checked.file, extname(checked.file)));
  const output = resolve(extname(named) ? named : `${named}.mp4`);
  mkdirSync(dirname(output), { recursive: true });
  // Beside the output: the finished file is moved into place, never copied.
  const workDir = mkdtempSync(join(dirname(output), '.nearedit-work-'));
  const stop = new AbortController();
  const interrupt = () => stop.abort();
  process.once('SIGINT', interrupt).once('SIGTERM', interrupt);
  const progress = progressLine(process.stderr);
  const ctx = {
    job: /** @type {any} */ ({}),
    signal: stop.signal,
    progress: progress.at,
    log: (/** @type {string} */ message) => {
      progress.end();
      io.err(message);
    },
  };
  try {
    const partial = join(workDir, 'output.mp4');
    const { probes, capabilities } = checked;
    const options = { probes, capabilities, workDir, outputPath: partial, range };
    await encodeTimeline(
      checked.edl,
      { ...options, preset: values.preset, workers: values.workers },
      ctx,
    );
    renameSync(partial, output);
  } catch (err) {
    progress.end();
    if (!stop.signal.aborted) throw err;
    io.err('render cancelled');
    return 130;
  } finally {
    process.off('SIGINT', interrupt).off('SIGTERM', interrupt);
    rmSync(workDir, { recursive: true, force: true });
  }
  progress.end();
  io.out(output);
  return 0;
}
