/**
 * One frame of a document, footage included — the frame the render shows at
 * that moment, drawn by the same code: the same plan, the same decoders, the
 * same compositor call.
 * @module api/render/canvas/still
 */

import { drawFrame } from '#utils/compose/drawFrame.js';
import { frameInfo } from '#utils/compose/frame.js';
import { parseResolution } from '#utils/edl/factory.js';
import { createCanvas } from '../../compose/index.js';
import { RenderError } from '../errors.js';
import { createTiming } from '../timing.js';
import { createFootage } from './footage.js';
import { createCanvasHost } from './host.js';
import { buildCanvasPlan } from './plan.js';

/**
 * Draw the frame that is on screen at a moment.
 * @param {any} edl - A checked document: every path in it may be read
 * @param {number} time - Timeline seconds; the frame containing it is drawn
 * @param {Object} [options]
 * @param {Record<string, any>} [options.probes] - Probe per footage file (`prepareRender`)
 * @param {number} [options.width] - Width of the picture; the document's by default
 * @param {string} [options.preset] - Whose scaling the footage gets (default "standard")
 * @param {import('./host.js').CanvasHost} [options.host] - Reuse a host for many frames
 * @param {(message: string) => void} [options.warn]
 * @returns {Promise<{ canvas: any, frame: number, time: number }>} The canvas
 *   (`toBuffer('image/png')`, `data()`), the frame number and its time
 * @throws {RenderError} 422 when the time is outside the timeline
 */
export async function renderStill(edl, time, options = {}) {
  const timing = createTiming(edl);
  const moment = Number(time);
  if (!(moment >= 0) || moment > timing.duration + 1e-6)
    throw new RenderError(
      422,
      `Time ${time} is outside the timeline (0 to ${Number(timing.duration.toFixed(3))} s)`,
    );
  const frame = Math.min(timing.totalFrames - 1, Math.floor(moment * timing.fps + 1e-6));
  const full = parseResolution(edl.resolution);
  const width = Math.max(2, Math.round(options.width || full.width));
  const size = { width, height: Math.max(2, Math.round((width * full.height) / full.width)) };
  const range = { start: frame / timing.fps, end: (frame + 1) / timing.fps };
  const plan = buildCanvasPlan(edl, {
    probes: options.probes,
    preset: options.preset,
    range,
    size,
  });

  const host = options.host || createCanvasHost();
  await host.load(plan.images, plan.stills);
  const footage = createFootage(plan.footage, host, options.warn);
  try {
    await footage.advance(plan.startFrame);
    const canvas = createCanvas(plan.width, plan.height);
    const info = frameInfo(plan.doc, plan.width, plan.height);
    drawFrame(canvas.getContext('2d'), plan.doc, plan.startFrame / plan.fps, host.env, info);
    return { canvas, frame, time: plan.startFrame / plan.fps };
  } finally {
    footage.close();
  }
}
