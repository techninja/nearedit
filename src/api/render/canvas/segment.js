/**
 * Render one segment with the shared compositor: for every output frame put
 * the footage frames in place, draw the document, and hand the pixels to
 * the encoder. Decoders, compositor and encoder run as a pipeline with one
 * frame in flight at each stage.
 * Reference: docs/app-spec/RENDER.md § The canvas path.
 * @module api/render/canvas/segment
 */

import { rmSync } from 'node:fs';
import { drawFrame } from '#utils/compose/drawFrame.js';
import { frameInfo } from '#utils/compose/frame.js';
import { createFootage } from './footage.js';
import { createCanvasHost } from './host.js';
import { openEncoder } from './pipes.js';
import { buildCanvasPlan } from './plan.js';

/**
 * @typedef {Object} SegmentHooks
 * @property {AbortSignal} [signal] - Stops the render, kills FFmpeg, removes the partial file
 * @property {(done: number, total: number) => void} [onFrame] - After each frame
 * @property {(message: string) => void} [warn]
 * @property {import('./host.js').CanvasHost} [host] - Reuse a host across segments
 */

/** @returns {Error} What a cancelled render throws, as `lib/ffmpeg.js` `run` does. */
const aborted = () => Object.assign(new Error('render aborted'), { killedBy: 'aborted' });

/**
 * Draw the frames of a plan into its encoder.
 * @param {import('./plan.js').CanvasPlan} plan
 * @param {import('./host.js').CanvasHost} host
 * @param {{ footage: ReturnType<typeof createFootage>, encoder: ReturnType<typeof openEncoder> }} io
 * @param {SegmentHooks} hooks
 */
async function drawSegment(plan, host, { footage, encoder }, { signal, onFrame }) {
  const canvas = host.canvas(plan.width, plan.height);
  const ctx = canvas.getContext('2d');
  const frame = frameInfo(plan.doc, plan.width, plan.height);
  for (let i = 0; i < plan.frames; i++) {
    if (signal?.aborted) throw aborted();
    const at = plan.startFrame + i;
    await footage.advance(at);
    drawFrame(ctx, plan.doc, at / plan.fps, host.env, frame);
    await encoder.write(canvas.data());
    onFrame?.(i + 1, plan.frames);
  }
  await encoder.finish();
}

/**
 * Render a segment of a document to a video file without sound.
 * @param {any} edl - A checked document: every path in it may be read
 * @param {import('../context.js').PlanOptions} options - `range` is the
 *   segment, `outputPath` the file; `probes` describe the footage
 * @param {SegmentHooks} [hooks]
 * @returns {Promise<{ frames: number, width: number, height: number }>}
 * @throws {Error} Naming the file that could not be read or decoded; with
 *   `killedBy: 'aborted'` when the signal fired. The partial file is removed
 */
export async function renderCanvasSegment(edl, options, hooks = {}) {
  const { signal } = hooks;
  const host = hooks.host || createCanvasHost();
  const plan = buildCanvasPlan(edl, options);
  if (signal?.aborted) throw aborted();
  await host.load(plan.images, plan.stills);
  const footage = createFootage(plan.footage, host, hooks.warn);
  const encoder = openEncoder(plan.encoderArgs);
  const stop = () => {
    footage.close();
    encoder.kill();
  };
  signal?.addEventListener('abort', stop, { once: true });
  try {
    await drawSegment(plan, host, { footage, encoder }, hooks);
    return { frames: plan.frames, width: plan.width, height: plan.height };
  } catch (err) {
    footage.close();
    await encoder.kill();
    try {
      rmSync(plan.output, { force: true });
    } catch (cleanup) {
      // What went wrong matters more than what could not be tidied up.
      hooks.warn?.(`could not remove ${plan.output}: ${cleanup.message}`);
    }
    throw signal?.aborted ? aborted() : err;
  } finally {
    signal?.removeEventListener('abort', stop);
    footage.close();
  }
}
