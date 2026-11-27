/**
 * Running the FFmpeg passes of a render: one pass for a short timeline;
 * for a long one, a picture pass per segment and a final pass that joins
 * them and mixes the sound.
 * @module api/render/passes
 */

import { writeFileSync } from 'node:fs';
import { run } from '../lib/ffmpeg.js';
import { buildMuxPlan } from './mux.js';
import { buildRenderPlan } from './plan.js';
import { createProgressReader } from './progress.js';
import { renderSegments } from './segments.js';

/** Share of the progress bar given to the picture segments. */
const PICTURE_SHARE = 95;

/**
 * Write a plan's files and run it, mapping its progress into a slice of the
 * job's 0..100.
 * @param {import('./plan.js').RenderPlan} plan
 * @param {import('../lib/jobs.js').JobContext} ctx
 * @param {number} from - Job percent when this pass starts
 * @param {number} share - Job percent this pass covers
 */
async function runPass(plan, ctx, from, share) {
  for (const file of plan.files) writeFileSync(file.path, file.content);
  const report = (percent) => ctx.progress(Math.min(99, from + (percent * share) / 100));
  const reader = createProgressReader(plan.duration, report);
  try {
    await run('ffmpeg', plan.args, { signal: ctx.signal, onStderr: reader.line });
  } catch (err) {
    if (err.killedBy) throw err;
    throw new Error(`FFmpeg failed: ${reader.errors.slice(-6).join(' | ') || err.message}`);
  }
}

/**
 * Encode an EDL to `options.outputPath`.
 * @param {object} edl
 * @param {import('./context.js').PlanOptions & { workDir: string, outputPath: string,
 *   maxLayers?: number, minFrames?: number }} options
 * @param {import('../lib/jobs.js').JobContext} ctx
 * @returns {Promise<import('./plan.js').RenderPlan & { segments: number }>} The plan
 *   of the (last) pass, with the warnings of all passes
 */
export async function encodeTimeline(edl, options, ctx) {
  const segments = renderSegments(edl, options);
  if (segments.length === 1) {
    const plan = buildRenderPlan(edl, options);
    for (const warning of plan.warnings) ctx.log(`Warning: ${warning}`);
    ctx.log(`Encoding ${plan.frames} frames at ${plan.width}x${plan.height}`);
    await runPass(plan, ctx, 0, 100);
    return { ...plan, segments: 1 };
  }

  const total = segments.reduce((sum, segment) => sum + segment.frames, 0);
  ctx.log(`Encoding ${total} frames in ${segments.length} segments`);
  const warnings = new Set();
  const parts = [];
  let done = 0;
  for (const [index, segment] of segments.entries()) {
    const file = `segment-${String(index).padStart(5, '0')}.mp4`;
    const plan = buildRenderPlan(edl, {
      ...options,
      range: { start: segment.start, end: segment.end },
      streams: 'video',
      outputPath: `${options.workDir}/${file}`,
    });
    for (const warning of plan.warnings) warnings.add(warning);
    const share = (segment.frames / total) * PICTURE_SHARE;
    await runPass(plan, ctx, (done / total) * PICTURE_SHARE, share);
    parts.push({ file, frames: plan.frames });
    done += segment.frames;
  }
  for (const warning of warnings) ctx.log(`Warning: ${warning}`);
  ctx.log('Joining segments and mixing audio');
  const mux = buildMuxPlan(edl, { ...options, parts });
  await runPass(mux, ctx, PICTURE_SHARE, 100 - PICTURE_SHARE);
  return { ...mux, warnings: [...warnings], segments: segments.length };
}
