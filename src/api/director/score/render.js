/**
 * Rendering a score from inside the director job: through the server's
 * music renderer, into the project's own `.nearedit/music/` folder — where
 * the editor looks for a music clip's rendering — with the job's progress
 * and cancellation. The same song asked for again finds its file.
 * @module api/director/score/render
 */

import { renderMusic } from '../../music/index.js';
import { DirectorError } from '../errors.js';

/** Share of the job a rendering takes: from, to (percent). */
const SPAN = [40, 92];

/**
 * @typedef {typeof renderMusic} Renderer - `({ folder, song, signal,
 *   onProgress }) → { file, key, duration, cached }`
 */

/**
 * @param {Object} options
 * @param {import('../pipeline.js').ActionContext} options.ctx
 * @param {any} options.song
 * @param {Renderer} [options.render] - Tests pass their own
 * @returns {Promise<import('../../music/index.js').Rendering>}
 * @throws {DirectorError} In the renderer's words, with its status
 */
export async function renderScore({ ctx, song, render = renderMusic }) {
  let shown = -1;
  const onProgress = (/** @type {number} */ done, /** @type {number} */ total) => {
    const percent = Math.floor(SPAN[0] + ((SPAN[1] - SPAN[0]) * done) / Math.max(1, total));
    if (percent === shown) return;
    shown = percent;
    ctx.progress(percent, `Rendering the music… ${Math.round((100 * done) / Math.max(1, total))}%`);
  };
  try {
    return await render({ folder: ctx.projectDir, song, signal: ctx.signal, onProgress });
  } catch (err) {
    // A cancelled render and anything unexpected travel on as they are.
    if (err.killedBy || !Number.isInteger(err.status)) throw err;
    throw new DirectorError(err.message, { status: err.status, detail: err.detail });
  }
}
