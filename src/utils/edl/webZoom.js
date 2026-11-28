/**
 * Zoom on a web clip: ordinary transform keyframes made from the track of
 * its recording (`#utils/web/zoom.js`), written to the clip so they can be
 * moved, re-eased or deleted like any others. Isomorphic and pure.
 * @module utils/edl/webZoom
 */

import { ZOOM_PATHS, zoomKeyframes } from '#utils/web/zoom.js';
import { zoomView } from '#utils/web/zoomMath.js';
import { patchClip } from './clipPatch.js';
import { parseResolution } from './factory.js';
import { changeClip } from './immutable.js';

/** @typedef {import('./types.js').Edl} Edl */

const round4 = (/** @type {number} */ value) => Math.round(value * 1e4) / 1e4;

/**
 * Where an inset clip rests: a clip scaled down evenly (a page shown as a
 * window on a background) is zoomed inside the box it occupies at rest, so
 * the window stays where it is.
 * @param {any} clip
 * @param {import('#utils/web/types.js').Track} track
 * @param {{ width: number, height: number }} frame
 * @returns {{ scale: number, x: number, y: number,
 *   window: { width: number, height: number } }|null} null for a clip that
 *   fills the frame (or is larger, or stretched)
 */
function restOf(clip, track, frame) {
  const { scaleX: scale, scaleY, x, y, fit } = clip.transform;
  const view = zoomView(track, frame, fit);
  if (!view || !(scale > 0 && scale < 1) || Math.abs(scale - scaleY) > 1e-6) return null;
  const window = { width: view.vw * view.fit * scale, height: view.vh * view.fit * scale };
  return { scale, x, y, window };
}

/**
 * Keys computed inside a window, as keys of the clip: the scale starts from
 * the clip's own, the offsets from where it sits.
 * @param {Record<string, any[]>} keys
 * @param {{ scale: number, x: number, y: number }} rest
 * @returns {Record<string, any[]>}
 */
function inWindow(keys, rest) {
  /** @type {Record<string, any[]>} */
  const out = {};
  for (const [path, field] of Object.entries(ZOOM_PATHS)) {
    // A scale is rounded up, so the picture never falls short of its window.
    const fit =
      field === 'scale'
        ? (/** @type {number} */ v) => Math.ceil(v * rest.scale * 1e4 - 1e-6) / 1e4
        : (/** @type {number} */ v) => round4(v + rest[field]);
    out[path] = keys[path].map((key) => ({ ...key, v: fit(key.v) }));
  }
  return out;
}

/**
 * Write zoom keyframes for a web clip from the track of its recording:
 * `transform.scaleX`, `scaleY`, `x` and `y`, replacing whatever keys those
 * four paths had. The keys are in the recording's time, which is the
 * clip's source time, so they stay with the picture through trims and
 * splits. The frame is the document's `resolution`; the clip's own
 * `transform.fit` is honoured, and its recipe supplies a `focus` step's
 * own `zoom` when the track does not note it. A clip that rests smaller
 * than the frame (scaled down evenly) is zoomed inside the box it rests
 * in: its keys start from, and return to, its own scale and position.
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
    const rest = restOf(clip, track, frame);
    const keys = zoomKeyframes(track, rest ? rest.window : frame, settings);
    return patchClip(clip, holder, { keyframes: rest ? inWindow(keys, rest) : keys });
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
