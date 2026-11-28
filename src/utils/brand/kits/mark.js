/**
 * The logo of a built-in kit, as layers. A kit that has a logo file shows
 * it; until then a mark is drawn — a shape in the brand colour holding the
 * kit's `logo.initials`, or a simple figure when it has none. The choice is
 * made by `when` / `unless` on the logo tokens, so it is settled when an
 * element is resolved. Isomorphic and pure.
 * @module utils/brand/kits/mark
 */

import { F } from './parts.js';

/**
 * @typedef {Object} MarkSpec
 * @property {string} [id] - Prefix of the layer ids (`mark`)
 * @property {number} size - Height of the mark, units
 * @property {Record<string, any>} place - Where it goes: `{ in }`, or `{ at, x, y }`…
 * @property {string} base - Colour of the drawn shape
 * @property {string} ink - Colour of what is drawn on it
 * @property {string} [shape] - `rectangle` (default) or `ellipse`
 * @property {number} [radius] - Corner radius of a rectangle, units
 * @property {number} [rotate] - Degrees
 * @property {string} [stroke] - Colour of an outline around the drawn shape
 * @property {number} [strokeWidth] - Its thickness, units
 * @property {'ring'|'dot'|'bar'|'star'} [figure] - What is drawn without initials
 * @property {string} [token] - The logo token to show when it is set (`{logo.mark}`)
 * @property {any} [enter]
 * @property {any} [exit]
 */

/** The figures a drawn mark can hold, as fractions of its size. */
const FIGURES = {
  ring: (/** @type {number} */ s, /** @type {string} */ ink) => ({
    ...{ shape: 'ellipse', w: s * 0.48, h: s * 0.48, fill: '', stroke: ink },
    strokeWidth: s * 0.1,
  }),
  dot: (/** @type {number} */ s, /** @type {string} */ ink) => ({
    ...{ shape: 'ellipse', w: s * 0.36, h: s * 0.36, fill: ink },
  }),
  bar: (/** @type {number} */ s, /** @type {string} */ ink) => ({
    ...{ shape: 'rectangle', w: s * 0.16, h: s * 0.62, fill: ink, rotate: 24 },
  }),
  star: (/** @type {number} */ s, /** @type {string} */ ink) => ({
    ...{ shape: 'star', w: s * 0.62, h: s * 0.62, fill: ink, points: 5, inner: 0.48 },
  }),
};

/**
 * The layers of a kit's logo.
 * @param {MarkSpec} spec
 * @returns {Record<string, any>[]} Back to front
 */
export function mark(spec) {
  const { id = 'mark', size, place, base, ink, token = '{logo.mark}' } = spec;
  const motion = {
    ...(spec.enter && { enter: spec.enter }),
    ...(spec.exit && { exit: spec.exit }),
  };
  const on = { inside: `${id}-base`, at: 'center', unless: token, ...motion };
  return [
    { id, type: 'image', src: token, when: token, h: size, ...place, ...motion },
    {
      ...{ id: `${id}-base`, type: 'shape', unless: token, w: size, h: size, fill: base },
      ...{ shape: spec.shape || 'rectangle', radius: spec.radius ?? 0, rotate: spec.rotate ?? 0 },
      ...(spec.stroke && { stroke: spec.stroke, strokeWidth: spec.strokeWidth ?? 0.4 }),
      ...place,
      ...motion,
    },
    {
      ...{ id: `${id}-figure`, type: 'shape', ...on, unless: `${token}{logo.initials}` },
      ...FIGURES[spec.figure || 'ring'](size, ink),
    },
    {
      ...{ id: `${id}-initials`, type: 'text', ...on, when: '{logo.initials}' },
      ...{ text: '{logo.initials}', font: F.heading, size: size * 0.4, color: ink, lines: 1 },
      ...{ lineHeight: 1, maxWidth: size * 0.86 },
    },
  ];
}
