/**
 * Layout — where every layer of a design sits in a frame. A layer is
 * placed in one of four ways: as a member of a group (a stack that closes
 * up around the members that are there), by an anchor inside a box, around
 * a box, or beside one. What it refers to is laid out first, whatever the
 * order of the layers; a layer whose reference is absent is absent too,
 * and one that refers to itself is left out with a warning.
 * Isomorphic and pure.
 * @module utils/brand/element/layout
 */

import { anchored, beside, besideSize, frameBoxes, grown } from './box.js';
import { lengthOf, num, padOf } from './measure.js';
import { fitText } from './textFit.js';

/**
 * @typedef {import('./box.js').Box} Box
 * @typedef {Object} Placed - Where a layer is, and what was worked out to know
 * @property {Box} box
 * @property {import('./textFit.js').Fitted} [fitted] - Text layers
 * @property {{ width: number, height: number }|null} [natural] - Image layers
 * @typedef {Object} LayoutEnv
 * @property {{ width: number, height: number }} frame - Output pixels
 * @property {number} unit - Pixels per unit
 * @property {import('./measure.js').MeasureRun} measure
 * @property {(path: string) => { width: number, height: number }|null} sizeOf
 * @property {(message: string) => void} warn
 */

/**
 * The size a layer has of its own.
 * @param {Record<string, any>} layer
 * @param {Box} room - The box it is placed in (its width limits text)
 * @param {LayoutEnv} env
 * @returns {{ w: number, h: number, fitted?: any, natural?: any }|null} null
 *   for a layer with nothing to show
 */
function ownSize(layer, room, env) {
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

/**
 * Lay a view out.
 * @param {import('./view.js').View} view
 * @param {LayoutEnv} env
 * @returns {Map<string, Placed|null>} By layer id; null for a layer that is
 *   not shown
 */
export function layoutView(view, env) {
  const { unit } = env;
  const { frame, safe } = frameBoxes(env.frame, view.margin * unit);
  /** @type {Map<string, Placed|null>} */
  const placed = new Map();
  /** @type {Map<string, Box|null>} */
  const groups = new Map();
  const visiting = new Set();
  const byId = new Map(view.layers.map((layer) => [layer.id, layer]));
  const isGroup = (/** @type {any} */ ref) => Object.hasOwn(view.groups, ref);
  const kept = (/** @type {Box} */ container) => (container === safe ? safe : null);

  /** @type {<T>(key: string, make: () => T) => T|null} */
  const guarded = (key, make) => {
    if (visiting.has(key)) return (env.warn(`"${key}" is placed by way of itself`), null);
    visiting.add(key);
    const made = make();
    visiting.delete(key);
    return made;
  };

  /** @type {(ref: any) => Box|null} */
  const boxOf = (ref) => {
    if (ref === undefined || ref === 'safe') return safe;
    if (ref === 'frame') return frame;
    if (isGroup(ref)) return groupBox(ref);
    return byId.has(ref) ? place(byId.get(ref))?.box || null : null;
  };

  /** @type {(id: string) => Box|null} */
  function groupBox(id) {
    if (!groups.has(id)) groups.set(id, guarded(`group ${id}`, () => stack(id)));
    return groups.get(id);
  }

  /** @type {(id: string) => Box|null} Stack the members of a group that are there. */
  function stack(id) {
    const group = view.groups[id];
    const members = view.layers.filter((layer) => layer.in === id);
    for (const layer of members) placed.set(layer.id, null);
    const container = boxOf(group.inside);
    if (!container) return null;
    const [px, py] = padOf(group.pad, unit);
    const width = Math.min(container.w, lengthOf(group.maxWidth, container.w, unit, container.w));
    const room = { ...container, w: width - 2 * px };
    const gap = num(group.gap, 1, 0, 50) * unit;
    const sized = members
      .map((layer) => ({ layer, size: ownSize(layer, room, env) }))
      .filter((entry) => entry.size);
    if (!sized.length) return null;
    const before = sized.map(({ layer }, i) => (i ? num(layer.gap, gap / unit, 0, 50) * unit : 0));
    const height = sized.reduce((sum, { size }, i) => sum + before[i] + size.h, 0);
    const widest = Math.max(...sized.map(({ size }) => size.w));
    const outer = { w: widest + 2 * px, h: height + 2 * py };
    const box = anchored(outer, container, group, unit, kept(container));
    const along = group.align === 'left' ? 0 : group.align === 'right' ? 1 : 0.5;
    let y = box.y + py;
    sized.forEach(({ layer, size }, i) => {
      y += before[i];
      const x = box.x + px + (widest - size.w) * along;
      placed.set(layer.id, { ...size, box: { x, y, w: size.w, h: size.h } });
      y += size.h;
    });
    return box;
  }

  /** @type {(layer: Record<string, any>) => Placed|null} */
  function place(layer) {
    if (!placed.has(layer.id)) {
      const made = guarded(layer.id, () => compute(layer));
      if (!(isGroup(layer.in) && placed.has(layer.id))) placed.set(layer.id, made);
    }
    return placed.get(layer.id);
  }

  /** @type {(layer: Record<string, any>) => Placed|null} */
  function compute(layer) {
    if (layer.type === 'generator') return { box: frame };
    if (isGroup(layer.in)) return (groupBox(layer.in), placed.get(layer.id) || null);
    const around = layer.around === undefined ? null : boxOf(layer.around);
    if (around) return { box: grown(around, ...padOf(layer.pad, unit)) };
    const next = layer.beside === undefined ? null : boxOf(layer.beside);
    if (layer.around !== undefined || (layer.beside !== undefined && !next)) return null;
    if (next) {
      const size = layer.type === 'shape' ? besideSize(layer, next, unit) : ownSize(layer, frame, env);
      return size ? { ...size, box: beside(size, next, layer, unit) } : null;
    }
    const container = boxOf(layer.inside);
    const size = container && ownSize(layer, container, env);
    return size ? { ...size, box: anchored(size, container, layer, unit, kept(container)) } : null;
  }

  for (const layer of view.layers) place(layer);
  return placed;
}
