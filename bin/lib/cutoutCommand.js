/**
 * `nearedit cutout` — make the person cutouts a document still lacks, with
 * the server's own pipeline: for each media file that a clip with cutout on
 * plays, the stretch those clips use, into `.nearedit/cutout/` beside the
 * document. Loading the document afterwards finds them (`cutoutClips.js`).
 * @module bin/lib/cutoutCommand
 */

import { basename } from 'node:path';
import { hasCutout } from '#utils/cutout/index.js';
import { UsageError, parseArgs } from './args.js';
import { byLevel, describe, DocumentError, loadDocument } from './document.js';

/** @typedef {{ out: (line: string) => void, err: (line: string) => void }} Io */

const OPTIONS = {
  media: { type: /** @type {'list'} */ ('list') },
};

/**
 * Progress of one cutout on stderr: a line that updates in a terminal, a
 * line every tenth otherwise.
 * @param {Io} io
 * @returns {{ at: (done: number, total: number) => void, end: () => void }}
 */
function progressLine(io) {
  const live = process.stderr.isTTY;
  let shown = 0;
  return {
    at(done, total) {
      const tenth = Math.floor((done / total) * 10);
      if (live) process.stderr.write(`\rcutout: frame ${done} of ${total}`);
      else if (tenth > shown && tenth < 10) io.err(`cutout ${tenth * 10}%`);
      shown = Math.max(shown, tenth);
    },
    end() {
      if (live) process.stderr.write('\r\x1b[K');
    },
  };
}

/**
 * @param {string[]} argv
 * @param {Io} io
 * @returns {Promise<number>} Exit code: 0 done (or nothing to do), 130 interrupted
 * @throws {DocumentError} When the document cannot be read, or no cutout can be made
 */
export async function cutoutCommand(argv, io) {
  const { values, rest } = parseArgs(argv, OPTIONS, 'cutout');
  if (rest.length !== 1)
    throw new UsageError('cutout takes one document: an EDL JSON file.', 'cutout');
  const loaded = loadDocument(rest[0], { media: values.media });
  const { errors } = byLevel(loaded.findings);
  for (const line of describe(errors)) io.err(line);
  if (errors.length)
    throw new DocumentError(`${loaded.file} cannot be used: ${errors.length} error(s) above`);
  if (!loaded.uncut.length) {
    const any = loaded.edl.tracks.some((/** @type {any} */ track) => track.clips.some(hasCutout));
    io.err(any ? 'every cutout is made: nothing to do' : 'no clip has "cutout" on: nothing to do');
    return 0;
  }
  // Loaded late: only now is it known that a matte program will be needed.
  const { cutoutStatus, makeCutout } = await import('../../src/api/cutout/index.js');
  const status = await cutoutStatus();
  if (!status.available) throw new DocumentError(`No cutout can be made: ${status.reason}`);
  const stop = new AbortController();
  const interrupt = () => stop.abort();
  process.once('SIGINT', interrupt).once('SIGTERM', interrupt);
  try {
    for (const { path, start, end, fps, frames } of loaded.uncut) {
      const seconds = `${Number(start.toFixed(2))}–${Number(end.toFixed(2))} s`;
      io.err(`cutting out ${basename(path)}: ${seconds}, ${frames} frames`);
      const progress = progressLine(io);
      const range = { folder: loaded.dir, path, start, end, fps };
      try {
        const made = await makeCutout({ ...range, signal: stop.signal, onProgress: progress.at });
        progress.end();
        io.out(made.file);
      } catch (err) {
        progress.end();
        if (!stop.signal.aborted) throw new DocumentError(err.detail || err.message);
        io.err('cutout cancelled');
        return 130;
      }
    }
  } finally {
    process.off('SIGINT', interrupt).off('SIGTERM', interrupt);
  }
  return 0;
}
