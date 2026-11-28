/**
 * The size a layer has of its own, before it is placed: a text fitted to
 * the width it may take, a picture by its height and its proportions, a
 * shape by what it says. Isomorphic and pure.
 * @module utils/brand/element/layoutSize
 */

import { lengthOf, num } from './measure.js';
import { fitText } from './textFit.js';

/**
 * @typedef {import('./box.js').Box} Box
 * @typedef {import('./layout.js').LayoutEnv} LayoutEnv
 */

/**
 * The size a layer has of its own.
 * @param {Record<string, any>} layer
 * @param {Box} room - The box it is placed in (its width limits text)
 * @param {LayoutEnv} env
 * @param {number} [shrink] - Below 1: everything this much smaller, for a
 *   stack that is too tall for its place
 * @returns {{ w: number, h: number, fitted?: any, natural?: any }|null} null
 *   for a layer with nothing to show
 */
export function ownSize(layer, room, env, shrink = 1) {
  if (shrink < 1) {
    const smaller = { ...env, unit: env.unit * shrink };
    return ownSize(layer, room, /** @type {LayoutEnv} */ (smaller));
  }
  const { unit } = env;
  if (layer.type === 'text') {
    const plate = layer.plate?.color ? num(layer.plate.pad, 0.3, 0, 5) : 0;
    const top = num(layer.size, 5, 0.5, 80) * unit * plate;
    const width = Math.min(room.w, lengthOf(layer.maxWidth, room.w, unit, room.w)) - 2 * top;
    const fitted = fitText(layer, width, env);
    if (!fitted) return null;
    const pad = fitted.fontSize * plate;
    return { w: fitted.width + 2 * pad, h: fitted.height + 2 * pad, fitted };
  }
  if (layer.type === 'image') {
    if (!layer.src) return null;
    const natural = env.sizeOf(layer.src);
    const aspect = natural?.height > 0 ? natural.width / natural.height : 1;
    let h = lengthOf(layer.h, room.h, unit, 10 * unit);
    let w = h * aspect;
    const cap = Math.min(room.w, lengthOf(layer.w, room.w, unit, Infinity));
    if (w > cap) [w, h] = [cap, cap / aspect];
    return w > 0 && h > 0 ? { w, h, natural } : null;
  }
  const w = lengthOf(layer.w, room.w, unit, 10 * unit);
  const h = lengthOf(layer.h, room.h, unit, 10 * unit);
  return w > 0 && h > 0 ? { w, h } : null;
}
