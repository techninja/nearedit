/**
 * Hit-testing: what is under a point of the timeline canvas — the ruler
 * (loop band, a marker, a region), a lane, a clip and which part of that
 * clip (body, a trim edge, a fade handle, a keyframe mark). Pure: geometry
 * in, description out.
 * @module utils/timeline/hitTest
 */

import { KEY_BAND, keyMarkAt } from './clipMarks.js';
import { regionAt } from './hitRuler.js';
import { CLIP_INSET, LOOP_BAND_H, RULER_H, laneAt, laneY } from './layout.js';
import { timeToX, xToTime } from './viewport.js';
import { clipsAtTime, edgeOverlaps } from './visible.js';

/** @typedef {'body'|'trim-start'|'trim-end'|'fade-in'|'fade-out'|'keyframe'} ClipPart */

/**
 * @typedef {Object} Geometry
 * @property {import('./viewport.js').Viewport} vp
 * @property {import('./layout.js').Lane[]} lanes
 * @property {import('#utils/edl/types.js').Edl} doc
 * @property {boolean} [coarse] - Finger-sized hit zones
 */

/**
 * @typedef {Object} Hit
 * @property {'ruler'|'lane'|'none'} zone
 * @property {number} time - Timeline seconds under the point
 * @property {'loop'|'time'} [band] - Ruler only
 * @property {string} [markerId] - Ruler only
 * @property {string} [regionId] - Ruler only: the region under the point
 * @property {'start'|'end'|'body'} [regionPart] - With `regionId`
 * @property {string} [trackId] - Lane only
 * @property {boolean} [locked] - Lane only: the track is locked
 * @property {string} [clipId] - Lane only: the clip under the point
 * @property {ClipPart} [part] - With `clipId`
 * @property {number} [keyTime] - With part `keyframe`: timeline time of the keyframe mark
 */

/**
 * Hit zone sizes in CSS pixels.
 * @param {boolean} [coarse]
 * @returns {{ edge: number, handle: number, handleBand: number, minFadeWidth: number, marker: number }}
 */
export function hitSizes(coarse) {
  return coarse
    ? { edge: 16, handle: 14, handleBand: 20, minFadeWidth: 64, marker: 14 }
    : { edge: 7, handle: 7, handleBand: 12, minFadeWidth: 36, marker: 6 };
}

/**
 * Which part of a clip a point touches. Edge zones never take more than a
 * quarter of the clip each, so even a sliver keeps a body to grab; fade
 * handles only exist on clips wide enough to tell them from the edges, and
 * never on an edge that is cross-fading (its fade is the overlap).
 * @param {number} x - Canvas x
 * @param {number} fromTop - Pixels below the clip's top edge
 * @param {{ x0: number, x1: number }} rect - The clip's horizontal extent
 * @param {{ fadeIn: number, fadeOut: number }} fades - In pixels
 * @param {{ in: number, out: number }} overlaps - Cross-fade lengths (0 = free)
 * @param {boolean} [coarse]
 * @returns {ClipPart}
 */
export function clipPartAt(x, fromTop, rect, fades, overlaps, coarse) {
  const size = hitSizes(coarse);
  const width = rect.x1 - rect.x0;
  if (width >= size.minFadeWidth && fromTop <= size.handleBand) {
    const nearIn = Math.abs(x - (rect.x0 + fades.fadeIn)) <= size.handle;
    const nearOut = Math.abs(x - (rect.x1 - fades.fadeOut)) <= size.handle;
    if (nearIn && !(overlaps.in > 0) && (!nearOut || x - rect.x0 < rect.x1 - x)) return 'fade-in';
    if (nearOut && !(overlaps.out > 0)) return 'fade-out';
  }
  const edge = Math.min(size.edge, width / 4);
  if (x - rect.x0 < edge) return 'trim-start';
  if (rect.x1 - x <= edge) return 'trim-end';
  return 'body';
}

/**
 * @param {Geometry} geo
 * @param {number} x
 * @returns {string} Id of the marker whose flag is under x, or ''
 */
function markerAt(geo, x) {
  const reach = hitSizes(geo.coarse).marker;
  let best = '';
  let distance = reach;
  for (const marker of geo.doc.markers || []) {
    const gap = Math.abs(timeToX(geo.vp, marker.time) - x);
    if (gap <= distance) {
      distance = gap;
      best = marker.markerId;
    }
  }
  return best;
}

/**
 * Describe what is under a canvas point.
 * @param {Geometry} geo
 * @param {number} x - Canvas x in CSS pixels
 * @param {number} y - Canvas y in CSS pixels
 * @returns {Hit}
 */
export function hitTest(geo, x, y) {
  const { vp, lanes, doc } = geo;
  const time = xToTime(vp, x);
  if (y < RULER_H) {
    if (y < LOOP_BAND_H) return { zone: 'ruler', time, band: 'loop', markerId: '' };
    const markerId = markerAt(geo, x);
    const region = markerId ? null : regionAt(geo, x, y, hitSizes(geo.coarse).marker);
    return { zone: 'ruler', time, band: 'time', markerId, ...region };
  }
  const lane = laneAt(lanes, y, vp.scrollY);
  const track = lane && doc.tracks[lane.index];
  if (!track) return { zone: 'none', time };
  /** @type {Hit} */
  const hit = { zone: 'lane', time, trackId: track.trackId, locked: !!track.locked };
  const fromTop = y - laneY(lane, vp.scrollY) - CLIP_INSET;
  if (fromTop < 0 || fromTop > lane.height - 2 * CLIP_INSET) return hit;
  // During a cross-fade two clips are under the point; an edge of either
  // wins over a body, and the later clip (drawn on top) wins otherwise.
  let found = null;
  for (const { clip, index } of clipsAtTime(track.clips, xToTime(vp, x))) {
    const rect = { x0: timeToX(vp, clip.timelineStart), x1: timeToX(vp, clip.timelineEnd) };
    const fades = { fadeIn: clip.fadeIn * vp.pps, fadeOut: clip.fadeOut * vp.pps };
    const overlaps = edgeOverlaps(track.clips, index);
    const part = clipPartAt(x, fromTop, rect, fades, overlaps, geo.coarse);
    const low = lane.height - 2 * CLIP_INSET - fromTop <= KEY_BAND;
    const keyTime = low ? keyMarkAt(clip, time, vp.pps, hitSizes(geo.coarse).handle) : null;
    if (keyTime !== null) return { ...hit, clipId: clip.clipId, part: 'keyframe', keyTime };
    if (!found || part !== 'body' || found.part === 'body') found = { clipId: clip.clipId, part };
  }
  return found ? { ...hit, ...found } : hit;
}
