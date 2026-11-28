/**
 * The `web` job: record a recipe into its project's `.nearedit/web/`
 * folder — or find it already there. Progress is `frame n of m`;
 * cancelling ends the browser and FFmpeg and leaves no file.
 * Contract: WEBCLIP.md § Server.
 * @module api/web/job
 */

import { getConfig } from '../lib/config.js';
import { recordToCache } from './cache.js';
import { requireBrowser } from './status.js';

/**
 * Worker of a `web` job.
 * @param {ReturnType<typeof import('./request.js').parseRecordRequest>} request
 * @param {import('../lib/jobs.js').JobContext} ctx
 * @returns {Promise<import('./cache.js').Recording>}
 */
export async function runWebRecord(request, ctx) {
  const { web } = getConfig();
  const browser = await requireBrowser();
  let shown = -1;
  const recording = await recordToCache({
    ...{ folder: request.folder, recipe: request.recipe, fps: request.fps },
    ...{ storage: request.storage, browser, allow: web.allow, noSandbox: web.noSandbox },
    signal: ctx.signal,
    onFrame(done, total) {
      const percent = Math.min(99, Math.floor((done / total) * 100));
      if (percent === shown) return;
      shown = percent;
      ctx.progress(percent, `frame ${done} of ${total}`);
    },
  });
  ctx.log(recording.cached ? `Already recorded: ${recording.file}` : `Recorded ${recording.file}`);
  return recording;
}
