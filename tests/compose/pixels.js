/**
 * Draw documents on the server canvas and look at the pixels — the helper
 * behind the compositor's pixel tests.
 * @module tests/compose/pixels
 */

import { createEnv, renderFrame } from '../../src/api/compose/index.js';

/** Default canvas of the pixel tests: a quarter of the 1920×1080 documents. */
export const SIZE = { width: 480, height: 270 };

/**
 * @typedef {Object} Picture
 * @property {number} width
 * @property {number} height
 * @property {Uint8ClampedArray} data - RGBA
 * @property {(x: number, y: number) => number[]} at - `[r, g, b]` of a pixel;
 *   coordinates below 1 are fractions of the frame
 * @property {(test: (r: number, g: number, b: number) => boolean) => number} count -
 *   Pixels that pass a test
 * @property {(test: (r: number, g: number, b: number) => boolean) =>
 *   { left: number, top: number, right: number, bottom: number } | null} bounds -
 *   Box around the pixels that pass a test
 */

/**
 * Wrap a canvas.
 * @param {any} canvas
 * @returns {Picture}
 */
export function picture(canvas) {
  const { width, height } = canvas;
  const { data } = canvas.getContext('2d').getImageData(0, 0, width, height);
  const each = (/** @type {(x: number, y: number, i: number) => void} */ visit) => {
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) visit(x, y, (y * width + x) * 4);
  };
  return {
    width,
    height,
    data,
    at(x, y) {
      const px = Math.min(width - 1, Math.round(x < 1 ? x * width : x));
      const py = Math.min(height - 1, Math.round(y < 1 ? y * height : y));
      const i = (py * width + px) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    },
    count(test) {
      let n = 0;
      each((_x, _y, i) => (n += test(data[i], data[i + 1], data[i + 2]) ? 1 : 0));
      return n;
    },
    bounds(test) {
      const box = { left: width, top: height, right: -1, bottom: -1 };
      each((x, y, i) => {
        if (!test(data[i], data[i + 1], data[i + 2])) return;
        box.left = Math.min(box.left, x);
        box.top = Math.min(box.top, y);
        box.right = Math.max(box.right, x);
        box.bottom = Math.max(box.bottom, y);
      });
      return box.right < 0 ? null : box;
    },
  };
}

/** One environment for a test file: its pooled canvases are reused. */
let shared = null;

/**
 * Draw a document.
 * @param {any} edl
 * @param {number} [time=1]
 * @param {object} [options] - `renderFrame` options; `width` / `height`
 *   default to SIZE
 * @returns {Picture}
 */
export function draw(edl, time = 1, options = {}) {
  const custom = options.images || options.frameOf || options.env;
  const env = custom ? undefined : (shared ||= createEnv());
  return picture(renderFrame(edl, time, { ...SIZE, env, ...options }));
}

/**
 * @param {number[]} actual - `[r, g, b]`
 * @param {number[]} expected
 * @param {number} [tolerance=2]
 * @returns {boolean} True when every channel is within the tolerance
 */
export function near(actual, expected, tolerance = 2) {
  return actual.every((v, i) => Math.abs(v - expected[i]) <= tolerance);
}

/**
 * @param {string} hex - `#rrggbb`
 * @returns {number[]} `[r, g, b]`
 */
export const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
