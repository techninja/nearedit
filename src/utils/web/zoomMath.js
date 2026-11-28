/**
 * The geometry of zooming a recording in on a rectangle of the page, in the
 * compositor's terms (EDL.md § transform, `geometry.js` `placeSource`): a
 * source fitted `cover` into the output frame is drawn `fit × scale` output
 * pixels per source pixel, centred, then moved by `x`, `y`. So a point of
 * the viewport at `(px, py)` CSS pixels lands at
 *
 *   X = W/2 + x + (px − vw/2) · fit · scale
 *   Y = H/2 + y + (py − vh/2) · fit · scale
 *
 * with `fit = max(W / vw, H / vh)` (`min` for a clip fitted `contain`).
 * Isomorphic and pure.
 * @module utils/web/zoomMath
 */

/**
 * @typedef {Object} ZoomView
 * @property {number} vw - Viewport width, CSS pixels
 * @property {number} vh
 * @property {number} W - Output frame width, pixels
 * @property {number} H
 * @property {number} fit - Output pixels per CSS pixel at scale 1
 */

/**
 * What the transform is set to: `scale` for both axes, offsets in output pixels.
 * @typedef {{ scale: number, x: number, y: number }} ZoomState
 */

/** The closest a step's own `zoom` may go. */
const MAX_OWN_ZOOM = 8;

const positive = (value) => Number.isFinite(value) && value > 0;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * How a recording sits in an output frame.
 * @param {{ viewport?: { width: number, height: number }, width?: number,
 *   height?: number, scale?: number }} track
 * @param {{ width: number, height: number }} frame
 * @param {string} [fit] - The clip's `transform.fit`: `cover` unless `contain`
 * @returns {ZoomView|null} null when a size is missing
 */
export function zoomView(track, frame, fit) {
  const density = positive(track?.scale) ? track.scale : 1;
  const vw = positive(track?.viewport?.width) ? track.viewport.width : track?.width / density;
  const vh = positive(track?.viewport?.height) ? track.viewport.height : track?.height / density;
  const W = frame?.width;
  const H = frame?.height;
  if (![vw, vh, W, H].every(positive)) return null;
  const ratios = [W / vw, H / vh];
  return { vw, vh, W, H, fit: fit === 'contain' ? Math.min(...ratios) : Math.max(...ratios) };
}

/**
 * The transform that brings a rectangle of the page to the middle of the
 * frame. The scale is the largest at which the rectangle, with `margin`
 * times its size added on every side, fills no more than `fill` of the
 * frame in either direction — at most `maxZoom`, at least 1 — unless `own`
 * sets it. The offsets centre the rectangle, but never so far that an edge
 * of the picture would come into the frame.
 * @param {{ x: number, y: number, width: number, height: number }} rect -
 *   Viewport CSS pixels
 * @param {number|undefined} own - A zoom that overrides the fit when above 0
 * @param {ZoomView} view
 * @param {{ margin?: number, fill?: number, maxZoom?: number }} [options]
 * @returns {ZoomState|null} null for a rectangle without usable numbers.
 *   A target too large to zoom in on is not scaled; it is still brought
 *   towards the middle where the picture is larger than the frame (a wide
 *   page in a tall frame)
 */
export function zoomState(rect, own, view, options = {}) {
  const numbers = [rect?.x, rect?.y, rect?.width, rect?.height];
  if (!numbers.every(Number.isFinite) || rect.width < 0 || rect.height < 0) return null;
  const margin = Number.isFinite(options.margin) ? Math.max(0, options.margin) : 0.35;
  const fill = positive(options.fill) ? Math.min(1, options.fill) : 0.6;
  const maxZoom = positive(options.maxZoom) ? Math.max(1, options.maxZoom) : 2.2;
  const { vw, vh, W, H, fit } = view;
  const paddedW = rect.width * (1 + 2 * margin) * fit;
  const paddedH = rect.height * (1 + 2 * margin) * fit;
  const fitted = Math.min((fill * W) / paddedW, (fill * H) / paddedH, maxZoom);
  const wanted = positive(own) ? Math.min(own, MAX_OWN_ZOOM) : fitted;
  const scale = Math.round(Math.max(1, wanted) * 1e4) / 1e4;
  const roomX = Math.max(0, (vw * fit * scale - W) / 2);
  const roomY = Math.max(0, (vh * fit * scale - H) / 2);
  const x = clamp(-(rect.x + rect.width / 2 - vw / 2) * fit * scale, -roomX, roomX);
  const y = clamp(-(rect.y + rect.height / 2 - vh / 2) * fit * scale, -roomY, roomY);
  // Hundredths of a pixel, rounded towards the centre so the clamp still holds.
  return { scale, x: Math.trunc(x * 100) / 100 + 0, y: Math.trunc(y * 100) / 100 + 0 };
}

/**
 * Where a rectangle of the page lands in the frame under a transform — the
 * inverse view of `zoomState`, for previews and tests.
 * @param {{ x: number, y: number, width: number, height: number }} rect
 * @param {ZoomState} state
 * @param {ZoomView} view
 * @returns {{ x: number, y: number, width: number, height: number }} Output pixels
 */
export function placeRect(rect, state, view) {
  const k = view.fit * state.scale;
  return {
    x: view.W / 2 + state.x + (rect.x - view.vw / 2) * k,
    y: view.H / 2 + state.y + (rect.y - view.vh / 2) * k,
    width: rect.width * k,
    height: rect.height * k,
  };
}
