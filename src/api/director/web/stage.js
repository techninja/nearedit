/**
 * Where the recorded page sits in the frame. `full`: it fills the frame.
 * `window`: it is a window, slightly inset, with rounded corners and a soft
 * shadow, over a background — the page keeps its own shape, whatever the
 * frame's. The window never moves: zooming scales the page inside it.
 * Reference: docs/app-spec/DIRECTOR-WEB.md § Looks.
 * @module api/director/web/stage
 */

/** Share of the frame's shorter side kept free around the window. */
export const INSET = 0.055;
/** Corner radius of the window, as a share of the frame's shorter side. */
export const RADIUS = 0.02;
/** The shadow under the window: offset, blur (a standard deviation) and strength. */
export const SHADOW = Object.freeze({ y: 0.016, blur: 0.026, opacity: 0.5 });

/**
 * @typedef {Object} Stage
 * @property {'window'|'full'} look
 * @property {{ width: number, height: number }} frame - Output pixels
 * @property {{ x: number, y: number, width: number, height: number }} window - Where
 *   the page shows, output pixels; the whole frame for `full`
 * @property {number} scale - The page clip's `scaleX` / `scaleY` at rest
 * @property {number} short - The frame's shorter side
 */

/**
 * @param {string} look - `window`, anything else is `full`
 * @param {{ width: number, height: number }} format - The frame
 * @param {{ width: number, height: number }} viewport - The recorded page, CSS pixels
 * @returns {Stage}
 */
export function stageFor(look, format, viewport) {
  const frame = { width: format.width, height: format.height };
  const short = Math.min(frame.width, frame.height);
  if (look !== 'window')
    return { look: 'full', frame, window: { x: 0, y: 0, ...frame }, scale: 1, short };
  const room = { width: frame.width - 2 * INSET * short, height: frame.height - 2 * INSET * short };
  const shape = viewport.width / viewport.height;
  const wide = room.width / room.height < shape;
  const even = (/** @type {number} */ side) => Math.round(side / 2) * 2;
  const width = even(wide ? room.width : room.height * shape);
  const height = even(wide ? room.width / shape : room.height);
  // The clip is fitted `cover`: at scale 1 the page would fill the frame.
  const cover = Math.max(frame.width / viewport.width, frame.height / viewport.height);
  return {
    look: 'window',
    frame,
    window: { x: (frame.width - width) / 2, y: (frame.height - height) / 2, width, height },
    scale: Math.round((width / (viewport.width * cover)) * 1e5) / 1e5,
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
  return [
    {
      effectId: 'window',
      type: 'mask',
      enabled: true,
      params: {
        shape: 'rectangle',
        center: { x: 0.5, y: 0.5 },
        width: win.width / frame.width,
        height: win.height / frame.height,
        radius: Math.round(RADIUS * short),
        feather: 1,
      },
    },
    {
      effectId: 'shadow',
      type: 'dropShadow',
      enabled: true,
      params: {
        x: 0,
        y: Math.round(SHADOW.y * short),
        blur: Math.round(SHADOW.blur * short),
        color: shade,
        opacity: SHADOW.opacity,
      },
    },
  ];
}
