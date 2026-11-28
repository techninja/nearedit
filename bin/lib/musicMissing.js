/**
 * The step `render` and `frame` take before anything else, beside recording
 * web clips: render the music clips of the document that have no rendering
 * yet. It needs nothing but the engine, so it always works.
 * Reference: docs/app-spec/MUSIC.md § Server and command line.
 * @module bin/lib/musicMissing
 */

import { songLabel } from '#utils/music/label.js';
import { renderMusic } from '../../src/api/music/cache.js';
import { loadDocument } from './document.js';
import { withProgress } from './musicRender.js';

/**
 * Render the music clips of a document that have no rendering yet, into
 * `.nearedit/music/` beside it.
 * @param {string} path - The document
 * @param {{ media?: string[] }} options
 * @param {import('./musicRender.js').Io} io
 * @returns {Promise<boolean>} False when the person cancelled
 * @throws {Error} When a song cannot be rendered: its folder cannot be written
 */
export async function renderMusicClips(path, options, io) {
  const loaded = loadDocument(path, { media: options.media });
  // A song that cannot be rendered is reported with the rest of the document.
  if (loaded.findings.some((finding) => finding.level === 'error')) return true;
  // Split clips share a song: one rendering serves them all.
  const wanted = new Map(loaded.unrendered.map((entry) => [entry.key, entry.song]));
  for (const song of wanted.values()) {
    const run = (/** @type {any} */ hooks) => renderMusic({ folder: loaded.dir, song, ...hooks });
    if (!(await withProgress(`music: ${songLabel(song)}`, song, run, io))) return false;
  }
  return true;
}
