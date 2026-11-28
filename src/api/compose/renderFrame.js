/**
 * Draw one frame of a document on the server canvas — for tests, for
 * `nearedit frame`, and as the smallest example of driving the compositor
 * headlessly. Node only.
 * @module api/compose/renderFrame
 */

import { createCanvas } from '@napi-rs/canvas';
import { drawFrame } from '#utils/compose/drawFrame.js';
import { frameInfo } from '#utils/compose/frame.js';
import { parseResolution } from '#utils/edl/factory.js';
import { createEnv } from './env.js';

/**
 * Render a frame.
 * @param {any} edl - The document
 * @param {number} time - Timeline seconds
 * @param {Object} [options]
 * @param {number} [options.width] - Canvas width; the output width by default
 * @param {number} [options.height] - Canvas height; by default what keeps
 *   the output aspect ratio
 * @param {import('./env.js').ImageSource} [options.images] - Loaded stills (`loadImages`)
 * @param {(clip: any, sourceTime: number) => any} [options.frameOf] - Footage frames
 * @param {(clip: any) => any} [options.words] - Transcripts of captioned clips' files
 * @param {import('#utils/compose/host.js').HostEnv} [options.env] - Reuse an
 *   environment (and its pooled canvases) across many frames of one size;
 *   `images`, `frameOf` and `words` are then ignored
 * @returns {any} A canvas: `getContext('2d').getImageData()` for pixels,
 *   `toBuffer('image/png')` for a file, `data()` for the raw RGBA buffer
 */
export function renderFrame(edl, time, options = {}) {
  const out = parseResolution(edl.resolution);
  const width = Math.max(1, Math.round(options.width || out.width));
  const height = Math.max(1, Math.round(options.height || (width * out.height) / out.width));
  const env = options.env || createEnv(options);
  const canvas = createCanvas(width, height);
  drawFrame(canvas.getContext('2d'), edl, time, env, frameInfo(edl, width, height));
  return canvas;
}
