/**
 * From an element to a design: every token reference replaced by the kit's
 * value, layers that hang on a token the kit leaves empty taken out, the
 * font files its text needs listed. What is left refers to nothing but its
 * own slots, so a clip that carries it draws with no kit at hand.
 * Isomorphic and pure. Contract: docs/app-spec/BRAND.md § Element clips.
 * @module utils/brand/element/resolve
 */

import { without } from '#utils/brand/limits.js';
import { tokenValue } from '#utils/brand/tokens.js';
import { normalizeDesign } from './normalize.js';
import { fill, isPresent, references } from './refs.js';

/** @typedef {import('#utils/brand/types.js').Design} Design */
/** @typedef {import('#utils/brand/types.js').Kit} Kit */

/** @type {WeakMap<object, Map<string, Design|null>>} */
const designs = new WeakMap();

/**
 * Settle a `when` / `unless` that no longer waits for a slot.
 * @param {Record<string, any>} layer - Tokens filled in
 * @returns {Record<string, any>|null} null when the layer is left out for good
 */
function settle(layer) {
  let out = layer;
  for (const key of ['when', 'unless']) {
    if (!Object.hasOwn(out, key) || references(out[key]).length) continue;
    if (isPresent(out[key]) !== (key === 'when')) return null;
    out = without(out, key);
  }
  return out;
}

/**
 * The same for the adjustments of a format: a decided condition becomes
 * `true` or `false`, so the layer can still be switched per format.
 * @param {Record<string, any>|undefined} formats
 * @returns {Record<string, any>|undefined}
 */
function settleFormats(formats) {
  if (!formats) return formats;
  /** @type {Record<string, any>} */
  const out = {};
  for (const [format, patch] of Object.entries(formats)) {
    /** @type {Record<string, any>} */
    const layers = {};
    for (const [id, layer] of Object.entries(patch.layers || {})) {
      const decided = (/** @type {string} */ key) =>
        Object.hasOwn(layer, key) && !references(layer[key]).length
          ? { [key]: isPresent(layer[key]) }
          : {};
      layers[id] = { ...layer, ...decided('when'), ...decided('unless') };
    }
    out[format] = { ...patch, ...(patch.layers && { layers }) };
  }
  return out;
}

/**
 * The families the text of an element is set in.
 * @param {Record<string, any>} body - Layers and formats, tokens filled in
 * @returns {Set<string>} Lower case
 */
function familiesOf(body) {
  const fonts = [
    ...body.layers,
    ...Object.values(body.formats || {}).flatMap((patch) => Object.values(patch.layers || {})),
  ].map((layer) => layer.font?.family);
  return new Set(fonts.filter((family) => typeof family === 'string').map((f) => f.toLowerCase()));
}

/**
 * @param {Kit} kit - An effective kit
 * @param {string} id
 * @returns {Design|null}
 */
function resolve(kit, id) {
  const element = Object.hasOwn(kit.elements || {}, id) ? kit.elements[id] : null;
  if (!element) return null;
  const lookup = (/** @type {string} */ path) =>
    path.startsWith('slot.') ? undefined : tokenValue(kit, path);
  const { slots } = element;
  const filled = fill(without(element, 'label', 'slots'), lookup);
  const layers = filled.layers.map(settle).filter(Boolean);
  const body = { ...filled, layers, formats: settleFormats(filled.formats) };
  const families = familiesOf(body);
  const motion = tokenValue(kit, 'motion') || {};
  return normalizeDesign({
    ...body,
    margin: body.margin ?? tokenValue(kit, 'space.margin'),
    slots: Object.keys(slots || {}),
    motion: { by: motion.by, ease: motion.ease, speed: motion.speed },
    fonts: (kit.fonts || []).filter((face) => families.has(face.family.toLowerCase())),
  });
}

/**
 * The design of an element of a kit: the element with every token replaced,
 * self-contained and small. The same kit object and id give the same design
 * object, so it can be compared by identity.
 * @param {Kit} kit - An effective kit (`resolveKit`)
 * @param {string} id - The element's id
 * @returns {Design|null} null when the kit has no such element
 */
export function resolveElement(kit, id) {
  if (!kit || typeof kit !== 'object' || typeof id !== 'string') return null;
  let known = designs.get(kit);
  if (!known) designs.set(kit, (known = new Map()));
  if (!known.has(id)) known.set(id, resolve(kit, id));
  return known.get(id);
}
