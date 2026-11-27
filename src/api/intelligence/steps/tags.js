/**
 * Tags step — a vision model describes a handful of representative frames;
 * the answers become file-level tags, a description and per-frame keyframes.
 * @module api/intelligence/steps/tags
 */

import { resolveVision } from '../vision/index.js';
import { extractFrame, pickFrameTimes } from '../vision/frames.js';
import { aggregate, parseReply } from '../vision/reply.js';

/** @typedef {import('./types.js').Step} Step */

export const TAG_DEFAULTS = { frames: 5, maxFrames: 12 };

/**
 * Resolve the provider once per job (the check pings the server).
 * @param {Pick<import('./types.js').StepContext, 'settings'|'deps'|'cache'>} ctx
 * @returns {ReturnType<typeof resolveVision>}
 */
function vision(ctx) {
  if (!ctx.cache.has('vision')) ctx.cache.set('vision', resolveVision(ctx.settings, ctx.deps));
  return ctx.cache.get('vision');
}

/** @type {Step} */
export const tagsStep = {
  name: 'tags',
  jobType: 'tag',

  unsuitable(type, sidecar) {
    if (type === 'image') return '';
    if (type !== 'video') return `not applicable to ${type} files`;
    return sidecar?.hasVideo === false ? 'no video stream' : '';
  },

  done: (sidecar) => Array.isArray(sidecar?.keyframes),

  async available(ctx) {
    const resolved = await vision(ctx);
    const summary = `${resolved.name}: ${resolved.detail}`;
    if (resolved.available) return { available: true, detail: summary };
    return { available: false, detail: `no vision provider (${summary})`, reason: summary };
  },

  async run(filePath, ctx) {
    const { provider, detail } = await vision(ctx);
    if (!provider) throw new Error(`No vision provider: ${detail}`);
    const wanted = Math.round(ctx.options.frames ?? TAG_DEFAULTS.frames);
    const count = Math.max(1, Math.min(TAG_DEFAULTS.maxFrames, wanted));
    const times =
      ctx.type === 'image'
        ? [null]
        : pickFrameTimes({ duration: ctx.sidecar?.duration, scenes: ctx.sidecar?.scenes, count });

    const keyframes = [];
    let failure = null;
    for (const [index, time] of times.entries()) {
      try {
        const jpeg = await extractFrame(ctx.deps.run, filePath, time, { signal: ctx.signal });
        const reply = parseReply(await provider.describe(jpeg, { signal: ctx.signal }));
        keyframes.push({ time: time ?? 0, tags: reply.tags, description: reply.description });
      } catch (err) {
        if (ctx.signal?.aborted) throw err;
        failure = err; // one bad frame should not lose the others
        ctx.log(`Tagging the frame at ${time ?? 0}s failed: ${err.message}`);
      }
      ctx.progress((index + 1) / times.length);
    }
    if (!keyframes.length) throw failure || new Error('No frame could be tagged');
    return aggregate(keyframes);
  },

  summary: (patch) => ({ tags: patch.tags.length, keyframes: patch.keyframes.length }),
};
