/**
 * Where the recorded page sits in the frame. `full`: it fills the frame.
 * `window`: it is a window with rounded corners and a soft shadow over a
 * background, slightly inset — and, when the demo has captions, raised to
 * leave a band of the background under it where they are set, so a caption
 * never covers the page. The page keeps its own shape, whatever the
 * frame's. The window never moves: zooming scales the page inside it.
 * Reference: docs/app-spec/DIRECTOR-WEB.md § Looks.
 * @module api/director/web/stage
 */

/** Share of the frame's shorter side kept free around the window. */
export const INSET = 0.055;
/** The same above a window that has captions under it, and the band they get. */
const HEADROOM = 0.045;
const BAND = { wide: 0.135, narrow: 0.17 };
/** Corner radius of the window, as a share of the frame's shorter side. */
export const RADIUS = 0.02;
/** The shadow under the window: offset, blur (a standard deviation) and strength. */
export const SHADOW = Object.freeze({ y: 0.016, blur: 0.026, opacity: 0.5 });

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} Box - Output pixels
 * @typedef {Object} Stage
 * @property {'window'|'full'} look
 * @property {{ width: number, height: number }} frame - Output pixels
 * @property {Box} window - Where the page shows; the whole frame for `full`
 * @property {{ x: number, y: number }} offset - The window's centre from the frame's
 * @property {number} scale - The page clip's `scaleX` / `scaleY` at rest
 * @property {Box|null} band - The strip of background kept for captions, if any
 * @property {number} short - The frame's shorter side
 */

/**
 * @param {string} look - `window`, anything else is `full`
 * @param {{ width: number, height: number }} format - The frame
 * @param {{ width: number, height: number }} viewport - The recorded page, CSS pixels
 * @param {boolean} [captioned] - The demo has captions to make room for
 * @returns {Stage}
 */
export function stageFor(look, format, viewport, captioned = false) {
  const frame = { width: format.width, height: format.height };
  const short = Math.min(frame.width, frame.height);
  const none = { offset: { x: 0, y: 0 }, band: null, short };
  if (look !== 'window')
    return { look: 'full', frame, window: { x: 0, y: 0, ...frame }, scale: 1, ...none };
  const side = Math.round(INSET * short);
  const head = captioned ? Math.round(HEADROOM * short) : side;
  const strip = Math.round((frame.width > frame.height * 1.2 ? BAND.wide : BAND.narrow) * short);
  const foot = captioned ? strip : side;
  const room = { width: frame.width - 2 * side, height: frame.height - head - foot };
  const shape = viewport.width / viewport.height;
  const wide = room.width / room.height < shape;
  const even = (/** @type {number} */ length) => Math.round(length / 2) * 2;
  const width = even(wide ? room.width : room.height * shape);
  const height = even(wide ? room.width / shape : room.height);
  // A window narrower than its room is centred in it; under it comes the band.
  const window = {
    x: (frame.width - width) / 2,
    y: head + Math.round((room.height - height) / 2),
    ...{ width, height },
  };
  const below = window.y + height;
  // The clip is fitted `cover`: at scale 1 the page would fill the frame.
  const cover = Math.max(frame.width / viewport.width, frame.height / viewport.height);
  return {
    look: 'window',
    frame,
    window,
    offset: { x: 0, y: window.y + height / 2 - frame.height / 2 },
    // Rounded up, so the page always reaches the window's edge.
    scale: Math.ceil((width / (viewport.width * cover)) * 1e4) / 1e4,
    band: captioned ? { x: side, y: below, width: room.width, height: frame.height - below } : null,
    short,
  };
}

/**
 * The effects that make the page a window: a rounded mask the size of the
 * window, then a shadow in the colour of the ground's deepest tone.
 * @param {Stage} stage
 * @param {string} shade - `#rrggbb`
 * @returns {object[]} Nothing for the `full` look
 */
export function windowEffects(stage, shade) {
  if (stage.look !== 'window') return [];
  const { window: win, frame, short } = stage;
  const center = { x: 0.5, y: (win.y + win.height / 2) / frame.height };
  const size = { width: win.width / frame.width, height: win.height / frame.height };
  const shadow = { x: 0, y: Math.round(SHADOW.y * short), blur: Math.round(SHADOW.blur * short) };
  return [
    {
      effectId: 'window',
      type: 'mask',
      enabled: true,
      params: {
        shape: 'rectangle',
        center,
        ...size,
        radius: Math.round(RADIUS * short),
        feather: 1,
      },
    },
    {
      effectId: 'shadow',
      type: 'dropShadow',
      enabled: true,
      params: { ...shadow, color: shade, opacity: SHADOW.opacity },
    },
  ];
}
