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
import { ownSize } from './layoutSize.js';

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
    if (!groups.has(id))
      groups.set(
        id,
        guarded(`group ${id}`, () => stack(id)),
      );
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
    // A stack too tall for its place is set smaller, text and gaps alike, until it fits.
    let [shrink, sized, before, height] = [1, [], [], 0];
    for (let attempt = 0; attempt < 5; attempt++) {
      const gap = num(group.gap, 1, 0, 50) * unit * shrink;
      sized = members
        .map((layer) => ({ layer, size: ownSize(layer, room, env, shrink) }))
        .filter((entry) => entry.size);
      before = sized.map(({ layer }, i) =>
        i ? num(layer.gap, gap / (unit * shrink), 0, 50) * unit * shrink : 0,
      );
      height = sized.reduce((sum, { size }, i) => sum + before[i] + size.h, 0);
      if (height + 2 * py <= container.h || shrink < 0.45) break;
      shrink *= Math.max(0.6, ((container.h - 2 * py) / height) * 0.97);
    }
    if (!sized.length) return null;
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
      const size =
        layer.type === 'shape' ? besideSize(layer, next, unit) : ownSize(layer, frame, env);
      return size ? { ...size, box: beside(size, next, layer, unit) } : null;
    }
    const container = boxOf(layer.inside);
    const size = container && ownSize(layer, container, env);
    return size ? { ...size, box: anchored(size, container, layer, unit, kept(container)) } : null;
  }

  for (const layer of view.layers) place(layer);
  return placed;
}
