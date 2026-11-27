/**
 * The fade part of a clip's context menu: right-click a fade (or a
 * cross-fade) and choose the shape of its curve. The choice is stored in
 * the clip's `fadeInCurve` / `fadeOutCurve`.
 * @module utils/timeline/menuFades
 */

import { updateClip } from '#utils/edl/index.js';
import { edit } from '#utils/editor/session.js';
import { clipsAtTime } from './visible.js';

/** Curve names of the document format, with the label each is offered under. */
export const FADE_CURVE_LABELS = {
  linear: 'Linear',
  smooth: 'Smooth',
  fast: 'Fast',
  slow: 'Slow',
  sharp: 'Sharp',
};

/** @typedef {{ clipId: string, edge: 'in'|'out', curve: string }} FadeUnder */

/**
 * The fades a point of a lane lies in: a clip's fade-in or fade-out, or —
 * in a cross-fade — the outgoing clip's fade-out and the incoming clip's
 * fade-in. Pure.
 * @param {import('#utils/edl/types.js').Edl} doc
 * @param {{ trackId?: string, time: number }} hit
 * @returns {FadeUnder[]}
 */
export function fadesAt(doc, hit) {
  const track = doc.tracks.find((each) => each.trackId === hit.trackId);
  /** @type {FadeUnder[]} */
  const out = [];
  for (const { clip } of track ? clipsAtTime(track.clips, hit.time) : []) {
    const any = /** @type {any} */ (clip);
    if (clip.timelineEnd - hit.time <= clip.fadeOut) {
      out.push({ clipId: clip.clipId, edge: 'out', curve: any.fadeOutCurve || 'linear' });
    }
    if (hit.time - clip.timelineStart < clip.fadeIn) {
      out.push({ clipId: clip.clipId, edge: 'in', curve: any.fadeInCurve || 'linear' });
    }
  }
  return out;
}

/**
 * Give a fade a curve. One undo step.
 * @param {string} clipId
 * @param {'in'|'out'} edge
 * @param {string} curve - A key of `FADE_CURVE_LABELS`
 * @returns {boolean} false when nothing changed
 */
export function setFadeCurve(clipId, edge, curve) {
  const field = edge === 'in' ? 'fadeInCurve' : 'fadeOutCurve';
  return edit((doc) => updateClip(doc, clipId, { [field]: curve }));
}

/**
 * Menu items for the fades under a point: every curve, the current one
 * checked.
 * @param {import('#utils/edl/types.js').Edl} doc
 * @param {{ trackId?: string, time: number }} hit
 * @returns {import('./menuModel.js').MenuItem[]} Empty when the point is not in a fade
 */
export function fadeMenu(doc, hit) {
  return fadesAt(doc, hit).flatMap(({ clipId, edge, curve }) => [
    ...Object.entries(FADE_CURVE_LABELS).map(([name, label]) => ({
      label: `Fade ${edge}: ${label}`,
      checked: name === curve,
      run: () => setFadeCurve(clipId, edge, name),
    })),
    { separator: true },
  ]);
}
