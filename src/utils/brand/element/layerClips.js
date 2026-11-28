/**
 * From a placed, timed layer to an ordinary clip: a title clip for text, a
 * shape generator for a shape (`shapeClip.js`), an image clip for a
 * picture, a generator clip for a generator. Times run from the element's
 * start; the source window starts with the clip, so keyframe times are
 * those same seconds. Isomorphic and pure.
 * @module utils/brand/element/layerClips
 */

import { createClip } from '#utils/edl/factory.js';
import { STILL, common } from './clipParts.js';
import { motionOf } from './motionKeys.js';
import { generatorClip, shapeClip } from './shapeClip.js';
import { textBlock } from './textClip.js';
import { wipeSlices } from './wipeSlices.js';

/**
 * @typedef {import('./clipParts.js').Placed} Placed
 * @typedef {import('./clipParts.js').Timing} Timing
 * @typedef {import('./clipParts.js').ClipEnv} ClipEnv
 */

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
 * @param {Record<string, any>} layer
 * @param {Placed} placed
 * @param {Timing} timing
 * @param {ClipEnv} env
 * @returns {any|null} The whole layer as one clip; null when it names nothing to draw
 */
function wholeClip(layer, placed, timing, env) {
  if (layer.type === 'text') return placed.fitted ? textClip(layer, placed, timing, env) : null;
  if (layer.type === 'shape') return shapeClip(layer, placed, timing, env);
  if (layer.type === 'image') return layer.src ? imageClip(layer, placed, timing, env) : null;
  return typeof layer.generator === 'string' ? generatorClip(layer, placed, timing, env) : null;
}

/**
 * The clips of one layer: one, or — for a layer that wipes on or off — one
 * for each stretch of its time (`wipeSlices`).
 * @param {Record<string, any>} layer
 * @param {Placed} placed
 * @param {Timing} timing
 * @param {ClipEnv} env
 * @returns {any[]} Empty for a layer that names nothing to draw
 */
export function layerClips(layer, placed, timing, env) {
  const clip = wholeClip(layer, placed, timing, env);
  if (!clip) return [];
  return wipeSlices(clip, timing).map((piece) => {
    // Fades never outlast their clip (EDL invariant 3), however short it is.
    const length = piece.timelineEnd - piece.timelineStart;
    const fadeIn = Math.min(piece.fadeIn, length);
    return { ...piece, fadeIn, fadeOut: Math.min(piece.fadeOut, length - fadeIn) };
  });
}
