/**
 * Shape and generator layers as generator clips. A shape is drawn by the
 * shape generator where its box is, in whole pixels; it scales by its own
 * size, so it stays sharp and may outgrow the frame. A generator layer
 * fills the frame. Isomorphic and pure.
 * @module utils/brand/element/shapeClip
 */

import { isHex } from '#utils/compose/color.js';
import { createClip } from '#utils/edl/factory.js';
import { STILL, common } from './clipParts.js';
import { num } from './measure.js';
import { motionOf } from './motionKeys.js';
import { SHAPES } from './vocabulary.js';

/**
 * @typedef {import('./clipParts.js').Placed} Placed
 * @typedef {import('./clipParts.js').Timing} Timing
 * @typedef {import('./clipParts.js').ClipEnv} ClipEnv
 */

/**
 * @param {Record<string, any>} layer
 * @param {Placed} placed
 * @param {Timing} timing
 * @param {ClipEnv} env
 * @returns {any} A shape generator clip, the shape drawn where its box is
 */
export function shapeClip(layer, placed, timing, env) {
  const { head, opacity, rotation } = common(layer, timing);
  const { width: W, height: H } = env.frame;
  // Whole pixels: the edges of plates and bars stay crisp.
  const [left, top] = [Math.round(placed.box.x), Math.round(placed.box.y)];
  const w = Math.max(1, Math.round(placed.box.x + placed.box.w) - left);
  const h = Math.max(1, Math.round(placed.box.y + placed.box.h) - top);
  const [cx, cy] = [left + w / 2, top + h / 2];
  const shape = SHAPES.includes(layer.shape) ? layer.shape : 'rectangle';
  const filled = isHex(layer.fill);
  const strokeWidth = isHex(layer.stroke) ? num(layer.strokeWidth, 0.4, 0, 30) * env.unit : 0;
  const params = {
    ...{ shape, position: { x: cx / W, y: cy / H }, sizing: 'pixels', widthPx: w, heightPx: h },
    ...{ rotation, filled, fill: filled ? layer.fill : '#ffffff', strokeWidth },
    ...(strokeWidth > 0 && { stroke: layer.stroke }),
    radius: num(layer.radius, 0, 0, 300) * env.unit,
    ...(shape === 'polygon' && { sides: Math.round(num(layer.sides, 6, 3, 24)) }),
    ...(shape === 'star' && { points: Math.round(num(layer.points, 5, 3, 24)) }),
    ...(shape === 'star' && { inner: num(layer.inner, 0.5, 0.05, 1) }),
    ...(shape === 'line' && { thickness: h, cap: 'butt' }),
  };
  // A shape scales by its own size, so it stays sharp and may outgrow the frame.
  const at = (/** @type {string} */ name) => `generator.params.${name}`;
  const grow = {
    ...(shape === 'line' ? { [at('widthPx')]: w, [at('thickness')]: h } : {}),
    ...(shape !== 'line' && { [at('widthPx')]: w, [at('heightPx')]: h }),
    ...(params.radius > 0 && { [at('radius')]: Math.min(params.radius, w / 2, h / 2) }),
    ...(strokeWidth > 0 && { [at('strokeWidth')]: strokeWidth }),
  };
  const rest = { ...STILL, grow };
  return createClip({
    ...head,
    generator: { type: 'shape', seed: 0, params },
    transform: { opacity },
    ...motionOf(timing, rest, placed.box, env),
  });
}

/**
 * A generator layer's parameters: its `params` as the catalog takes them,
 * with every entry of `lengths` — written in units — as output pixels.
 * @param {Record<string, any>} layer
 * @param {number} unit
 * @returns {Record<string, any>}
 */
function generatorParams(layer, unit) {
  const params = { ...layer.params };
  for (const [name, value] of Object.entries(layer.lengths || {})) {
    if (Number.isFinite(value)) params[name] = value * unit;
  }
  return params;
}

/**
 * @param {Record<string, any>} layer
 * @param {Placed} placed
 * @param {Timing} timing
 * @param {ClipEnv} env
 * @returns {any} A generator clip filling the frame; `animate` moves its
 *   parameters from one value to another over the whole of its time
 */
export function generatorClip(layer, placed, timing, env) {
  const { head, opacity } = common(layer, timing);
  const seed = Math.round(num(layer.seed, 0, 0, 4294967295));
  const motion = motionOf(timing, STILL, placed.box, env);
  for (const [path, span] of Object.entries(layer.animate || {})) {
    const [from, to] = Array.isArray(span) ? span : [];
    const usable = [from, to].every((v) => Number.isFinite(v)) || [from, to].every(isHex);
    if (!usable || from === to) continue;
    motion.keyframes[`generator.params.${path}`] = [
      { t: timing.start, v: from, ease: 'sine' },
      { t: timing.end, v: to, ease: 'linear' },
    ];
  }
  return createClip({
    ...head,
    generator: { type: layer.generator, seed, params: generatorParams(layer, env.unit) },
    transform: { opacity },
    ...motion,
  });
}
