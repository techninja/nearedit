/**
 * From a placed, timed layer to an ordinary clip: a title clip for text, a
 * shape generator for a shape, an image clip for a picture, a generator
 * clip for a generator. Times run from the element's start; the source
 * window starts with the clip, so keyframe times are those same seconds.
 * Isomorphic and pure.
 * @module utils/brand/element/layerClips
 */

import { isHex } from '#utils/compose/color.js';
import { BLEND_MODES } from '#utils/edl/defaults.js';
import { createClip } from '#utils/edl/factory.js';
import { num } from './measure.js';
import { motionOf } from './motionKeys.js';
import { textBlock } from './textClip.js';
import { SHAPES } from './vocabulary.js';

/**
 * @typedef {import('./layout.js').Placed} Placed
 * @typedef {import('./timing.js').Timing} Timing
 * @typedef {{ frame: { width: number, height: number }, unit: number,
 *   groups: Record<string, any> }} ClipEnv
 */

const STILL = { x: 0, y: 0, scale: 1, px: 0, py: 0 };

/**
 * What every layer's clip has: its id, its time, its blend mode, its opacity.
 * @param {Record<string, any>} layer
 * @param {Timing} timing
 * @returns {{ head: Record<string, any>, opacity: number, rotation: number }}
 */
function common(layer, timing) {
  const head = {
    clipId: `el-${layer.id}`,
    label: layer.id,
    timelineStart: timing.start,
    timelineEnd: timing.end,
    sourceIn: timing.start,
    sourceOut: timing.end,
    blendMode: BLEND_MODES.includes(layer.blend) ? layer.blend : 'normal',
  };
  return { head, opacity: num(layer.opacity, 1, 0, 1), rotation: num(layer.rotate, 0, -3600, 3600) };
}

/** @type {(move: any) => any} Text moves by its own animations; only a wipe is a clip effect. */
const wipeOnly = (move) => (move?.motion === 'wipe' ? move : null);

/**
 * @param {Record<string, any>} layer
 * @param {Placed} placed
 * @param {Timing} timing
 * @param {ClipEnv} env
 * @returns {any} A title clip
 */
function textClip(layer, placed, timing, env) {
  const { head, opacity, rotation } = common(layer, timing);
  const { box } = placed;
  const x = box.x + box.w / 2 - env.frame.width / 2;
  const y = box.y + box.h / 2 - env.frame.height / 2;
  const wipes = { ...timing, enter: wipeOnly(timing.enter), exit: wipeOnly(timing.exit) };
  return createClip({
    ...head,
    intent: 'title',
    text: textBlock(layer, placed.fitted, timing, { unit: env.unit, group: env.groups[layer.in] }),
    transform: { x, y, rotation, opacity },
    ...motionOf(wipes, { ...STILL, x, y }, box, env),
  });
}

/**
 * @param {Record<string, any>} layer
 * @param {Placed} placed
 * @param {Timing} timing
 * @param {ClipEnv} env
 * @returns {any} A shape generator clip, the shape drawn where its box is
 */
function shapeClip(layer, placed, timing, env) {
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
  const rest = { ...STILL, px: cx - W / 2, py: cy - H / 2 };
  return createClip({
    ...head,
    generator: { type: 'shape', seed: 0, params },
    transform: { opacity },
    ...motionOf(timing, rest, placed.box, env),
  });
}

/**
 * @param {Record<string, any>} layer
 * @param {Placed} placed
 * @param {Timing} timing
 * @param {ClipEnv} env
 * @returns {any} An image clip, contained in its box
 */
function imageClip(layer, placed, timing, env) {
  const { head, opacity, rotation } = common(layer, timing);
  const { width: W, height: H } = env.frame;
  const { box } = placed;
  // A picture whose size is not known yet is taken to be square.
  const natural = placed.natural || { width: box.w, height: box.h };
  const fitted = Math.min(W / natural.width, H / natural.height);
  const scale = box.w / natural.width / fitted;
  const x = box.x + box.w / 2 - W / 2;
  const y = box.y + box.h / 2 - H / 2;
  return createClip({
    ...head,
    sourceFile: layer.src,
    transform: { fit: 'contain', x, y, scaleX: scale, scaleY: scale, rotation, opacity },
    ...motionOf(timing, { ...STILL, x, y, scale }, box, env),
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
function generatorClip(layer, placed, timing, env) {
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

/**
 * The clip of one layer.
 * @param {Record<string, any>} layer
 * @param {Placed} placed
 * @param {Timing} timing
 * @param {ClipEnv} env
 * @returns {any|null} null for a layer that names nothing to draw
 */
export function layerClip(layer, placed, timing, env) {
  if (layer.type === 'text') return placed.fitted ? textClip(layer, placed, timing, env) : null;
  if (layer.type === 'shape') return shapeClip(layer, placed, timing, env);
  if (layer.type === 'image') return layer.src ? imageClip(layer, placed, timing, env) : null;
  return typeof layer.generator === 'string' ? generatorClip(layer, placed, timing, env) : null;
}
