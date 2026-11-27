/**
 * The render plan: EDL → FFmpeg arguments and filter graph. No I/O happens
 * here — sources are described by the probes passed in and files the graph
 * needs (title text, the graph script) are returned for the caller to write.
 * @module api/render/plan
 */

import { buildAudioGraph } from './audioGraph.js';
import { createContext, GLOBAL_ARGS, PROGRESS_ARGS } from './context.js';
import { audioArgs, CONTAINER_ARGS, videoArgs } from './presets.js';
import { buildVideoGraph } from './videoGraph.js';

export { checkRenderable, renderableClips, renderSources } from './scope.js';

/**
 * @typedef {import('./context.js').PlanOptions} PlanOptions
 * @typedef {Object} RenderPlan
 * @property {string[]} args - Complete FFmpeg argument list
 * @property {string} filterComplex
 * @property {number} duration - Seconds of output
 * @property {{ index: number, file: string, kind: string, clipId: string, args: string[] }[]} inputs
 * @property {{ path: string, content: string }[]} files - To write before running
 * @property {string[]} warnings - Things the render could not honour
 * @property {number} width
 * @property {number} height
 * @property {number} fps
 * @property {number} frames
 */

/**
 * Describe a finished context as a plan.
 * @param {ReturnType<typeof createContext>} ctx
 * @param {string[]} args
 * @param {string} filterComplex
 * @returns {RenderPlan}
 */
export function describePlan(ctx, args, filterComplex) {
  const { timing, out } = ctx;
  return {
    ...{ args, filterComplex, duration: timing.duration },
    inputs: ctx.inputs.map((input, index) => ({ index, ...input })),
    files: ctx.files,
    warnings: ctx.warnings,
    ...{ width: out.width, height: out.height, fps: timing.fps, frames: timing.frames },
  };
}

/**
 * Build the plan for an EDL: one FFmpeg run that composites the picture
 * and, unless `streams` is "video", mixes the sound.
 * @param {{ fps?: number, resolution?: string, tracks?: any[] }} edl
 * @param {PlanOptions} [options]
 * @returns {RenderPlan}
 * @throws {import('./errors.js').RenderError} 422 for an unknown preset, an
 *   empty timeline or range, or a source without a probe
 */
export function buildRenderPlan(edl, options = {}) {
  const ctx = createContext(edl, options);
  const { preset, timing } = ctx;
  const sound = options.streams !== 'video';
  const chains = buildVideoGraph(ctx.tracks, ctx).chains;
  if (sound) chains.push(...buildAudioGraph(ctx.tracks, ctx).chains);
  const filterComplex = chains.join(';\n');
  const args = [
    ...GLOBAL_ARGS,
    ...PROGRESS_ARGS,
    ...ctx.inputs.flatMap((input) => input.args),
    ...ctx.graphArgs(filterComplex),
    ...['-map', '[vout]', ...videoArgs(preset, timing)],
    ...(sound ? ['-map', '[aout]', ...audioArgs(preset)] : ['-an']),
    ...CONTAINER_ARGS,
    options.outputPath || 'output.mp4',
  ];
  return describePlan(ctx, args, filterComplex);
}
