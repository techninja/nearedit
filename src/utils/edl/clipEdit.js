/**
 * Edits to individual clips that do not move them: delete, slip, fades and
 * inspector updates. Isomorphic and pure.
 * @module utils/edl/clipEdit
 */

import { patchClip } from './clipPatch.js';
import { settle } from './crossfade.js';
import { NO_OVERLAP, fitFades, neighbourOverlaps } from './fades.js';
import { changeClip, indexClips, isTimed, mapClips } from './immutable.js';
import { repairLinks } from './links.js';
import { expandSelection } from './selection.js';
import { EPS, clamp, finite, snap, sourceLimit } from './time.js';
import { fontEnums } from './fontEnums.js';

/** @typedef {import('./types.js').Edl} Edl */

/**
 * Delete clips. Linked partners go with them; the fades of the neighbours
 * they were cross-fading with return to 0.
 * @param {Edl} edl
 * @param {Iterable<string>} clipIds
 * @param {{ linked?: boolean }} [opts]
 * @returns {Edl}
 */
export function deleteClips(edl, clipIds, opts = {}) {
  const linked = opts.linked !== false;
  const ids = new Set(expandSelection(edl, clipIds, { linked, grouped: false }));
  const raw = mapClips(edl, (clip) => (ids.has(clip.clipId) ? null : clip));
  return raw === edl ? edl : settle(edl, repairLinks(raw), {});
}

/**
 * Slip: show a different part of the source without moving the clip.
 * A positive delta shows later material. The linked partner slips too so
 * picture and sound stay in sync. Video and audio stay inside their source;
 * a generator, title, image or placeholder slips freely — what moves is its
 * keyframes and generator motion, which live in source time.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {number} delta - Seconds to add to sourceIn/sourceOut
 * @param {{ sourceDurations?: import('./types.js').SourceDurations, linked?: boolean }} [opts]
 * @returns {Edl}
 */
export function slipClip(edl, clipId, delta, opts = {}) {
  const index = indexClips(edl);
  const ids = expandSelection(edl, [clipId], { linked: opts.linked !== false, grouped: false });
  const targets = ids.map((id) => index.get(id));
  if (!targets.some((ref) => ref.clip.clipId === clipId)) return edl;
  let min = -Infinity;
  let max = Infinity;
  for (const { clip, track } of targets) {
    if (!isTimed(clip, track)) continue;
    const known = sourceLimit(edl, clip, opts.sourceDurations);
    min = Math.max(min, -clip.sourceIn);
    if (known !== undefined) max = Math.min(max, known - clip.sourceOut);
  }
  const by = clamp(snap(edl, finite(delta, 0)), Math.min(min, 0), Math.max(max, 0));
  if (Math.abs(by) < EPS) return edl;
  const slipped = new Set(targets.map((ref) => ref.clip.clipId));
  const slip = (clip) => ({
    ...clip,
    sourceIn: clip.sourceIn + by,
    sourceOut: clip.sourceOut + by,
  });
  return mapClips(edl, (clip) => (slipped.has(clip.clipId) ? slip(clip) : clip));
}

/**
 * Set a clip's fade-in and/or fade-out. Fades are clamped so that both fit
 * in the clip (invariant 3). An edge that is cross-fading with a neighbour
 * cannot be set: its fade is the overlap (invariant 4) — move or trim the
 * clip to change it.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {{ fadeIn?: number, fadeOut?: number }} fades - Seconds
 * @returns {Edl}
 */
export function setClipFades(edl, clipId, fades) {
  const ref = indexClips(edl).get(clipId);
  if (!ref || ref.track.locked) return edl;
  const { clip } = ref;
  const overlap = neighbourOverlaps(ref.track.clips).get(clipId) || NO_OVERLAP;
  const wanted = (value, current) =>
    Number.isFinite(value) ? Math.max(0, snap(edl, value)) : current;
  const wantIn = overlap.in > EPS ? overlap.in : wanted(fades?.fadeIn, clip.fadeIn);
  const wantOut = overlap.out > EPS ? overlap.out : wanted(fades?.fadeOut, clip.fadeOut);
  // The fade being set gives way; when both are set, fade-out does.
  const keepOut = overlap.out > EPS || (fades?.fadeOut === undefined && !(overlap.in > EPS));
  const duration = clip.timelineEnd - clip.timelineStart;
  const [fadeIn, fadeOut] = fitFades(wantIn, wantOut, duration, !keepOut, keepOut);
  if (fadeIn === clip.fadeIn && fadeOut === clip.fadeOut) return edl;
  return mapClips(edl, (c) => (c === clip ? { ...clip, fadeIn, fadeOut } : c));
}

/**
 * Deep-merge an inspector patch into a clip: label, colour, volume, prompt,
 * intent, `text.*`, `transform.*`, `transform.kenBurns.*`, `sourceFile`,
 * `blendMode`, `fadeInCurve`, `fadeOutCurve`, `generator.*`…
 * Values of the wrong type and unknown keys are ignored, numbers are
 * clamped to their range. The free-form fields merge by their own rules:
 * `generator.params` and `keyframes` key by key (`null` removes a key),
 * `effects` as a whole list; keyframes that no longer address anything are
 * dropped. Timing, fade lengths, ids and links are not writable here;
 * `sourceIn` is (to choose what a replaced source shows) and the source
 * range is then re-derived from the clip's duration.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {Record<string, any>} patch
 * @returns {Edl}
 */
export function updateClip(edl, clipId, patch) {
  // A title may be set in a font of the document's own.
  const enums = fontEnums(edl.fonts);
  return changeClip(edl, clipId, (clip, track) => patchClip(clip, track, patch, enums));
}
