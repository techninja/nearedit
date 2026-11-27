/**
 * Clip levels — fades, opacity and gain at a moment in time. Shared by the
 * preview (compositor + audio mixer) and the FFmpeg renderer.
 * Rules: docs/app-spec/EDL.md § Rendering Semantics. Isomorphic and pure.
 * @module utils/edl/levels
 */

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * Fade multiplier of a clip at a moment: ramps 0→1 over fadeIn and 1→0 over
 * fadeOut.
 * @param {{ timelineStart: number, timelineEnd: number, fadeIn?: number, fadeOut?: number }} clip
 * @param {number} time - Timeline seconds
 * @returns {number} 0..1
 */
export function fadeFactor(clip, time) {
  const sinceStart = time - clip.timelineStart;
  const untilEnd = clip.timelineEnd - time;
  let factor = 1;
  if (clip.fadeIn > 0 && sinceStart < clip.fadeIn) factor = sinceStart / clip.fadeIn;
  if (clip.fadeOut > 0 && untilEnd < clip.fadeOut)
    factor = Math.min(factor, untilEnd / clip.fadeOut);
  return clamp01(factor);
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
 * Opacity of a video-track clip at a moment (transform opacity excluded).
 * @param {{ clips: any[] }} track
 * @param {any} clip
 * @param {number} time - Timeline seconds
 * @returns {number} 0..1
 */
export function videoOpacity(track, clip, time) {
  const sinceStart = time - clip.timelineStart;
  let factor = 1;
  if (clip.fadeIn > 0 && sinceStart < clip.fadeIn) factor = sinceStart / clip.fadeIn;
  const out = videoFadeOutWindow(track, clip);
  if (out && time > out.start) factor = Math.min(factor, (out.end - time) / clip.fadeOut);
  return clamp01(factor);
}

/**
 * Linear audio gain of a clip at a moment. Audio cross-fades are plain
 * equal-gain: both clips ramp, unlike video.
 * @param {{ volume?: number }} track
 * @param {{ volume?: number, timelineStart: number, timelineEnd: number }} clip
 * @param {number} time - Timeline seconds
 * @returns {number}
 */
export function clipGain(track, clip, time) {
  return (track.volume ?? 1) * (clip.volume ?? 1) * fadeFactor(clip, time);
}
