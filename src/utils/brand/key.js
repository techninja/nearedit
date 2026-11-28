/**
 * The revision of a kit: a key made from everything that changes a picture
 * or a sound — tokens, font files, the elements as they are laid out and
 * animated, the version of the element language — and from nothing else:
 * not its id, its name, or the labels and samples a form shows. An element
 * clip remembers the key of the kit its design was made from; when the
 * project's kit has another, the clip is out of date.
 * Isomorphic and pure. Contract: docs/app-spec/BRAND.md § A kit.
 * @module utils/brand/key
 */

import { KEY_LENGTH, KEY_PATTERN, canonicalJson } from '#utils/web/key.js';
import { sha256 } from '#utils/web/sha256.js';
import { BRAND_VERSION } from './limits.js';

export { KEY_LENGTH, KEY_PATTERN };

/** @type {WeakMap<object, string>} */
const keys = new WeakMap();

/**
 * A kit as its key sees it.
 * @param {import('./types.js').Kit} kit - An effective kit
 * @returns {Record<string, any>}
 */
export function canonicalKit(kit) {
  /** @type {Record<string, any>} */
  const elements = {};
  for (const [id, element] of Object.entries(kit?.elements || {})) {
    const { label: _label, slots, ...drawn } = element;
    elements[id] = { ...drawn, slots: Object.keys(slots || {}).sort() };
  }
  return { tokens: kit?.tokens || {}, fonts: kit?.fonts || [], elements };
}

/**
 * The key of an effective kit.
 * @param {import('./types.js').Kit} kit - As `resolveKit` returns it
 * @param {number|string} [version] - The language's version, for tests
 * @returns {string} 20 lowercase hex digits: the start of the SHA-256 of
 *   `version \n canonical JSON`
 */
export function kitKey(kit, version = BRAND_VERSION) {
  const known = version === BRAND_VERSION && kit && typeof kit === 'object' && keys.get(kit);
  if (known) return known;
  const key = sha256(`${version}\n${canonicalJson(canonicalKit(kit))}`).slice(0, KEY_LENGTH);
  if (version === BRAND_VERSION && kit && typeof kit === 'object') keys.set(kit, key);
  return key;
}
