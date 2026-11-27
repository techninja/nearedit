/**
 * Clip levels — fades, opacity and gain at a moment in time. Shared by the
 * preview (compositor + audio mixer) and the renderers.
 * Rules: docs/app-spec/EDL.md § Rendering Semantics; the fade shapes are
 * defined in fadeCurves.js. Isomorphic and pure.
 *
 * **Keyframes.** These functions read plain values. Pass clips that went
 * through `resolveClip(clip, time)` (animate.js) and a keyframed `volume`
 * (a volume envelope) or `transform.opacity` just works; fade lengths and
 * curves cannot be keyframed. `gainEnvelope.js` does the resolving for you
 * when you need a clip's gain over its whole length.
 * @module utils/edl/levels
 */

import { fadeInLevel, fadeOutRemaining } from './fadeCurves.js';

/**
 * A clip as the level functions read it.
 * @typedef {{ timelineStart: number, timelineEnd: number, fadeIn?: number, fadeOut?: number,
 *   fadeInCurve?: string, fadeOutCurve?: string }} Fading
 */

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Level of the fade-in alone: 1 once it is over.
 * @param {Fading} clip
 * @param {number} time - Timeline seconds
 * @returns {number} 0..1
 */
function risen(clip, time) {
  const sinceStart = time - clip.timelineStart;
  if (!(clip.fadeIn > 0) || sinceStart >= clip.fadeIn) return 1;
  return fadeInLevel(clip.fadeInCurve, sinceStart / clip.fadeIn);
}

/**
 * Level of the fade-out alone: 1 until it begins.
 * @param {Fading} clip
 * @param {number} time - Timeline seconds
 * @returns {number} 0..1
 */
function fallen(clip, time) {
  const untilEnd = clip.timelineEnd - time;
  if (!(clip.fadeOut > 0) || untilEnd >= clip.fadeOut) return 1;
  return fadeOutRemaining(clip.fadeOutCurve, untilEnd / clip.fadeOut);
}

/**
 * Fade multiplier of a clip at a moment: rises 0→1 over `fadeIn` along
 * `fadeInCurve` and falls 1→0 over `fadeOut` along `fadeOutCurve` (linear
 * when a curve is missing). Outside the clip's fades it is 1.
 * @param {Fading} clip - Resolved with `resolveClip` if it has keyframes
 * @param {number} time - Timeline seconds
 * @returns {number} 0..1
 */
export function fadeFactor(clip, time) {
  return clamp01(Math.min(risen(clip, time), fallen(clip, time)));
}

/**
 * The clip that cross-fades in over the end of `clip` on the same track:
 * the next clip that starts before `clip` ends.
 * @param {{ clips: any[] }} track
 * @param {{ clipId: string, timelineStart: number, timelineEnd: number }} clip
 * @returns {any|null}
 */
export function dissolvePartner(track, clip) {
  let partner = null;
  for (const other of track.clips || []) {
    if (other.clipId === clip.clipId) continue;
    if (other.timelineStart <= clip.timelineStart || other.timelineStart >= clip.timelineEnd)
      continue;
    if (!partner || other.timelineStart < partner.timelineStart) partner = other;
  }
  return partner;
}

/**
 * Time at which a clip's video fade-out ends. During a cross-fade the
 * outgoing picture stays opaque underneath while the incoming one fades in
 * over it (a true dissolve), so its fade-out is confined to the part of the
 * clip that nothing on the same track covers.
 * @param {{ clips: any[] }} track
 * @param {{ clipId: string, timelineStart: number, timelineEnd: number, fadeOut?: number }} clip
 * @returns {{ start: number, end: number } | null} null when there is no visible fade-out
 */
export function videoFadeOutWindow(track, clip) {
  if (!(clip.fadeOut > 0)) return null;
  const partner = dissolvePartner(track, clip);
  if (partner) return null;
  return { start: clip.timelineEnd - clip.fadeOut, end: clip.timelineEnd };
}

/**
 * Opacity a video-track clip gets from its fades at a moment. The fade-in
 * follows `fadeInCurve`; the fade-out follows `fadeOutCurve` but only where
 * nothing dissolves in over it (`videoFadeOutWindow`). The clip's own
 * `transform.opacity` and its track's `opacity` are not included — the
 * compositor multiplies them in.
 * @param {{ clips: any[] }} track
 * @param {any} clip - Resolved with `resolveClip` if it has keyframes
 * @param {number} time - Timeline seconds
 * @returns {number} 0..1
 */
export function videoOpacity(track, clip, time) {
  const shown = videoFadeOutWindow(track, clip) ? fallen(clip, time) : 1;
  return clamp01(Math.min(risen(clip, time), shown));
}

/**
 * Linear audio gain of a clip at a moment:
 * `track.volume × clip.volume × fadeFactor`. Audio cross-fades are plain
 * equal-gain: both clips ramp, unlike video, and with the same curve on
 * both sides the two gains sum to 1.
 * @param {{ volume?: number }} track
 * @param {Fading & { volume?: number }} clip - Resolved with `resolveClip`
 *   if it has keyframes: a keyframed `volume` is then a volume envelope
 * @param {number} time - Timeline seconds
 * @returns {number} Never negative
 */
export function clipGain(track, clip, time) {
  return Math.max(0, (track.volume ?? 1) * (clip.volume ?? 1) * fadeFactor(clip, time));
}
