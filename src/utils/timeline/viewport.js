/**
 * Viewport maths for the timeline: seconds ↔ pixels, scroll limits, zoom
 * steps and page-style following of the playhead. Pure — no DOM, no store.
 * @module utils/timeline/viewport
 */

/**
 * The visible window onto the timeline.
 * @typedef {Object} Viewport
 * @property {number} pps - Pixels per second at the current zoom
 * @property {number} scrollX - Pixels scrolled from time 0
 * @property {number} scrollY - Pixels scrolled from the first lane
 * @property {number} width - Canvas width, CSS pixels
 * @property {number} height - Canvas height, CSS pixels
 */

/** Empty room kept after the last clip, as a fraction of the view width. */
const TAIL = 0.6;
/** One toolbar / keyboard zoom step. */
export const ZOOM_STEP = 1.4;

/**
 * @param {Viewport} vp
 * @param {number} time - Timeline seconds
 * @returns {number} Canvas x in CSS pixels
 */
export const timeToX = (vp, time) => time * vp.pps - vp.scrollX;

/**
 * @param {Viewport} vp
 * @param {number} x - Canvas x in CSS pixels
 * @returns {number} Timeline seconds; negative left of time 0
 */
export const xToTimeRaw = (vp, x) => (x + vp.scrollX) / vp.pps;

/**
 * @param {Viewport} vp
 * @param {number} x - Canvas x in CSS pixels
 * @returns {number} Timeline seconds, never below 0
 */
export const xToTime = (vp, x) => Math.max(0, xToTimeRaw(vp, x));

/**
 * @param {Viewport} vp
 * @returns {{ start: number, end: number }} Visible time range in seconds
 */
export function visibleTimes(vp) {
  return { start: Math.max(0, xToTimeRaw(vp, 0)), end: xToTimeRaw(vp, vp.width) };
}

/**
 * Scrollable width: the timeline plus some empty room to drop clips into.
 * @param {number} duration - Timeline duration, seconds
 * @param {number} pps
 * @param {number} viewWidth
 * @returns {number} Pixels, at least one view wide
 */
export function contentWidth(duration, pps, viewWidth) {
  return Math.max(viewWidth, Math.ceil(duration * pps + viewWidth * TAIL));
}

/**
 * @param {number} scroll
 * @param {number} content - Content size in pixels
 * @param {number} view - View size in pixels
 * @returns {number} `scroll` kept inside 0..(content - view)
 */
export function clampScroll(scroll, content, view) {
  return Math.max(0, Math.min(scroll, Math.max(0, content - view)));
}

/**
 * The zoom at which the whole timeline fits the view with a little margin.
 * @param {number} duration - Seconds
 * @param {number} viewWidth - Pixels
 * @param {number} basePps - Pixels per second at zoom 1
 * @param {[number, number]} limits - [min zoom, max zoom]
 * @returns {number}
 */
export function fitZoom(duration, viewWidth, basePps, [min, max]) {
  if (!(duration > 0) || !(viewWidth > 0)) return 1;
  const zoom = (viewWidth * 0.94) / (duration * basePps);
  return Math.max(min, Math.min(max, zoom));
}

/**
 * Zoom factor for a wheel or trackpad-pinch movement.
 * @param {number} deltaY - Wheel delta in pixels (negative = zoom in)
 * @returns {number} Multiplier for the current zoom
 */
export function wheelZoomFactor(deltaY) {
  const capped = Math.max(-240, Math.min(240, deltaY));
  return Math.exp(-capped * 0.005);
}

/**
 * Page-style follow: when `time` has left the view, return the scroll that
 * puts it a little inside the left edge; otherwise null (do not scroll).
 * Scrolling a page at a time, not every frame, keeps playback smooth.
 * @param {Viewport} vp
 * @param {number} time - Seconds (the playhead)
 * @param {number} [lead=0.1] - Where the time lands, as a fraction of the width
 * @returns {number|null} New scrollX, or null when `time` is already visible
 */
export function followScroll(vp, time, lead = 0.1) {
  const x = timeToX(vp, time);
  if (x >= 0 && x <= vp.width - 1) return null;
  return Math.max(0, Math.round(time * vp.pps - vp.width * lead));
}

/**
 * Speed of edge auto-scroll while dragging near the left or right edge.
 * @param {number} x - Pointer x in CSS pixels
 * @param {number} width - Canvas width
 * @param {number} [margin=36] - Width of the active zone at each edge
 * @returns {number} Pixels per frame; negative = scroll left, 0 = none
 */
export function edgeScrollSpeed(x, width, margin = 36) {
  const max = 28;
  if (x < margin) return -Math.ceil(max * Math.min(1, (margin - x) / margin));
  if (x > width - margin) return Math.ceil(max * Math.min(1, (x - (width - margin)) / margin));
  return 0;
}
