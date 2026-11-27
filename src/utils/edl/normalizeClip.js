/**
 * Clip normalisation: turn whatever an older file, an LLM or a director
 * fragment contains into a complete, valid v3 clip — or reject it.
 * Isomorphic and pure.
 * @module utils/edl/normalizeClip
 */

import { tidyKeyframes } from './clipPaths.js';
import { fitFades } from './fades.js';
import { createClip } from './factory.js';
import { isTimed } from './immutable.js';
import { snapToFrame } from './query.js';
import { isObject, mergeShape, toNumber } from './sanitize.js';
import { EPS } from './time.js';

/** @typedef {import('./types.js').Clip} Clip */

/**
 * v1 had no `kenBurns.enabled`: such a block is enabled when any of its
 * start/end pairs differ.
 * @param {Record<string, any>} kenBurns - Already filled with defaults
 * @param {any} raw - The block as it was stored
 * @returns {Record<string, any>}
 */
function migrateKenBurns(kenBurns, raw) {
  const explicit = typeof raw?.enabled === 'boolean' || ['true', 'false'].includes(raw?.enabled);
  if (explicit || !isObject(raw)) return kenBurns;
  const animated = Object.keys(kenBurns).some(
    (key) => key.startsWith('start') && kenBurns[key] !== kenBurns[`end${key.slice(5)}`],
  );
  return animated === kenBurns.enabled ? kenBurns : { ...kenBurns, enabled: animated };
}

/**
 * Normalise one clip.
 *
 * - Every field gets its default; wrong types, unknown keys and out-of-range
 *   numbers are repaired (`id` is accepted for `clipId`). Generator and
 *   effect parameters are kept as bounded JSON-safe data, effect ids made
 *   unique, keyframes sorted, and keyframes that address nothing dropped.
 * - Timeline times snap to the frame grid. A missing `timelineEnd` is derived
 *   from the source range; a clip that starts before 0 is trimmed to 0.
 * - Every clip plays at speed 1 (invariant 1). Video/audio: when the
 *   timeline span and the source range disagree the shorter one wins. Other
 *   clips have an unbounded source, so their timeline span stands. Then
 *   `sourceOut` is re-derived.
 * - Fades are clamped to the duration.
 * @param {any} raw
 * @param {number} fps
 * @param {'video'|'audio'} trackType - Type of the track that holds it
 * @param {{ legacy?: boolean }} [opts] - `legacy`: the clip comes from a v1
 *   or v2 document, where clips without a media source had no source
 *   window: theirs becomes `0 … duration` (unless the clip carries a
 *   generator or keyframes, which no v1/v2 clip does)
 * @returns {Clip|null} null when the clip has no usable time span
 */
export function normalizeClip(raw, fps, trackType, opts = {}) {
  if (!isObject(raw)) return null;
  const merged = mergeShape(createClip({ clipId: '' }), { ...raw, clipId: raw.clipId ?? raw.id });
  const kenBurns = migrateKenBurns(merged.transform.kenBurns, raw.transform?.kenBurns);
  /** @type {any} */
  const filled = { ...merged, transform: { ...merged.transform, kenBurns } };
  /** @type {any} */
  const clip = tidyKeyframes(filled);
  const timed = isTimed(clip, /** @type {any} */ ({ type: trackType }));
  // No genuine v1/v2 clip has a generator or keyframes: one that does was
  // written for v3 (by hand, without a version) and means its source window.
  const authored = isObject(raw.generator) || isObject(raw.keyframes);
  const windowed = timed || !opts.legacy || authored;

  let start = toNumber(raw.timelineStart, NaN);
  const rawIn = toNumber(raw.sourceIn, 0);
  let sourceIn = timed ? Math.max(0, rawIn) : windowed ? rawIn : 0;
  const rawOut = toNumber(raw.sourceOut, NaN);
  const range = rawOut - (windowed ? sourceIn : Math.max(0, rawIn));
  let end = toNumber(raw.timelineEnd, start + range);
  if (timed && range > EPS) end = Math.min(end, start + range);
  if (start < 0) {
    if (windowed) sourceIn -= start;
    start = 0;
  }
  const timelineStart = snapToFrame(start, fps);
  const timelineEnd = snapToFrame(end, fps);
  const duration = timelineEnd - timelineStart;
  if (!(duration > EPS)) return null;

  const exact = Math.abs(rawOut - sourceIn - duration) <= EPS;
  const sourceOut = exact ? rawOut : sourceIn + duration;
  const [fadeIn, fadeOut] = fitFades(
    Math.max(0, clip.fadeIn),
    Math.max(0, clip.fadeOut),
    duration,
    false,
    false,
  );
  return { ...clip, timelineStart, timelineEnd, sourceIn, sourceOut, fadeIn, fadeOut };
}
