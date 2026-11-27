/**
 * Clip layer: for every lane on screen, the clips inside the visible time
 * range (found by binary search), then the cross-fades between
 * neighbours, then the dimming of muted, un-soloed and locked tracks.
 * @module utils/timeline/draw/clips
 */

import { CLIP_INSET, RULER_H, laneY } from '#utils/timeline/layout.js';
import { timeToX, visibleTimes } from '#utils/timeline/viewport.js';
import { visibleSlice } from '#utils/timeline/visible.js';
import { clipColor, drawClip } from './clipBody.js';
import { drawCrossfade } from './fades.js';
import { dimLane } from './lanes.js';

/** @typedef {import('./scene.js').Scene} Scene */

/**
 * How strongly a track's clips are washed out: silent or hidden tracks
 * most, locked ones a little.
 * @param {import('#utils/edl/types.js').Edl} doc
 * @param {import('#utils/edl/types.js').Track} track
 * @returns {number} 0 = not at all
 */
export function trackDim(doc, track) {
  const sameType = doc.tracks.filter((other) => other.type === track.type);
  const silenced = track.muted || (sameType.some((other) => other.solo) && !track.solo);
  if (silenced) return 0.6;
  return track.locked ? 0.3 : 0;
}

/**
 * Draw the visible clips of every visible lane.
 * @param {Scene} scene
 */
export function drawClips(scene) {
  const { ctx, vp, lanes, doc } = scene;
  const { start, end } = visibleTimes(vp);
  for (const lane of lanes) {
    const top = laneY(lane, vp.scrollY);
    if (top > vp.height || top + lane.height < RULER_H) continue;
    const track = doc.tracks[lane.index];
    const { from, to } = visibleSlice(track.clips, start, end);
    if (from === to) continue;
    const box = { y: top + CLIP_INSET, height: lane.height - 2 * CLIP_INSET };
    for (let i = from; i < to; i++) drawClip(scene, track, i, box);
    for (let i = Math.max(1, from); i < to; i++) {
      const outgoing = track.clips[i - 1];
      const incoming = track.clips[i];
      if (outgoing.timelineEnd <= incoming.timelineStart) continue;
      const x0 = timeToX(vp, incoming.timelineStart);
      const x1 = timeToX(vp, Math.min(outgoing.timelineEnd, incoming.timelineEnd));
      drawCrossfade(
        ctx,
        x0,
        x1,
        box.y,
        box.height,
        clipColor(scene, outgoing, track),
        scene.palette,
      );
    }
    const dim = trackDim(doc, track);
    if (dim) dimLane(scene, lane, dim);
  }
}
