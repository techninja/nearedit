/**
 * Rendering the picture segments of a timeline, several at a time: a
 * filter-graph segment is one FFmpeg run, a canvas segment is drawn by a
 * canvas worker. How many run at once is bounded, so memory stays
 * predictable; the first failure stops the rest.
 * @module api/render/parts
 */

import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { run } from '../lib/ffmpeg.js';
import { createCanvasWorkers } from './canvas/workers.js';
import { buildRenderPlan } from './plan.js';
import { createProgressReader } from './progress.js';

/**
 * How many segments render at once: `RENDER_WORKERS`, or half the cores
 * (each segment already runs a multi-threaded encoder), between 1 and 4.
 * @param {Record<string, string|undefined>} [env]
 * @returns {number}
 */
export function workerCount(env = process.env) {
  const asked = parseInt(env.RENDER_WORKERS || '', 10);
  if (asked > 0) return Math.min(asked, 16);
  return Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
}

/**
 * File name of a picture segment inside the work directory.
 * @param {number} index
 * @returns {string}
 */
export const segmentFile = (index) => `segment-${String(index).padStart(5, '0')}.mp4`;

/**
 * Write a plan's files and run it.
 * @param {import('./plan.js').RenderPlan} plan
 * @param {{ signal?: AbortSignal, onPercent?: (percent: number) => void }} [hooks]
 * @throws {Error} With FFmpeg's last words; `killedBy` set when it was aborted
 */
export async function runPass(plan, { signal, onPercent = () => {} } = {}) {
  for (const file of plan.files) writeFileSync(file.path, file.content);
  const reader = createProgressReader(plan.duration, onPercent);
  try {
    await run('ffmpeg', plan.args, { signal, onStderr: reader.line });
  } catch (err) {
    if (err.killedBy) throw err;
    throw new Error(`FFmpeg failed: ${reader.errors.slice(-6).join(' | ') || err.message}`);
  }
}

/**
 * Run `work` over items, at most `limit` at a time. The first failure aborts
 * `stopper` and is thrown once everything in flight has settled.
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<void>} work
 * @param {AbortController} stopper
 */
async function inParallel(items, limit, work, stopper) {
  /** @type {Error|null} */
  let failure = null;
  let next = 0;
  const lane = async () => {
    while (next < items.length && !failure && !stopper.signal.aborted) {
      const index = next++;
      try {
        await work(items[index], index);
      } catch (err) {
        failure ||= err;
        stopper.abort();
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  if (failure) throw failure;
}

/**
 * Render every segment to its file in the work directory (`segmentFile`).
 * @param {object} edl
 * @param {ReturnType<typeof import('./segments.js').renderSegments>} segments
 * @param {import('./context.js').PlanOptions & { workDir: string, workers?: number }} options
 * @param {{ signal: AbortSignal, log: (message: string) => void,
 *   onFrames: (done: number) => void }} hooks - `onFrames` gets the frames
 *   finished so far, over all segments
 * @returns {Promise<string[]>} Warnings: things the render could not honour
 */
export async function renderParts(edl, segments, options, hooks) {
  const stopper = new AbortController();
  const cancel = () => stopper.abort();
  hooks.signal.addEventListener('abort', cancel, { once: true });
  const { probes, preset, lossless, words } = options;
  const warnings = new Set();
  const warn = (/** @type {string} */ message) => warnings.add(message);
  const canvas = createCanvasWorkers(
    edl,
    { probes, preset, lossless, words },
    { signal: stopper.signal, warn },
  );
  const done = segments.map(() => 0);
  const report = (index, frames) => {
    done[index] = frames;
    hooks.onFrames(done.reduce((sum, value) => sum + value, 0));
  };
  const renderOne = async (segment, index) => {
    const part = { range: segment, outputPath: `${options.workDir}/${segmentFile(index)}` };
    if (segment.engine === 'canvas') {
      await canvas.render(part, (frames) => report(index, frames));
    } else {
      const graphName = `graph-${String(index).padStart(5, '0')}.txt`;
      const plan = buildRenderPlan(edl, { ...options, ...part, streams: 'video', graphName });
      for (const warning of plan.warnings) warn(warning);
      const onPercent = (percent) => report(index, (percent / 100) * segment.frames);
      await runPass(plan, { signal: stopper.signal, onPercent });
    }
    report(index, segment.frames);
  };
  try {
    await inParallel(segments, options.workers || workerCount(), renderOne, stopper);
    return [...warnings];
  } catch (err) {
    if (!hooks.signal.aborted) throw err;
    throw Object.assign(new Error('render aborted'), { killedBy: 'aborted' });
  } finally {
    hooks.signal.removeEventListener('abort', cancel);
    await canvas.close();
  }
}
