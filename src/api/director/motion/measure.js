/**
 * Text measurement for the motion builder: the width of a run of text in a
 * text style, taken on the server canvas with the bundled fonts — the same
 * faces, at the same widths, the compositor draws with in the preview and
 * in the render, so text fitted here fits there. Node only.
 * @module api/director/motion/measure
 */

import { fontString } from '#utils/compose/index.js';
import { createCanvas, registerFonts } from '../../compose/index.js';

/**
 * Width of a run of text set in a style, letter spacing included (as
 * `measureText` reports it, which is what `layoutText` expects).
 * @typedef {(style: { fontFamily?: string, fontSize?: number, weight?: number,
 *   italic?: boolean, bold?: boolean, letterSpacing?: number }, run: string) => number} Measure
 */

/** @type {Measure|null} */
let shared = null;

/**
 * The measurer of this process; fonts are registered on first use.
 * @returns {Measure}
 */
export function serverMeasure() {
  if (shared) return shared;
  registerFonts();
  const ctx = createCanvas(8, 8).getContext('2d');
  let current = '';
  shared = (style, run) => {
    const font = fontString(style, 1);
    const spacing = `${style.letterSpacing || 0}px`;
    if (`${font}|${spacing}` !== current) {
      // The settings the compositor measures with (text/draw.js `setFont`).
      /** @type {any} */ (ctx).textRendering = 'geometricPrecision';
      ctx.font = font;
      ctx.letterSpacing = spacing;
      current = `${font}|${spacing}`;
    }
    return ctx.measureText(run).width;
  };
  return shared;
}
