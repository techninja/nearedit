/**
 * Scrolling and zooming the timeline view: the one place that knows how
 * far the view may scroll, used by the wheel, the scrollbars, panning,
 * edge auto-scroll, playhead follow and the zoom commands.
 * @module utils/timeline/scroll
 */

import { timelineDuration } from '#utils/edl/query.js';
import { getDoc } from '#utils/editor/session.js';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  PX_PER_SECOND,
  getView,
  setView,
  setZoom,
} from '#utils/editor/view.js';
import { LANE_GAP, RULER_H } from './layout.js';
import { getStageSize } from './metrics.js';
import { clampScroll, contentWidth, fitZoom, followScroll, timeToX } from './viewport.js';

/**
 * The viewport for the current view state and stage size.
 * @param {Partial<import('#store/ViewState.js').ViewStateShape>} [view] - Defaults to the store
 * @returns {import('./viewport.js').Viewport}
 */
export function currentViewport(view = getView()) {
  const { width, height } = getStageSize();
  const { zoom = 1, scrollX = 0, scrollY = 0 } = view;
  return { pps: PX_PER_SECOND * zoom, scrollX, scrollY, width, height };
}

/**
 * How large the scrollable content is, for scrollbars and clamping.
 * @param {number} [zoom] - Defaults to the current zoom
 * @returns {{ width: number, height: number, viewWidth: number, viewHeight: number }}
 */
export function scrollExtent(zoom = getView().zoom) {
  const size = getStageSize();
  const doc = getDoc();
  const lanes = doc.tracks.length * (size.laneHeight + LANE_GAP);
  return {
    width: contentWidth(timelineDuration(doc.tracks), PX_PER_SECOND * zoom, size.width),
    height: lanes + Math.round(size.laneHeight / 2),
    viewWidth: size.width,
    viewHeight: Math.max(0, size.height - RULER_H),
  };
}

/**
 * Scroll to a position, kept inside the content.
 * @param {{ x?: number, y?: number }} to - Omitted axes stay where they are
 */
export function scrollTo(to) {
  const view = getView();
  const extent = scrollExtent();
  const scrollX = clampScroll(to.x ?? view.scrollX, extent.width, extent.viewWidth);
  const scrollY = clampScroll(to.y ?? view.scrollY, extent.height, extent.viewHeight);
  if (scrollX !== view.scrollX || scrollY !== view.scrollY) setView({ scrollX, scrollY });
}

/**
 * Scroll by a distance.
 * @param {number} dx - Pixels
 * @param {number} dy - Pixels
 */
export function scrollBy(dx, dy) {
  const view = getView();
  scrollTo({ x: view.scrollX + dx, y: view.scrollY + dy });
}

/**
 * Bring a time into view, a page at a time (see `followScroll`).
 * @param {number} time - Seconds
 */
export function revealTime(time) {
  const vp = currentViewport();
  if (!(vp.width > 0)) return;
  const next = followScroll(vp, time);
  if (next !== null) setView({ scrollX: next });
}

/**
 * Multiply the zoom, keeping the playhead in place when it is on screen
 * and the middle of the view otherwise.
 * @param {number} factor
 */
export function zoomBy(factor) {
  const view = getView();
  const vp = currentViewport(view);
  const playheadX = timeToX(vp, view.playheadPosition);
  const onScreen = playheadX >= 0 && playheadX <= vp.width;
  setZoom(view.zoom * factor, { anchorX: onScreen ? playheadX : vp.width / 2 });
}

/** Show the whole timeline. */
export function zoomToFit() {
  const { width } = getStageSize();
  const duration = timelineDuration(getDoc().tracks);
  setView({ zoom: fitZoom(duration, width, PX_PER_SECOND, [MIN_ZOOM, MAX_ZOOM]), scrollX: 0 });
}
