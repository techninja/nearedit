/**
 * Clip building blocks of a motion piece. Everything is placed in whole
 * frames, and every clip's source window starts at 0, so a keyframe's `t`
 * (clip-local source time, EDL.md § keyframes) is simply the time since
 * the clip began.
 * @module api/director/motion/clips
 */

import { createClip } from '#utils/edl/factory.js';

/**
 * @typedef {[number, number|string, string?]} Key - Frames since the clip
 *   began, the value there, and the easing of the stretch that follows
 * @typedef {{ t: number, v: number|string, ease: string }} Keyframe
 */

/**
 * A complete clip over a span of frames.
 * @param {number} startF - Timeline frame it starts on
 * @param {number} endF - Timeline frame it ends before
 * @param {number} fps
 * @param {object} fields - Everything else: generator, text, effects, keyframes…
 * @returns {any}
 */
export function clipAt(startF, endF, fps, fields) {
  return createClip({
    timelineStart: startF / fps,
    timelineEnd: endF / fps,
    sourceIn: 0,
    sourceOut: (endF - startF) / fps,
    ...fields,
  });
}

/**
 * Keyframes of one property. A key that falls on the frame of the one
 * before it takes that key's place, so a list squeezed into a very short
 * clip stays valid and still ends on its last value.
 * @param {Key[]} keys - In time order
 * @param {number} fps
 * @returns {Keyframe[]}
 */
export function keysAt(keys, fps) {
  /** @type {Keyframe[]} */
  const out = [];
  let last = -Infinity;
  for (const [frame, v, ease = 'linear'] of keys) {
    const at = Math.max(last, Math.round(frame));
    if (at === last) out.pop();
    out.push({ t: at / fps, v, ease });
    last = at;
  }
  return out;
}

/**
 * A keyframe map: `{ path: Key[] }` to `{ path: Keyframe[] }`, leaving out
 * properties that would not move.
 * @param {Record<string, Key[]>} paths
 * @param {number} fps
 * @returns {Record<string, Keyframe[]>}
 */
export function keyframes(paths, fps) {
  /** @type {Record<string, Keyframe[]>} */
  const out = {};
  for (const [path, keys] of Object.entries(paths)) {
    const list = keysAt(keys, fps);
    if (list.length > 1) out[path] = list;
  }
  return out;
}

/**
 * Keys of generator parameters as full keyframe paths.
 * @param {Record<string, Key[]>} keys - By parameter name (`angle`, `center.x`)
 * @returns {Record<string, Key[]>} By path (`generator.params.angle`)
 */
export function paramKeys(keys) {
  return Object.fromEntries(
    Object.entries(keys).map(([name, list]) => [`generator.params.${name}`, list]),
  );
}

/**
 * An effect stack entry.
 * @param {string} effectId - Unique in its clip; keyframe paths refer to it
 * @param {string} type - An effect of the catalog
 * @param {Record<string, any>} [params]
 * @returns {{ effectId: string, type: string, enabled: boolean, params: Record<string, any> }}
 */
export function effect(effectId, type, params = {}) {
  return { effectId, type, enabled: true, params: { ...params } };
}
