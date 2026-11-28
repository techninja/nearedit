/**
 * Recording a demo's recipe from inside the director job: through the web
 * clip recorder, into the project's own `.nearedit/web/` folder — so the
 * clip can be opened and recorded again in the editor — with the job's
 * progress and cancellation. One recording at a time, as the recorder asks.
 * @module api/director/web/record
 */

import { createLimiter } from '../../lib/concurrency.js';
import { getConfig } from '../../lib/config.js';
import { recordToCache } from '../../web/cache.js';
import { asDirectorError } from './check.js';

/** @type {ReturnType<typeof createLimiter>|null} */
let turns = null;

/** Share of the job a recording takes: from, to (percent). */
const SPAN = [34, 92];

/**
 * @param {Object} options
 * @param {import('../pipeline.js').ActionContext} options.ctx
 * @param {import('#utils/web/types.js').Recipe} options.recipe - Normalised
 * @param {string} options.browser
 * @param {typeof recordToCache} [options.record] - Tests pass their own
 * @returns {Promise<import('../../web/cache.js').Recording>}
 * @throws {import('../errors.js').DirectorError} In the recorder's words
 */
export async function recordDemo({ ctx, recipe, browser, record = recordToCache }) {
  const { web, jobs } = getConfig();
  turns ||= createLimiter(jobs.webConcurrency);
  let shown = -1;
  const onFrame = (/** @type {number} */ done, /** @type {number} */ total) => {
    const percent = Math.floor(SPAN[0] + ((SPAN[1] - SPAN[0]) * done) / total);
    if (percent === shown) return;
    shown = percent;
    ctx.progress(percent, `recording frame ${done} of ${total}`);
  };
  try {
    return await turns(() =>
      record({
        ...{ folder: ctx.projectDir, recipe, fps: ctx.format.fps, browser },
        ...{ allow: web.allow, noSandbox: web.noSandbox, signal: ctx.signal, onFrame },
      }),
    );
  } catch (err) {
    throw asDirectorError(err);
  }
}
