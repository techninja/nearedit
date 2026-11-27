/**
 * Building blocks shared by fixed and animated layer geometry: the scale
 * step (which also converts colour to BT.709), crop and rotation. Pure.
 * @module api/render/layerParts
 */

import { filter, num } from './expr.js';
import { rotatedBox } from './placement.js';

/** @typedef {import('./placement.js').Rect} Rect */
/** @typedef {import('./placement.js').LayerGeometry} LayerGeometry */

/**
 * @typedef {Object} LayerSource
 * @property {number} width - Displayed size of the frames entering the chain
 * @property {number} height
 * @property {boolean} [anamorphic] - Frames arrive with non-square pixels
 * @property {string} [matrix] - Source YUV matrix, '' for RGB
 * @typedef {Object} GeometryContext
 * @property {{ width: number, height: number }} out - Rendered frame size
 * @property {{ chroma: string, scaleFlags: string }} preset
 * @property {{ local: string, frame: string, output: string }} progress - The clip's
 *   0..1 progress as an expression of the layer's own `t`, of the frame
 *   counter `on`, and of the output timeline's `t`
 * @typedef {Object} GeometryResult
 * @property {string[]} once - Filters whose result is the same on every frame
 * @property {string[]} each - Filters that depend on time
 * @property {number|string} x - Overlay position: pixels or a quoted expression
 * @property {number|string} y
 * @property {boolean} animated - The overlay position depends on time
 * @property {string[]} warnings
 */

const MAX_SIDE = 16384;

/**
 * A usable frame dimension.
 * @param {number} v
 * @returns {number}
 */
export const side = (v) => Math.max(1, Math.min(MAX_SIDE, Math.round(v)));

/**
 * Scale + pixel-format filters for a target size, converting colour on the way.
 * @param {LayerSource} source
 * @param {{ chroma: string, scaleFlags: string }} preset
 * @returns {(w: number, h: number) => string[]}
 */
export function scaler(source, preset) {
  const colour = { out_color_matrix: 'bt709', out_range: 'tv', flags: preset.scaleFlags };
  return (w, h) => [
    filter('scale', { w, h, in_color_matrix: source.matrix || undefined, ...colour }),
    `format=yuva${preset.chroma}p`,
  ];
}

/**
 * Crop to whole source pixels; nothing when the crop is the whole frame.
 * @param {Rect} crop
 * @param {LayerSource} source
 * @returns {string[]}
 */
export function cropFilter(crop, source) {
  const x = Math.min(source.width - 1, Math.max(0, Math.round(crop.x)));
  const y = Math.min(source.height - 1, Math.max(0, Math.round(crop.y)));
  const w = Math.max(1, Math.min(source.width - x, Math.round(crop.x + crop.w) - x));
  const h = Math.max(1, Math.min(source.height - y, Math.round(crop.y + crop.h) - y));
  if (w === source.width && h === source.height) return [];
  return [filter('crop', { w, h, x, y, exact: 1 })];
}

/**
 * Mirror and rotate a layer of a known size. The rotated picture sits in the
 * middle of an enlarged, transparent frame.
 * @param {LayerGeometry} g
 * @param {number} w
 * @param {number} h
 * @returns {string[]}
 */
export function turnFilters(g, w, h) {
  const flips = [...(g.flipX ? ['hflip'] : []), ...(g.flipY ? ['vflip'] : [])];
  if (!g.rotation) return flips;
  const box = rotatedBox({ x: 0, y: 0, w, h }, g.rotation, 0.5, 0.5);
  const angle = num((g.rotation * Math.PI) / 180, 8);
  return [...flips, filter('rotate', { a: angle, ow: side(box.w), oh: side(box.h), c: 'none' })];
}
