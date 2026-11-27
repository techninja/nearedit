/**
 * The joining pass of a segmented render: the already encoded picture
 * segments are concatenated without re-encoding while the sound of the
 * whole range is mixed alongside. Audio is never segmented — a seek in the
 * middle of a music bed could click — and its sources are opened one after
 * another, so it scales on its own. Pure.
 * @module api/render/mux
 */

import { buildAudioGraph } from './audioGraph.js';
import { createContext, GLOBAL_ARGS, PROGRESS_ARGS } from './context.js';
import { num } from './expr.js';
import { describePlan } from './plan.js';
import { audioArgs, CONTAINER_ARGS } from './presets.js';

const LIST_NAME = 'segments.ffconcat';

/**
 * @param {{ fps?: number, resolution?: string, tracks?: any[] }} edl
 * @param {import('./context.js').PlanOptions & {
 *   parts: { file: string, frames: number }[] }} options - `parts` are the
 *   segment files, by name inside `workDir`, with their exact frame counts
 * @returns {import('./plan.js').RenderPlan}
 */
export function buildMuxPlan(edl, options) {
  const ctx = createContext(edl, { ...options, graphName: 'mix.txt' });
  const { preset, timing, workDir } = ctx;
  // Stated durations keep every segment exactly on the frame grid.
  const list = ['ffconcat version 1.0'];
  for (const part of options.parts)
    list.push(`file ${part.file}`, `duration ${num(part.frames / timing.fps, 6)}`);
  const listPath = `${workDir ? `${workDir}/` : ''}${LIST_NAME}`;
  ctx.files.push({ path: listPath, content: `${list.join('\n')}\n` });
  ctx.inputs.push({
    file: listPath,
    kind: 'segments',
    clipId: '',
    args: ['-f', 'concat', '-i', listPath],
  });

  const filterComplex = buildAudioGraph(ctx.tracks, ctx).chains.join(';\n');
  const args = [
    ...GLOBAL_ARGS,
    ...PROGRESS_ARGS,
    ...ctx.inputs.flatMap((input) => input.args),
    ...ctx.graphArgs(filterComplex),
    ...['-map', '0:v:0', '-c:v', 'copy'],
    ...['-map', '[aout]', ...audioArgs(preset)],
    ...CONTAINER_ARGS,
    options.outputPath || 'output.mp4',
  ];
  return describePlan(ctx, args, filterComplex);
}
