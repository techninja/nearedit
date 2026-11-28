/**
 * Zoom on a web clip: ordinary transform keyframes made from the track of
 * its recording (`#utils/web/zoom.js`), written to the clip so they can be
 * moved, re-eased or deleted like any others. Isomorphic and pure.
 * @module utils/edl/webZoom
 */

import { ZOOM_PATHS, zoomKeyframes } from '#utils/web/zoom.js';
import { patchClip } from './clipPatch.js';
import { parseResolution } from './factory.js';
import { changeClip } from './immutable.js';

/** @typedef {import('./types.js').Edl} Edl */

/**
 * Write zoom keyframes for a web clip from the track of its recording:
 * `transform.scaleX`, `scaleY`, `x` and `y`, replacing whatever keys those
 * four paths had. The keys are in the recording's time, which is the
 * clip's source time, so they stay with the picture through trims and
 * splits. The frame is the document's `resolution`; the clip's own
 * `transform.fit` is honoured, and its recipe supplies a `focus` step's
 * own `zoom` when the track does not note it.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {import('#utils/web/types.js').Track} track - `GET /web/track`
 * @param {import('#utils/web/zoom.js').ZoomOptions} [options] - `clicks`,
 *   `margin`, `fill`, `maxZoom`, `release`, `join`, `ease`
 * @returns {Edl} Unchanged for a clip without a `web` block or on a locked
 *   track. A track with nothing to zoom on clears the four paths
 */
export function applyWebZoom(edl, clipId, track, options = {}) {
  return changeClip(edl, clipId, (clip, holder) => {
    if (!clip.web) return clip;
    const frame = parseResolution(edl.resolution);
    const settings = { fit: clip.transform.fit, recipe: clip.web.recipe, ...options };
    return patchClip(clip, holder, { keyframes: zoomKeyframes(track, frame, settings) });
  });
}

/**
 * Remove the zoom of a clip: every key on the four paths `applyWebZoom`
 * writes. The clip returns to its plain scale and position.
 * @param {Edl} edl
 * @param {string} clipId
 * @returns {Edl}
 */
export function clearWebZoom(edl, clipId) {
  const cleared = Object.fromEntries(Object.keys(ZOOM_PATHS).map((path) => [path, null]));
  return changeClip(edl, clipId, (clip, holder) => patchClip(clip, holder, { keyframes: cleared }));
}
