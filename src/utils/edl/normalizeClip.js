/**
 * Clip normalisation: turn whatever an older file, an LLM or a director
 * fragment contains into a complete, valid v3 clip — or reject it.
 * Isomorphic and pure.
 * @module utils/edl/normalizeClip
 */

import { cleanElement } from '#utils/brand/field.js';
import { cleanCutout } from '#utils/cutout/block.js';
import { cleanMusic } from '#utils/music/field.js';
import { cleanWeb, fitWindow } from '#utils/web/field.js';
import { cleanCaptions } from './captionField.js';
import { clipKind } from './clipKind.js';
import { tidyKeyframes } from './clipPaths.js';
import { fitFades } from './fades.js';
import { createClip } from './factory.js';
import { isTimed } from './immutable.js';
import { snapToFrame } from './query.js';
import { isObject, mergeShape, toNumber } from './sanitize.js';
import { EPS, sourceLimit } from './time.js';

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
 *   A `web` block that holds a recipe is kept, the recipe normalised, and
 *   so is a `music` block that holds a song (never both: `web` wins); no
 *   other clip has those fields. Such a clip's source window is brought
 *   inside its score or song, and one written without an end lasts to the
 *   end of it. An `element` block that holds a design is kept on a clip
 *   that is neither, read as `cleanElement` reads it; such a clip names no
 *   file. A `captions` block is kept on a clip that plays video or sound,
 *   when captions are on or the clip carries words of its own, and a
 *   `cutout` block on a clip that plays a video file (`cleanCutout`).
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
 * @param {{ legacy?: boolean, enums?: Record<string, string[]> }} [opts] -
 *   `legacy`: the clip comes from a v1 or v2 document, where clips without a
 *   media source had no source window: theirs becomes `0 … duration` (unless
 *   the clip carries a generator or keyframes, which no v1/v2 clip does).
 *   `enums`: the enumerations in force — `fontEnums(edl.fonts)` when the
 *   document has fonts of its own, so a title may name them
 * @returns {Clip|null} null when the clip has no usable time span
 */
export function normalizeClip(raw, fps, trackType, opts = {}) {
  if (!isObject(raw)) return null;
  const given = { ...raw, clipId: raw.clipId ?? raw.id };
  const merged = mergeShape(createClip({ clipId: '' }), given, opts.enums);
  const kenBurns = migrateKenBurns(merged.transform.kenBurns, raw.transform?.kenBurns);
  /** @type {any} */
  const filled = { ...merged, transform: { ...merged.transform, kenBurns } };
  // Only a web clip has a `web` block and only a music clip a `music` block;
  // no other clip gets either field, and no clip both: the web block wins.
  const web = cleanWeb(raw.web);
  const music = web ? null : cleanMusic(raw.music);
  // Nor is a clip an element and one of those: an element draws its design, not a file.
  const element = web || music ? null : cleanElement(raw.element);
  const made = element ? { ...filled, sourceFile: '', placeholder: false, element } : filled;
  /** @type {any} */
  const clip = tidyKeyframes(web ? { ...filled, web } : music ? { ...filled, music } : made);
  const timed = isTimed(clip, /** @type {any} */ ({ type: trackType }));
  const captions = timed ? cleanCaptions(raw.captions) : null;
  const filmed = clipKind(clip, { type: trackType }) === 'video';
  const cutout = filmed ? cleanCutout(raw.cutout) : null;
  // No genuine v1/v2 clip has a generator or keyframes: one that does was
  // written for v3 (by hand, without a version) and means its source window.
  const authored = isObject(raw.generator) || isObject(raw.keyframes);
  const windowed = timed || !opts.legacy || authored;

  let start = toNumber(raw.timelineStart, NaN);
  const rawIn = toNumber(raw.sourceIn, 0);
  let sourceIn = timed ? Math.max(0, rawIn) : windowed ? rawIn : 0;
  // A web clip's source is its score and a music clip's its song: without
  // an end of its own it runs to the end of that, and its window is brought
  // inside it.
  const limit = sourceLimit({ fps }, clip);
  const rawOut = toNumber(raw.sourceOut, limit ?? NaN);
  const range = rawOut - (windowed ? sourceIn : Math.max(0, rawIn));
  let end = toNumber(raw.timelineEnd, start + range);
  if (timed && range > EPS) end = Math.min(end, start + range);
  if (start < 0) {
    if (windowed) sourceIn -= start;
    start = 0;
  }
  const timelineStart = snapToFrame(start, fps);
  let timelineEnd = snapToFrame(end, fps);
  if (!(timelineEnd - timelineStart > EPS)) return null;
  if (limit !== undefined) {
    const fitted = fitWindow(sourceIn, timelineEnd - timelineStart, limit, fps);
    sourceIn = fitted.sourceIn;
    timelineEnd = snapToFrame(timelineStart + fitted.length, fps);
  }
  const duration = timelineEnd - timelineStart;

  const exact = Math.abs(rawOut - sourceIn - duration) <= EPS;
  const sourceOut = exact ? rawOut : sourceIn + duration;
  const [fadeIn, fadeOut] = fitFades(
    Math.max(0, clip.fadeIn),
    Math.max(0, clip.fadeOut),
    duration,
    false,
    false,
  );
  const placed = { ...clip, timelineStart, timelineEnd, sourceIn, sourceOut, fadeIn, fadeOut };
  const spoken = captions ? { ...placed, captions } : placed;
  return cutout ? { ...spoken, cutout } : spoken;
}
