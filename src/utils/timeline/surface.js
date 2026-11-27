/**
 * The canvas as a drawing surface: a backing store that matches the
 * element's size and the device pixel ratio, and the bookkeeping of what
 * each frame cost to draw.
 * @module utils/timeline/surface
 */

/**
 * Draw cost in milliseconds.
 * @typedef {Object} FrameStats
 * @property {number} frames - Frames drawn
 * @property {number} last - Cost of the latest frame
 * @property {number} max - Costliest frame
 * @property {number} total - Sum over all frames
 */

/** @returns {FrameStats} */
export const noFrames = () => ({ frames: 0, last: 0, max: 0, total: 0 });

/**
 * @param {FrameStats} stats
 * @param {number} cost - Milliseconds the frame took
 * @returns {FrameStats}
 */
export function countFrame(stats, cost) {
  return {
    frames: stats.frames + 1,
    last: cost,
    max: Math.max(stats.max, cost),
    total: stats.total + cost,
  };
}

/**
 * Match the canvas backing store to its CSS size and the device pixel
 * ratio, and hand back a context scaled so that drawing code works in CSS
 * pixels. Resizing clears the canvas, so call this right before drawing.
 * @param {HTMLCanvasElement} canvas - Sized by CSS
 * @returns {CanvasRenderingContext2D|null} null while the canvas has no size
 */
export function fitCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.clientWidth > 0 ? canvas.getContext('2d') : null;
  ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}
