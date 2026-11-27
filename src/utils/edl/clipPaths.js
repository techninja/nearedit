/**
 * Property paths — what a keyframe path addresses in a clip, and which
 * values it may take. Paths are dotted access into the clip
 * (`transform.x`, `text.color`, `volume`, `generator.params.angle`);
 * `effects.<effectId>.<param>` addresses a parameter of one effect.
 * Isomorphic and pure. Reference: docs/app-spec/EDL.md § Keyframes.
 * @module utils/edl/clipPaths
 */

import { isColor } from './animate.js';
import { defaultText, defaultTransform } from './defaults.js';
import { isSafeKey } from './jsonBag.js';
import { coerce, toNumber } from './sanitize.js';

/** @typedef {import('./types.js').Clip} Clip */

/**
 * What a path addresses: a numeric or colour field of the fixed schema
 * (`sample` is its default), or a free-form parameter (`open`).
 * @typedef {{ kind: 'number'|'color'|'open', key: string, sample?: any }} PathInfo
 */

const SEGMENT = /^[A-Za-z0-9_$-]+$/;
const MAX_PATH = 200;
const MAX_SEGMENTS = 6;
const COLOR_KEY = /color$|^background$/i;
/** The fixed blocks whose numeric and colour fields can be animated. */
const SHAPES = { transform: defaultTransform(), text: defaultText() };

/**
 * @param {any} clip
 * @param {string} path
 * @returns {PathInfo|null} null when the path addresses nothing that can be
 *   animated: structural fields (times, fades, ids), enumerations, an
 *   effect the clip does not have, generator fields of a clip that is not
 *   a generator, or a malformed path
 */
export function describePath(clip, path) {
  if (typeof path !== 'string' || path.length > MAX_PATH) return null;
  const parts = path.split('.');
  if (parts.length > MAX_SEGMENTS || !parts.every((p) => SEGMENT.test(p) && isSafeKey(p))) {
    return null;
  }
  const [root, ...rest] = parts;
  const key = parts[parts.length - 1];
  if (root === 'volume') return rest.length ? null : { kind: 'number', key, sample: 1 };
  if (root === 'effects') {
    const known = (clip?.effects || []).some((fx) => fx.effectId === rest[0]);
    return known && rest.length >= 2 ? { kind: 'open', key } : null;
  }
  if (root === 'generator') {
    if (!clip?.generator?.type) return null;
    if (path === 'generator.seed') return { kind: 'number', key, sample: 0 };
    return rest[0] === 'params' && rest.length >= 2 ? { kind: 'open', key } : null;
  }
  let sample = Object.hasOwn(SHAPES, root) && rest.length ? SHAPES[root] : undefined;
  for (const part of rest) sample = sample && typeof sample === 'object' ? sample[part] : undefined;
  if (typeof sample === 'number') return { kind: 'number', key, sample };
  return typeof sample === 'string' && COLOR_KEY.test(key) ? { kind: 'color', key, sample } : null;
}

/**
 * The value a keyframe may hold for a path: a number (clamped to the range
 * of a schema field) or, where the property is a colour or a free-form
 * parameter, a hex colour.
 * @param {PathInfo} info
 * @param {any} value
 * @returns {number|string|undefined} undefined when the value cannot be used
 */
export function keyValue(info, value) {
  if (info.kind !== 'number' && isColor(value)) return value;
  if (info.kind === 'color') return undefined;
  const number = info.kind === 'open' ? toNumber(value, NaN) : coerce(info.key, value, NaN);
  return Number.isFinite(number) ? number + 0 : undefined;
}

/**
 * Drop the keyframes that cannot work in this clip: paths that address
 * nothing (`describePath`) and keys whose value does not suit the property.
 * @param {Clip} clip - A clip whose `keyframes` map is already clean
 * @returns {Clip} The same clip when nothing had to go
 */
export function tidyKeyframes(clip) {
  let changed = false;
  /** @type {Record<string, any>} */
  const out = {};
  for (const [path, keys] of Object.entries(clip.keyframes || {})) {
    const info = describePath(clip, path);
    const kept = !info
      ? []
      : keys.flatMap((key) => {
          const v = keyValue(info, key.v);
          return v === undefined ? [] : v === key.v ? key : { ...key, v };
        });
    if (kept.length) out[path] = kept.every((key, i) => key === keys[i]) ? keys : kept;
    if (out[path] !== keys) changed = true;
  }
  return changed ? { ...clip, keyframes: out } : clip;
}
