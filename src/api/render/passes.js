/**
 * The passes of a render. A short timeline of plain footage is one FFmpeg
 * run. Anything else is rendered as picture segments — filter graph or
 * canvas, several at a time — and a final pass joins them without
 * re-encoding while it mixes the sound.
 * @module api/render/passes
 */

import { buildMuxPlan } from './mux.js';
import { renderParts, runPass, segmentFile, workerCount } from './parts.js';
import { buildRenderPlan } from './plan.js';
import { renderSegments } from './segments.js';

/** Share of the progress bar given to the picture segments. */
const PICTURE_SHARE = 95;

/** @typedef {ReturnType<typeof renderSegments>} Segments */

/**
 * The pass that finishes a render: the single pass of a short timeline of
 * plain footage, otherwise the joining pass over the segment files.
 * @param {object} edl
 * @param {import('./context.js').PlanOptions} options
 * @param {Segments} segments
 * @returns {import('./plan.js').RenderPlan}
 */
export function lastPass(edl, options, segments) {
  if (segments.length === 1 && segments[0].engine === 'ffmpeg')
    return buildRenderPlan(edl, options);
  const parts = segments.map(({ frames }, index) => ({ file: segmentFile(index), frames }));
  return buildMuxPlan(edl, { ...options, parts });
}

/**
 * Encode an EDL to `options.outputPath`.
 * @param {object} edl
 * @param {import('./context.js').PlanOptions & { workDir: string, outputPath: string,
 *   maxLayers?: number, minFrames?: number, chunkFrames?: number, workers?: number }} options
 * @param {import('../lib/jobs.js').JobContext} ctx
 * @returns {Promise<import('./plan.js').RenderPlan & { segments: number, drawn: number }>}
 *   The plan of the last pass, with the warnings of all passes; `drawn` is
 *   how many segments the compositor drew
 */
export async function encodeTimeline(edl, options, ctx) {
  const segments = renderSegments(edl, options);
  const drawn = segments.filter((segment) => segment.engine === 'canvas').length;
  const plan = lastPass(edl, options, segments);
  const warnings = [...plan.warnings];
  let pictureShare = 0;
  if (segments.length === 1 && !drawn) {
    ctx.log(`Encoding ${plan.frames} frames at ${plan.width}x${plan.height}`);
  } else {
    pictureShare = PICTURE_SHARE;
    const total = segments.reduce((sum, segment) => sum + segment.frames, 0);
    const workers = Math.min(options.workers || workerCount(), segments.length);
    const how = drawn ? `, ${drawn} drawn by the compositor` : '';
    ctx.log(`Encoding ${total} frames in ${segments.length} segments${how}, ${workers} at a time`);
    const onFrames = (done) => ctx.progress(Math.min(99, (done / total) * pictureShare));
    const hooks = { signal: ctx.signal, log: ctx.log, onFrames };
    warnings.push(...(await renderParts(edl, segments, { ...options, workers }, hooks)));
    ctx.log('Joining segments and mixing audio');
  }
  for (const warning of new Set(warnings)) ctx.log(`Warning: ${warning}`);
  const onPercent = (percent) =>
    ctx.progress(Math.min(99, pictureShare + (percent * (100 - pictureShare)) / 100));
  await runPass(plan, { signal: ctx.signal, onPercent });
  return { ...plan, warnings: [...new Set(warnings)], segments: segments.length, drawn };
}
