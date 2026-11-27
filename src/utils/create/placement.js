/**
 * Where a new generator goes. Something that fills the frame — a
 * background, a pattern — belongs behind the picture: on the back-most
 * video track when that is free in the clip's time, otherwise on a new
 * track under it. Shapes, particles and text belong in front: on the
 * front-most track when it is free, otherwise on a new track on top
 * (`insertGenerator` does that by itself). Pure and isomorphic.
 * @module utils/create/placement
 */

import { insertGenerator } from '#utils/edl/generator.js';
import { tracksOfType } from '#utils/edl/immutable.js';
import { newClipIds } from '#utils/edl/selection.js';
import { frameDuration, snap } from '#utils/edl/time.js';
import { addTrack } from '#utils/edl/trackOps.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/** Categories of generators that fill the frame and go behind everything. */
export const BACK_CATEGORIES = ['background', 'pattern'];

/** Seconds a new generator or title lasts. */
export const DEFAULT_DURATION = 5;

/**
 * @param {string} category - A generator's catalog category
 * @returns {'back'|'front'}
 */
export const layerFor = (category) => (BACK_CATEGORIES.includes(category) ? 'back' : 'front');

/**
 * The back-most video track for a clip in a time span, made when the one
 * there is locked or already has something in that span.
 * @param {Edl} edl
 * @param {number} start - Timeline seconds
 * @param {number} end
 * @returns {{ edl: Edl, trackId: string }}
 */
export function backTrack(edl, start, end) {
  const lane = tracksOfType(edl, 'video');
  const back = lane[lane.length - 1];
  const busy = (/** @type {any} */ clip) => clip.timelineStart < end && clip.timelineEnd > start;
  if (back && !back.locked && !back.clips.some(busy)) return { edl, trackId: back.trackId };
  const doc = addTrack(edl, 'video', { position: 'bottom' });
  const added = tracksOfType(doc, 'video');
  return { edl: doc, trackId: added[added.length - 1].trackId };
}

/**
 * Add a generator clip where its kind belongs.
 * @param {Edl} edl
 * @param {{ type: string, category?: string, label?: string,
 *   params?: Record<string, any>, seed?: number, blendMode?: string }} item - What
 *   to add (a catalog item, a preset)
 * @param {{ time?: number, duration?: number, trackId?: string, autoCrossfade?: boolean }} [opts] -
 *   `time`: the edit cursor. `trackId`: put it on this track instead (a
 *   drop on the timeline)
 * @returns {{ edl: Edl, clipId: string, trackId: string }} `clipId` is ''
 *   and the document unchanged when nothing could be added
 */
export function addGenerator(edl, item, opts = {}) {
  const start = Math.max(0, snap(edl, opts.time || 0));
  const wanted = opts.duration > 0 ? opts.duration : DEFAULT_DURATION;
  const end = start + Math.max(frameDuration(edl), snap(edl, wanted));
  let doc = edl;
  let { trackId } = opts;
  if (!trackId && layerFor(item.category) === 'back')
    ({ edl: doc, trackId } = backTrack(edl, start, end));
  const next = insertGenerator(
    doc,
    { type: item.type, params: item.params, seed: item.seed },
    {
      time: start,
      duration: end - start,
      trackId,
      label: item.label || item.type,
      autoCrossfade: opts.autoCrossfade,
      ...(item.blendMode && { clip: { blendMode: item.blendMode } }),
    },
  );
  const [clipId] = newClipIds(edl, next);
  if (!clipId) return { edl, clipId: '', trackId: '' };
  const track = next.tracks.find((t) => t.clips.some((clip) => clip.clipId === clipId));
  return { edl: next, clipId, trackId: track.trackId };
}
