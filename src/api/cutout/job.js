/**
 * The `cutout` job: cut a person out of a stretch of a media file into its
 * project's `.nearedit/cutout/` folder — or find it already there. Progress
 * is `frame n of m`; cancelling ends FFmpeg and the matte program and
 * leaves no file. Contract: CUTOUT.md § Server.
 * @module api/cutout/job
 */

import { makeCutout } from './make.js';

/**
 * Worker of a `cutout` job.
 * @param {import('./request.js').CutoutRequest} request
 * @param {import('../lib/jobs.js').JobContext} ctx
 * @returns {Promise<import('./files.js').Cutout>}
 */
export async function runCutout(request, ctx) {
  const { folder, path, start, end, fps } = request;
  let shown = -1;
  const cutout = await makeCutout({
    ...{ folder, path, start, end, fps },
    signal: ctx.signal,
    onProgress(done, total) {
      const percent = Math.min(99, Math.floor((done / total) * 100));
      if (percent === shown) return;
      shown = percent;
      ctx.progress(percent, `frame ${done} of ${total}`);
    },
  });
  ctx.log(cutout.cached ? `Already cut out: ${cutout.file}` : `Cut out ${cutout.file}`);
  return cutout;
}
