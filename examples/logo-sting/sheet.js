/**
 * Small helpers for writing a timeline by hand: a drawing space that turns
 * the logo's units into output pixels, rectangles, keys, and tracks that
 * hold one clip each.
 * @module examples/logo-sting/sheet
 */

/**
 * @typedef {Object} Space - Logo units to output pixels
 * @property {number} unit - Pixels per logo unit
 * @property {(v: number) => number} x - A logo x as an offset from the frame's centre
 * @property {(v: number) => number} y - A logo y as an offset from the frame's centre
 * @property {(v: number) => number} len - A length
 */

/** @param {number} v @returns {number} Two decimals are a fiftieth of a pixel */
const tidy = (v) => Math.round(v * 100) / 100;

/**
 * A drawing space: `unit` pixels per logo unit, with the logo point
 * (`cx`, `cy`) at the centre of the frame.
 * @param {number} unit
 * @param {number} cx
 * @param {number} cy
 * @returns {Space}
 */
export function space(unit, cx, cy) {
  return {
    unit,
    x: (v) => tidy((v - cx) * unit),
    y: (v) => tidy((v - cy) * unit),
    len: (v) => tidy(v * unit),
  };
}

/**
 * A rectangle as a shape generator.
 * @param {Space} s
 * @param {{ x: number, y: number, w: number, h: number, radius?: number, fill: string }} box -
 *   Left, top, width and height in logo units
 * @returns {{ type: string, params: Record<string, any> }}
 */
export function rectangle(s, { x, y, w, h, radius = 0, fill }) {
  const params = { shape: 'rectangle', sizing: 'pixels', widthPx: s.len(w), heightPx: s.len(h) };
  if (radius) Object.assign(params, { radius: s.len(radius) });
  return {
    type: 'shape',
    params: { ...params, offsetX: s.x(x + w / 2), offsetY: s.y(y + h / 2), fill },
  };
}

/**
 * Keys of one animated property: `[seconds, value, ease?]` each.
 * @param {[number, number|string, string?][]} list
 * @returns {{ t: number, v: number|string, ease?: string }[]}
 */
export function keys(list) {
  return list.map(([t, v, ease]) => ({
    t: Math.round(t * 1000) / 1000,
    v: typeof v === 'number' ? tidy(v) : v,
    ...(ease ? { ease } : {}),
  }));
}

/**
 * A track holding one clip that lasts the whole piece.
 * @param {string} name
 * @param {number} duration - Seconds
 * @param {Record<string, any>} clip
 * @returns {Record<string, any>}
 */
export function layer(name, duration, clip) {
  return {
    type: 'video',
    name,
    clips: [{ label: name, timelineStart: 0, timelineEnd: duration, ...clip }],
  };
}
