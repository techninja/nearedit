/**
 * Helpers for the render integration tests that run more than one FFmpeg
 * pass: the canvas path on its own, the whole encode with its segments and
 * workers, and the sound graph without a codec.
 * @module api/render/testRuns
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '../lib/ffmpeg.js';
import { buildAudioGraph } from './audioGraph.js';
import { renderCanvasSegment } from './canvas/segment.js';
import { createContext } from './context.js';
import { encodeTimeline } from './passes.js';
import { prepareRender } from './prepare.js';

const QUIET = ['-hide_banner', '-loglevel', 'error', '-y'];

/**
 * Draw an EDL (or a range of it) with the canvas path, in this process: one
 * segment, picture only.
 * @param {object} edl
 * @param {string} dir - Scratch directory
 * @param {object} [options] - Plan options (preset, range, lossless)
 * @param {import('./canvas/segment.js').SegmentHooks} [hooks]
 * @returns {Promise<{ output: string, frames: number, width: number, height: number }>}
 */
export async function draw(edl, dir, options = {}, hooks = {}) {
  const output = join(mkdtempSync(join(dir, 'draw-')), 'out.mp4');
  const { probes } = await prepareRender(edl);
  const result = await renderCanvasSegment(edl, { probes, outputPath: output, ...options }, hooks);
  return { output, ...result };
}

/**
 * Encode an EDL through every pass — segments on both renderers, workers,
 * the joining pass — with a job-like context that records progress and log.
 * @param {object} edl
 * @param {string} dir - Scratch directory
 * @param {object} [options] - Plan options and limits (preset, range, engine,
 *   workers…), and `onProgress(percent)` to watch it run
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ output: string, workDir: string, plan: any, progress: number[],
 *   log: string[] }>}
 */
export async function encode(edl, dir, options = {}, signal = new AbortController().signal) {
  const workDir = mkdtempSync(join(dir, 'encode-'));
  const { onProgress, ...plain } = options;
  const seen = { progress: [], log: [] };
  const ctx = {
    job: /** @type {any} */ ({}),
    signal,
    progress: (percent) => {
      seen.progress.push(percent);
      onProgress?.(percent);
    },
    log: (message) => void seen.log.push(message),
  };
  const { probes, capabilities } = await prepareRender(edl);
  const output = join(workDir, 'output.mp4');
  const all = { probes, capabilities, workDir, outputPath: output, ...plain };
  const plan = await encodeTimeline(edl, all, ctx);
  return { output, workDir, plan, ...seen };
}

/**
 * Run only the sound graph of an EDL and return the mix as it leaves the
 * graph — before any audio codec — so levels can be checked closely.
 * @param {object} edl
 * @param {string} dir - Scratch directory
 * @returns {Promise<{ left: Float32Array, right: Float32Array }>}
 */
export async function mixdown(edl, dir) {
  const workDir = mkdtempSync(join(dir, 'mix-'));
  const { probes, capabilities } = await prepareRender(edl);
  const ctx = createContext(edl, { probes, capabilities, workDir });
  const graph = buildAudioGraph(ctx.tracks, ctx).chains.join(';\n');
  for (const file of ctx.files) writeFileSync(file.path, file.content);
  const inputs = ctx.inputs.flatMap((input) => input.args);
  const output = ['-map', '[aout]', '-f', 'f32le', '-ac', '2', '-'];
  const args = [...QUIET, ...inputs, '-filter_complex', graph, ...output];
  const { stdout } = await run('ffmpeg', args, { binary: true });
  const all = new Float32Array(stdout.buffer, stdout.byteOffset, stdout.length / 4);
  return { left: all.filter((_, i) => i % 2 === 0), right: all.filter((_, i) => i % 2 === 1) };
}
