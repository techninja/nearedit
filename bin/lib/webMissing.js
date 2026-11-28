/**
 * The step `render` and `frame` take before anything else: record the web
 * clips of the document that have no recording yet.
 * Reference: docs/app-spec/WEBCLIP.md § Command line.
 * @module bin/lib/webMissing
 */

import { recordToCache } from '../../src/api/web/cache.js';
import { loadDocument } from './document.js';
import { cliStorage, recordingSetup, withProgress } from './webRecord.js';

/**
 * Record the web clips of a document that have no recording yet, into
 * `.nearedit/web/` beside it.
 * @param {string} path - The document
 * @param {{ allow?: string[], media?: string[] }} options
 * @param {import('./webRecord.js').Io} io
 * @returns {Promise<boolean>} False when the person cancelled
 * @throws {Error} When a clip cannot be recorded: no browser, a refused address, a missing target
 */
export async function recordWebClips(path, options, io) {
  const loaded = loadDocument(path, { media: options.media });
  // A recipe that cannot be recorded is reported with the rest of the document.
  if (loaded.findings.some((finding) => finding.level === 'error')) return true;
  // Two clips may share a recipe: one recording serves both.
  const wanted = new Map(loaded.unrecorded.map((entry) => [entry.key, entry.recipe]));
  if (!wanted.size) return true;
  const setup = await recordingSetup(options.allow);
  const folders = [loaded.dir, ...(options.media || [])];
  for (const recipe of wanted.values()) {
    const storage = cliStorage(recipe.storage, folders);
    const run = (/** @type {any} */ hooks) =>
      recordToCache({
        ...setup,
        ...hooks,
        folder: loaded.dir,
        recipe,
        fps: loaded.edl.fps,
        storage,
      });
    const recording = await withProgress(recipe.url, recipe, loaded.edl.fps, run, io);
    if (!recording) return false;
    for (const warning of recording.track.warnings) io.err(`warning ${warning}`);
  }
  return true;
}
