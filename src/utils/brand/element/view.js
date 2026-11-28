/**
 * A design as it applies to one frame and one set of slots: the format's
 * adjustments merged in, every slot reference filled, and the layers whose
 * `when` / `unless` leaves them out removed. Layout and timing work on this
 * view. Isomorphic and pure.
 * @module utils/brand/element/view
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { LIMITS } from '#utils/brand/limits.js';
import { fill, isPresent, slotOf } from './refs.js';

/** @typedef {import('#utils/brand/types.js').Design} Design */

/**
 * @typedef {Object} View
 * @property {number} margin - Safe margin, units
 * @property {Record<string, Record<string, any>>} groups
 * @property {(Record<string, any> & { id: string })[]} layers - Back to front,
 *   each with an id
 * @property {{ by: string, ease: string, speed: number }} motion
 */

/** @type {WeakMap<object, Map<string, { margin: any, groups: any, layers: any[] }>>} */
const formatted = new WeakMap();

/**
 * Give every layer an id of its own: its own when it has one that is free,
 * otherwise its place in the list.
 * @param {Record<string, any>[]} layers
 * @returns {(Record<string, any> & { id: string })[]}
 */
function identified(layers) {
  const taken = new Set();
  return layers.map((layer, i) => {
    const id = layer.id && !taken.has(layer.id) ? layer.id : `layer-${i}`;
    taken.add(id);
    return { ...layer, id };
  });
}

/**
 * A design with the adjustments of one format merged in.
 * @param {Design} design
 * @param {string} format
 * @returns {{ margin: any, groups: Record<string, any>, layers: any[] }}
 */
function inFormat(design, format) {
  let known = formatted.get(design);
  if (!known) formatted.set(design, (known = new Map()));
  if (!known.has(format)) {
    const patch = (isPlainObject(design.formats) && design.formats[format]) || {};
    const groups = { ...design.groups };
    for (const [id, change] of Object.entries(patch.groups || {})) {
      if (groups[id]) groups[id] = { ...groups[id], ...change };
    }
    const list = Array.isArray(design.layers) ? design.layers.slice(0, LIMITS.layers) : [];
    const layers = identified(list.filter(isPlainObject)).map((layer) =>
      patch.layers?.[layer.id] ? { ...layer, ...patch.layers[layer.id] } : layer,
    );
    known.set(format, { margin: patch.margin ?? design.margin, groups, layers });
  }
  return known.get(format);
}

/**
 * The text of one slot as it is written into a design.
 * @param {Record<string, any>|undefined} slots
 * @param {string} name
 * @returns {string} '' for a slot that is not filled
 */
function slotText(slots, name) {
  const value = slots && Object.hasOwn(slots, name) ? slots[name] : '';
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  return typeof text === 'string' ? text.slice(0, LIMITS.slotText) : '';
}

/**
 * The view of a design for a format and a set of slots.
 * @param {Design} design
 * @param {Record<string, any>|undefined} slots
 * @param {string} format - `wide`, `tall` or `square`
 * @returns {View}
 */
export function viewOf(design, slots, format) {
  const base = inFormat(design, format);
  const lookup = (/** @type {string} */ path) => {
    const slot = slotOf(path);
    return slot === null ? undefined : slotText(slots, slot);
  };
  const layers = base.layers
    .map((layer) => fill(layer, lookup))
    .filter((layer) => {
      if (Object.hasOwn(layer, 'when') && !isPresent(layer.when)) return false;
      return !(Object.hasOwn(layer, 'unless') && isPresent(layer.unless));
    });
  const motion = isPlainObject(design.motion) ? design.motion : {};
  const speed = Number(motion.speed);
  return {
    margin: Number.isFinite(Number(base.margin)) ? Math.max(0, Number(base.margin)) : 6,
    groups: base.groups,
    layers,
    motion: {
      by: typeof motion.by === 'string' ? motion.by : 'block',
      ease: typeof motion.ease === 'string' ? motion.ease : 'ease-out',
      speed: speed > 0 ? Math.min(8, Math.max(0.1, speed)) : 1,
    },
  };
}
