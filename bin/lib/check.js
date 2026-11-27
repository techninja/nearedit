/**
 * The full check of a document before the command line does anything with
 * it: load it (`document.js`), probe its media, validate it against the
 * schema and its invariants, and make sure there is something to render.
 * @module bin/lib/check
 */

import { validateEdl } from '#utils/edl/validate.js';
import { prepareRender } from '../../src/api/render/prepare.js';
import { renderSegments } from '../../src/api/render/segments.js';
import { byLevel, loadDocument } from './document.js';

/**
 * @typedef {import('./document.js').Loaded & { probes: Record<string, any>,
 *   capabilities: object, valid: boolean,
 *   segments: ReturnType<typeof renderSegments> }} Checked
 */

/**
 * Load and check a document.
 * @param {string} path
 * @param {{ media?: string[] }} [options]
 * @returns {Promise<Checked>} `valid` is false when any finding is an error;
 *   `probes` and `capabilities` are what a render of it needs, `segments`
 *   the stretches it will be rendered in, each with its renderer
 * @throws {import('./document.js').DocumentError} When the file is not a document
 */
export async function checkDocument(path, options = {}) {
  const loaded = loadDocument(path, options);
  const { findings, edl } = loaded;
  const fail = (/** @type {string} */ message, where = '') =>
    void findings.push({ path: where, level: 'error', message });
  let prepared = { probes: {}, capabilities: {} };
  /** @type {ReturnType<typeof renderSegments>} */
  let segments = [];
  // Nothing is probed while a path is missing or not allowed.
  if (!byLevel(findings).errors.length) {
    try {
      prepared = await prepareRender(edl);
    } catch (err) {
      fail(err.message);
    }
    const durations = new Map(
      Object.entries(prepared.probes).map(([file, probe]) => [file, probe.duration]),
    );
    for (const problem of validateEdl(edl, { sourceDurations: durations }).problems) {
      // The renderer copes with a clip that outlasts its file; say what it does.
      const outlasts = /exceeds the source duration/.test(problem.message);
      const message = outlasts
        ? `${problem.message}: the last frame is held, the sound ends`
        : problem.message;
      findings.push({ path: problem.path, message, level: outlasts ? 'warning' : 'error' });
    }
    try {
      // Also refuses what a forced renderer (RENDER_ENGINE) cannot draw.
      segments = renderSegments(edl);
    } catch (err) {
      fail(err.message);
    }
  }
  return { ...loaded, ...prepared, segments, valid: !byLevel(findings).errors.length };
}
