/**
 * Keyframe animation — the value of an animated clip property at a moment.
 * The preview and the renderer both resolve clips through `resolveClip`, so
 * an animation can never look different between them.
 *
 * `clip.keyframes` maps a property path to keys sorted by time:
 *   { "transform.x": [{ t: 0, v: 0, ease: "ease-out" }, { t: 2, v: 300 }] }
 * `t` is in the clip's own source time (see `clipLocalTime`), so keys stay
 * attached to the content through trims, slips and splits. `ease` shapes the
 * segment that leaves its key. Values are numbers or hex colours.
 * Isomorphic and pure. Reference: docs/app-spec/COMPOSITOR.md § Keyframes.
 * @module utils/edl/animate
 */

import { EASINGS, ease } from './easing.js';

export { EASINGS, ease };

/** @typedef {{ t: number, v: number|string, ease?: string }} Key */

const HEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;
const lerp = (a, b, p) => a + (b - a) * p;

/**
 * @param {unknown} value
 * @returns {boolean} True for `#rrggbb` and `#rrggbbaa`
 */
export const isColor = (value) => typeof value === 'string' && HEX.test(value);

/**
 * Blend two hex colours channel by channel (alpha included when either has it).
 * @param {string} from
 * @param {string} to
 * @param {number} p - 0..1
 * @returns {string} `#rrggbb`, or `#rrggbbaa` when either input carries alpha
 */
export function lerpColor(from, to, p) {
  const parts = (hex) => [1, 3, 5, 7].map((i) => parseInt(hex.slice(i, i + 2) || 'ff', 16));
  const a = parts(from);
  const b = parts(to);
  const channels = from.length > 7 || to.length > 7 ? 4 : 3;
  let out = '#';
  for (let i = 0; i < channels; i++) {
    const value = Math.max(0, Math.min(255, Math.round(lerp(a[i], b[i], p))));
    out += value.toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Value of one keyframed property at a time. Before the first key it holds
 * the first value, after the last key the last value.
 * @param {Key[]} keys - Sorted by `t`
 * @param {number} t - Clip-local time, seconds
 * @returns {number|string|undefined} undefined when there are no keys
 */
export function valueAt(keys, t) {
  if (!keys?.length) return undefined;
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  let i = 0;
  while (keys[i + 1].t <= t) i++;
  const from = keys[i];
  const to = keys[i + 1];
  const p = ease(from.ease, (t - from.t) / (to.t - from.t));
  if (isColor(from.v) && isColor(to.v)) return lerpColor(String(from.v), String(to.v), p);
  if (typeof from.v !== 'number' || typeof to.v !== 'number') return p < 1 ? from.v : to.v;
  return lerp(from.v, to.v, p);
}

/**
 * The time base of keyframes and generators: seconds into the clip's own
 * source. A trim or a slip changes `sourceIn`, never the keys.
 * @param {{ sourceIn?: number, timelineStart: number }} clip
 * @param {number} time - Timeline seconds
 * @returns {number}
 */
export const clipLocalTime = (clip, time) => (clip.sourceIn || 0) + (time - clip.timelineStart);

/**
 * Read a property by path. `effects.<effectId>.<param>` addresses a
 * parameter of the effect with that id (a longer path reaches into a
 * structured parameter: `effects.fx_1.center.x`); every other path is
 * dotted access.
 * @param {any} clip
 * @param {string} path
 * @returns {any}
 */
export function getPath(clip, path) {
  const parts = path.split('.');
  const walk = (node, keys) =>
    keys.reduce((at, key) => (at === null || at === undefined ? at : at[key]), node);
  if (parts[0] === 'effects' && parts.length >= 3) {
    const effect = (clip.effects || []).find((fx) => fx.effectId === parts[1]);
    return walk(effect?.params, parts.slice(2));
  }
  return walk(clip, parts);
}

/**
 * Copy of a clip with one property replaced (nothing is mutated).
 * @param {any} clip
 * @param {string} path
 * @param {any} value
 * @returns {any}
 */
export function setPath(clip, path, value) {
  const parts = path.split('.');
  const assign = (node, keys) => {
    const base = node && typeof node === 'object' ? node : {};
    const next = keys.length === 1 ? value : assign(base[keys[0]], keys.slice(1));
    return { ...base, [keys[0]]: next };
  };
  if (parts[0] === 'effects' && parts.length >= 3) {
    const effects = (clip.effects || []).map((fx) =>
      fx.effectId === parts[1] ? { ...fx, params: assign(fx.params, parts.slice(2)) } : fx,
    );
    return { ...clip, effects };
  }
  return assign(clip, parts);
}

/**
 * The clip as it is at a moment: every keyframed property replaced by its
 * value then. A clip without keyframes is returned as is.
 * @param {any} clip
 * @param {number} time - Timeline seconds
 * @returns {any}
 */
export function resolveClip(clip, time) {
  const paths = clip.keyframes ? Object.keys(clip.keyframes) : [];
  if (!paths.length) return clip;
  const t = clipLocalTime(clip, time);
  let out = clip;
  for (const path of paths) {
    const value = valueAt(clip.keyframes[path], t);
    if (value !== undefined) out = setPath(out, path, value);
  }
  return out;
}
