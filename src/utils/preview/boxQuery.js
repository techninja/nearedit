/**
 * Questions about a box in the preview: the rectangle around it, whether a
 * point is on it, and where a pointer is in the output frame. Output
 * pixels. Pure and isomorphic.
 * @module utils/preview/boxQuery
 */

import { boxCorners, rotatePoint } from './geometry.js';

/** @typedef {import('./geometry.js').Point} Point */
/** @typedef {import('./geometry.js').Size} Size */
/** @typedef {import('./geometry.js').Box} Box */

/**
 * The axis-aligned rectangle around a box as it appears.
 * @param {Box} box
 * @returns {{ left: number, right: number, top: number, bottom: number }}
 */
export function boxBounds(box) {
  const corners = boxCorners(box);
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

/**
 * @param {Box} box
 * @param {Point} point - Output pixels
 * @param {number} [slack=0] - Extra reach around the box, output pixels
 * @returns {boolean} True when the point is on the box as it appears
 */
export function boxContains(box, point, slack = 0) {
  const local = rotatePoint(point, box.pivot, -box.rotation);
  const [left, right] = [box.x, box.x + box.width].sort((a, b) => a - b);
  const [top, bottom] = [box.y, box.y + box.height].sort((a, b) => a - b);
  return (
    local.x >= left - slack &&
    local.x <= right + slack &&
    local.y >= top - slack &&
    local.y <= bottom + slack
  );
}

/**
 * A pointer position as a point of the output frame.
 * @param {{ clientX: number, clientY: number }} event
 * @param {{ left: number, top: number, width: number, height: number }} rect -
 *   The preview frame on screen (`getBoundingClientRect`)
 * @param {Size} out - Output resolution
 * @returns {Point}
 */
export function framePoint(event, rect, out) {
  return {
    x: ((event.clientX - rect.left) / (rect.width || 1)) * out.width,
    y: ((event.clientY - rect.top) / (rect.height || 1)) * out.height,
  };
}
