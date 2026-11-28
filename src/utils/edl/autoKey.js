/**
 * Setting a property the way the inspector does ("auto-key"), and turning
 * the animation of a property on and off. Times are timeline times.
 * Isomorphic and pure. Reference: docs/app-spec/EDL.md § Keyframes.
 * @module utils/edl/autoKey
 */

import { clipLocalTime, getPath, valueAt } from './animate.js';
import { writeValue } from './clipPatch.js';
import { changeClip } from './immutable.js';
import { fontEnums } from './sanitize.js';
import { putKey, withKeys } from './keyEdit.js';
import { isAnimated, keysOf } from './keyframeQuery.js';

/** @typedef {import('./types.js').Edl} Edl */

/**
 * Set a property to a value at a moment. When the property is animated
 * this writes a key at `time` (replacing the one there, within half a
 * frame); when it is not, it writes the plain value and `time` does not
 * matter. One call for every inspector field:
 *
 * - schema fields — `transform.x`, `text.color`, `volume`, `label`… — are
 *   coerced and clamped exactly as by `updateClip`;
 * - `generator.params.<name>` and `effects.<effectId>.<param>` take any
 *   JSON-safe value; `null` removes a plain parameter (back to its default).
 * @param {Edl} edl
 * @param {string} clipId
 * @param {string} path
 * @param {any} value
 * @param {number} [time] - Timeline seconds; needed only for animated properties
 * @returns {Edl}
 */
export function setValueAt(edl, clipId, path, value, time) {
  return changeClip(edl, clipId, (clip, track) =>
    isAnimated(clip, path)
      ? putKey(edl, clip, path, time, value)
      : writeValue(clip, track, path, value, fontEnums(edl.fonts)),
  );
}

/**
 * Turn the animation of a property on or off.
 *
 * - On: the property gets its first key at `time`, holding the value it
 *   has now. A parameter that is not stored (it uses its catalog default)
 *   has no value to take: pass it as `opts.value`.
 * - Off: every key of the property is removed and the property keeps the
 *   value it has at `time`.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {string} path
 * @param {boolean} animated
 * @param {number} [time] - Timeline seconds; default: the clip's start
 * @param {{ value?: number|string, ease?: string }} [opts]
 * @returns {Edl} Unchanged when the property is already in that state, or
 *   cannot be animated
 */
export function setAnimated(edl, clipId, path, animated, time, opts = {}) {
  return changeClip(edl, clipId, (clip, track) => {
    if (isAnimated(clip, path) === Boolean(animated)) return clip;
    const at = Number.isFinite(time) ? time : clip.timelineStart;
    if (animated) return putKey(edl, clip, path, at, opts.value ?? getPath(clip, path), opts.ease);
    const value = valueAt(keysOf(clip, path), clipLocalTime(clip, at));
    return writeValue(withKeys(clip, path, []), track, path, value);
  });
}
