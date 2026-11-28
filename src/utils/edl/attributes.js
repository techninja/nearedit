/**
 * Paste attributes — copy how one clip looks onto others without touching
 * what they show or where they are (Vegas's "Paste Event Attributes").
 * Isomorphic and pure.
 * @module utils/edl/attributes
 */

import { captionInfo } from './captionQuery.js';
import { setCaptions } from './captions.js';
import { tidyKeyframes } from './clipPaths.js';
import { NO_OVERLAP, fitFades, neighbourOverlaps } from './fades.js';
import { idList, indexClips, mapClips } from './immutable.js';
import { sameJson } from './jsonBag.js';
import { normalizeClip } from './normalizeClip.js';
import { EPS, fpsOf, snap } from './time.js';
import { fontEnums } from './fontEnums.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */
/** @typedef {import('./types.js').Track} Track */

/**
 * Which attributes to paste. Left out entirely, everything is pasted
 * (the text style only when the source is a title).
 * @typedef {Object} AttributeParts
 * @property {boolean} [transform] - Position, scale, rotation, opacity, crop, fit, ken burns
 * @property {boolean} [effects] - The effect stack (replaces the target's)
 * @property {boolean} [keyframes] - Every keyframe (replaces the target's);
 *   keys keep their distance from the start of the clip
 * @property {boolean} [blendMode]
 * @property {boolean} [fades] - Fade lengths and both fade curves
 * @property {boolean} [text] - The text style; the words stay
 * @property {boolean} [captions] - Whether captions are on — only when
 *   asked for by name. It goes to each target's voice (`setCaptions`); the
 *   words a clip carries stay its own
 */

/** Keyframe path prefix of each block that is pasted as plain values. */
const BLOCKS = { transform: 'transform.', effects: 'effects.', text: 'text.' };

/**
 * @param {Edl} edl
 * @param {any} source - A clip id, a clip, or a clipboard payload
 * @returns {Clip|null}
 */
function sourceClip(edl, source) {
  if (typeof source === 'string') return indexClips(edl).get(source)?.clip || null;
  const raw = source?.kind === 'nearedit/clips' ? source.items?.[0]?.clip : source;
  // A clip from outside the document may have crossed the system clipboard.
  return normalizeClip(raw, fpsOf(edl), 'video', { enums: fontEnums(edl.fonts) });
}

/**
 * Fade lengths fitted to the target: an edge that is cross-fading keeps
 * its overlap, the other takes the source's fade as far as it fits.
 * @param {Edl} edl
 * @param {Clip} clip
 * @param {Track} track
 * @param {Clip} from
 * @returns {Partial<Clip>}
 */
function fadesFor(edl, clip, track, from) {
  const overlap = neighbourOverlaps(track.clips).get(clip.clipId) || NO_OVERLAP;
  const [inLocked, outLocked] = [overlap.in > EPS, overlap.out > EPS];
  const [fadeIn, fadeOut] = fitFades(
    inLocked ? overlap.in : Math.max(0, snap(edl, from.fadeIn)),
    outLocked ? overlap.out : Math.max(0, snap(edl, from.fadeOut)),
    clip.timelineEnd - clip.timelineStart,
    inLocked,
    outLocked,
  );
  return { fadeIn, fadeOut, fadeInCurve: from.fadeInCurve, fadeOutCurve: from.fadeOutCurve };
}

/**
 * Paste attributes of one clip onto others. Exactly the given clips are
 * changed — linked partners are not, and clips on locked tracks never are.
 *
 * A pasted block (`transform`, `effects`, `text`) replaces the target's
 * values; unless `keyframes` is pasted too, the target's own keyframes on
 * that block are removed so the pasted values show. Pasted keyframes that
 * address nothing in the target (an effect it does not have, generator
 * parameters on a clip that is not a generator) are dropped.
 * @param {Edl} edl
 * @param {string|Clip|import('./clipboard.js').Clipboard} source - The clip
 *   to copy from: its id, the clip itself, or a clipboard payload from
 *   `copyClips` (its first clip is used)
 * @param {Iterable<string>} clipIds - The clips to change
 * @param {AttributeParts} [parts]
 * @returns {Edl}
 */
export function pasteAttributes(edl, source, clipIds, parts) {
  const from = sourceClip(edl, source);
  const ids = new Set(idList(clipIds));
  if (!from || !ids.size) return edl;
  const want = (part) => (parts ? Boolean(parts[part]) : part !== 'text' || !!from.text.content);
  const pasted = mapClips(edl, (clip, track) => {
    if (!ids.has(clip.clipId) || clip === from) return clip;
    /** @type {any} */
    const next = { ...clip };
    let keyframes = clip.keyframes;
    for (const [block, prefix] of Object.entries(BLOCKS)) {
      if (!want(block)) continue;
      next[block] = block === 'text' ? { ...from.text, content: clip.text.content } : from[block];
      keyframes = Object.fromEntries(
        Object.entries(keyframes).filter(([path]) => !path.startsWith(prefix)),
      );
    }
    if (want('blendMode')) next.blendMode = from.blendMode;
    if (want('fades')) Object.assign(next, fadesFor(edl, clip, track, from));
    if (want('keyframes')) {
      const shift = clip.sourceIn - from.sourceIn;
      const rebase = (keys) => keys.map((key) => ({ ...key, t: key.t + shift }));
      keyframes = Object.fromEntries(
        Object.entries(from.keyframes).map(([path, keys]) => [path, rebase(keys)]),
      );
    }
    const made = tidyKeyframes({ ...next, keyframes });
    return sameJson(made, clip) ? clip : made;
  });
  if (!parts?.captions) return pasted;
  const inside = typeof source === 'string';
  const on = inside ? captionInfo(edl, source).on : from.captions?.on === true;
  return setCaptions(pasted, inside ? [...ids].filter((id) => id !== source) : ids, on);
}
