/**
 * NearEdit's logo for the compositor: the drawing of `src/logo/*.svg` as
 * numbers, and its playhead as shapes.
 * Units are the logo's own: the cap height is 100, letters stand on
 * y = 100 and reach up to y = 0.
 * @module examples/logo-sting/logo
 */

import { rectangle } from './sheet.js';

/** @typedef {import('./sheet.js').Space} Space */

/** The brand colours. */
export const INK = {
  blue: '#3b82f6',
  amber: '#f59e0b',
  green: '#10b981',
  red: '#ef4444',
  navy: '#0f172a',
  white: '#ffffff',
};

/** The wordmark: its width, and where the E's stem begins. */
export const WORDMARK = { width: 550, stem: 312 };

/** Inter's font size for a cap height of 100: 2048 units per em, capitals 1490 high. */
export const FONT_SIZE = (2048 / 1490) * 100;

/**
 * A line of text is centred on the middle of the font's em box. For Inter
 * the baseline lies this share of the font size below that middle.
 */
export const BASELINE = (1984 - 494) / (2 * (1984 + 494));

/**
 * The letters beside the E — Inter Bold, tracking −0.035 em, as in the
 * wordmark — each with the middle of its advance, where a one-letter
 * title is centred.
 * @type {[letter: string, x: number][]}
 */
export const LETTERS = [
  ['N', 43.32],
  ['e', 131.83],
  ['a', 209.2],
  ['r', 272.28],
  ['d', 430.89],
  ['i', 488.02],
  ['t', 527],
];

/**
 * The E's clips, top to bottom: the row, where it ends (from the left edge
 * of the playhead's stem), its colour and its name. Each is 22 high with
 * corners of 6 and starts under the middle of the stem, which is 14 wide.
 * @type {{ y: number, end: number, fill: string, name: string }[]}
 */
export const CLIPS = [
  { y: 0, end: 64, fill: INK.blue, name: 'blue' },
  { y: 39, end: 48, fill: INK.amber, name: 'amber' },
  { y: 78, end: 70, fill: INK.green, name: 'green' },
];
export const CLIP = { height: 22, radius: 6 };
export const STEM = 14;

/**
 * The playhead as four shapes, back to front — the shape generator has no
 * free outline, so its handle is put together: a stem with a rounded foot,
 * a triangle pointing down for the shoulders, a bar with rounded corners
 * for the top, and a square bar that fills the corners the round one
 * leaves where the shoulders begin.
 * @param {Space} s
 * @param {number} x - Left edge of the stem
 * @returns {{ name: string, generator: { type: string, params: Record<string, any> } }[]}
 */
export function playheadParts(s, x) {
  const fill = INK.red;
  const mid = x + STEM / 2;
  // A triangle whose corners lie on an ellipse: its top edge is 30 wide at
  // y = −12 and it would end in a point at y = 3, inside the stem.
  const shoulders = {
    ...{ shape: 'polygon', sides: 3, rotation: 180, sizing: 'pixels' },
    ...{ widthPx: s.len(30 / Math.cos(Math.PI / 6)), heightPx: s.len(20) },
    ...{ offsetX: s.x(mid), offsetY: s.y(-7), fill },
  };
  return [
    { name: 'stem', generator: rectangle(s, { x, y: -12, w: STEM, h: 121, radius: 7, fill }) },
    { name: 'shoulders', generator: { type: 'shape', params: shoulders } },
    { name: 'top', generator: rectangle(s, { x: x - 8, y: -19, w: 30, h: 7, radius: 2, fill }) },
    { name: 'corners', generator: rectangle(s, { x: x - 8, y: -15, w: 30, h: 3, fill }) },
  ];
}
