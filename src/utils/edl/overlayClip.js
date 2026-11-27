/**
 * Placing a clip that has no footage — a title or a generator. Such clips
 * belong on the front-most video track; when that track is locked or
 * already has something in the clip's time span, a new video track is
 * created on top so the clip overlays the picture instead of replacing it.
 * Isomorphic and pure.
 * @module utils/edl/overlayClip
 */

import { intersects } from './clipMath.js';
import { tracksOfType } from './immutable.js';
import { addClips } from './placement.js';
import { finite, frameDuration, snap } from './time.js';
import { addTrack } from './trackOps.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */

/**
 * Timeline span and source window of a new overlay clip.
 * @param {Edl} edl
 * @param {number} [time] - Where it starts (default 0)
 * @param {number} [duration] - Seconds (default 5, at least one frame)
 * @returns {{ timelineStart: number, timelineEnd: number, sourceIn: number, sourceOut: number }}
 */
export function overlaySpan(edl, time, duration) {
  const start = Math.max(0, snap(edl, finite(time, 0)));
  const wanted = finite(duration, 0) > 0 ? duration : 5;
  const length = Math.max(frameDuration(edl), snap(edl, wanted));
  const timelineEnd = snap(edl, start + length);
  return { timelineStart: start, timelineEnd, sourceIn: 0, sourceOut: timelineEnd - start };
}

/**
 * Add an overlay clip. With an explicit, unlocked video `trackId` it goes
 * there under the normal overlap rules.
 * @param {Edl} edl
 * @param {Clip} clip
 * @param {{ trackId?: string, autoCrossfade?: boolean }} [opts]
 * @returns {Edl}
 */
export function addOverlay(edl, clip, opts = {}) {
  const lane = tracksOfType(edl, 'video');
  let doc = edl;
  let track = lane.find((t) => t.trackId === opts.trackId && !t.locked);
  if (!track) {
    const front = lane[0];
    const free = front && !front.locked && !front.clips.some((other) => intersects(other, clip));
    if (!free) doc = addTrack(edl, 'video', { position: 'top' });
    track = free ? front : doc.tracks[0];
  }
  return addClips(doc, [{ trackId: track.trackId, clip }], { autoCrossfade: opts.autoCrossfade });
}
