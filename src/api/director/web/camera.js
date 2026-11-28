/**
 * The camera of a site demo: zoom keyframes for the page clip, made by the
 * web clip library from the recording's track (WEBCLIP.md § Zoom) and
 * fitted to where the page sits — in the `window` look the page zooms
 * inside its window, which stays put. A field that is typed into is zoomed
 * on where the words appear, not on its whole width.
 * Reference: docs/app-spec/DIRECTOR-WEB.md § Zoom.
 * @module api/director/web/camera
 */

import { valueAt } from '#utils/edl/animate.js';
import { ZOOM_PATHS, placeRect, zoomKeyframes, zoomState, zoomView } from '#utils/web/index.js';

/** @typedef {import('./stage.js').Stage} Stage */
/** @typedef {import('#utils/web/types.js').Track} Track */

/** How close the camera goes, and how it lets go (options of `zoomKeyframes`). */
export const CAMERA = Object.freeze({
  margin: 0.3,
  fill: 0.62,
  maxZoom: 2,
  release: 0.7,
  join: 1.5,
});
/** The part of a field the camera frames while it is typed into: at most this many heights wide. */
const TYPED_WIDTHS = 6.5;
/**
 * "Zoom in on …" goes closer than a click does — and when the thing is too
 * big for that, it is framed edge to edge, so the camera still moves.
 */
const FOCUS = Object.freeze({ margin: 0.15, fill: 0.8, maxZoom: CAMERA.maxZoom });
const EDGE_TO_EDGE = Object.freeze({ margin: 0.02, fill: 1, maxZoom: CAMERA.maxZoom });
const WORTH_IT = 1.1;

/**
 * The track as the camera reads it.
 * @param {Track} track
 * @param {Stage} stage
 * @returns {Track} With the rectangle of every `type` step narrowed to its
 *   start, and every `focus` step given the zoom that frames its target
 */
export function cameraTrack(track, stage) {
  const view = zoomView(track, stage.window);
  const steps = track.steps.map((step) => {
    if (!step.rect || step.missing) return step;
    if (step.do === 'type') {
      const width = Math.min(step.rect.width, Math.max(300, step.rect.height * TYPED_WIDTHS));
      return { ...step, rect: { ...step.rect, width } };
    }
    if (step.do !== 'focus' || step.zoom || !view) return step;
    const near = zoomState(step.rect, 0, view, FOCUS).scale;
    const zoom = near >= WORTH_IT ? near : zoomState(step.rect, 0, view, EDGE_TO_EDGE).scale;
    return zoom > 1 ? { ...step, zoom } : step;
  });
  return { ...track, steps };
}

/**
 * Zoom keyframes for the page clip.
 * @param {Track} track - Of the recording
 * @param {Stage} stage
 * @param {{ clicks: boolean, recipe: object }} options - `clicks`: zoom on
 *   clicks and typing too, not only on `focus` steps
 * @returns {Record<string, { t: number, v: number, ease: string }[]>} By
 *   keyframe path; empty when the camera never moves
 */
export function cameraKeys(track, stage, { clicks, recipe }) {
  const seen = cameraTrack(track, stage);
  const keys = zoomKeyframes(seen, stage.window, { ...CAMERA, clicks, recipe });
  const moves = Object.values(keys).some((list) => list.some((key) => key.v !== list[0].v));
  if (!moves) return {};
  /** @type {Record<string, any[]>} */
  const fitted = {};
  for (const [path, field] of Object.entries(ZOOM_PATHS)) {
    // Offsets are from the window's centre, the scale starts from the window's own.
    const size = field === 'scale' ? stage.scale : 1;
    const from = field === 'scale' ? 0 : stage.offset[field];
    const fit = (/** @type {number} */ value) => Math.round((value * size + from) * 1e4) / 1e4;
    fitted[path] = keys[path].map((key) => ({ ...key, v: fit(key.v) }));
  }
  return fitted;
}

/**
 * Where a rectangle of the page shows in the frame at a moment of the recording.
 * @param {{ x: number, y: number, width: number, height: number }} rect - Viewport CSS pixels
 * @param {Record<string, any[]>} keys - From `cameraKeys`
 * @param {Track} track
 * @param {Stage} stage
 * @param {number} time - Seconds of the recording
 * @returns {{ x: number, y: number, width: number, height: number }|null} Output
 *   pixels, clipped to the window; null when none of it shows
 */
export function shownRect(rect, keys, track, stage, time) {
  const view = zoomView(track, stage.window);
  if (!view) return null;
  const at = (/** @type {string} */ path, /** @type {number} */ rest) =>
    Number(valueAt(keys[path], time) ?? rest);
  const state = {
    scale: at('transform.scaleX', stage.scale) / stage.scale,
    x: at('transform.x', stage.offset.x) - stage.offset.x,
    y: at('transform.y', stage.offset.y) - stage.offset.y,
  };
  const placed = placeRect(rect, state, view);
  const win = stage.window;
  const left = Math.max(0, placed.x);
  const top = Math.max(0, placed.y);
  const right = Math.min(win.width, placed.x + placed.width);
  const bottom = Math.min(win.height, placed.y + placed.height);
  if (right <= left || bottom <= top) return null;
  return { x: win.x + left, y: win.y + top, width: right - left, height: bottom - top };
}
