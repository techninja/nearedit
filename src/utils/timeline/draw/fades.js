/**
 * Fades on clips: the ramp of a deliberate fade-in or fade-out, the
 * crossing ramps of a cross-fade between two overlapping clips, and the
 * handles the fades are dragged by.
 * @module utils/timeline/draw/fades
 */

import { FADE_CURVES } from '#utils/edl/defaults.js';
import { fadeInLevel, fadeOutRemaining } from '#utils/edl/fadeCurves.js';

/** @typedef {import('#utils/timeline/palette.js').Palette} Palette */

/** Line segments a curved ramp is drawn with. */
const STEPS = 12;

/**
 * The line of a fade as points, from the clip edge inwards.
 * @param {'in'|'out'} edge
 * @param {number} x - The clip edge the fade starts from
 * @param {number} y - Clip top
 * @param {number} height - Clip height
 * @param {number} length - Fade length in pixels
 * @param {string} [curve='linear']
 * @returns {[number, number][]} From (edge, bottom) to (fade end, top)
 */
export function fadeLine(edge, x, y, height, length, curve = 'linear') {
  // The same curve the levels use: at distance p into the fade from its
  // clip edge, a fade-in has risen to, and a fade-out has left, this level.
  const level = edge === 'in' ? fadeInLevel : fadeOutRemaining;
  const curved = curve !== 'linear' && FADE_CURVES.includes(curve);
  const steps = curved ? STEPS : 1;
  const sign = edge === 'in' ? 1 : -1;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const p = i / steps;
    return [x + sign * p * length, y + height * (1 - level(curve, p))];
  });
}

/**
 * A fade ramp on one edge: the part of the clip that is "not there yet"
 * is washed with the lane colour and the ramp drawn as a line that shows
 * the fade's curve.
 * @param {CanvasRenderingContext2D} ctx
 * @param {'in'|'out'} edge
 * @param {number} x - The clip edge the fade starts from
 * @param {number} y - Clip top
 * @param {number} height - Clip height
 * @param {number} length - Fade length in pixels
 * @param {Palette} palette
 * @param {string} [curve='linear']
 */
export function drawFadeRamp(ctx, edge, x, y, height, length, palette, curve) {
  if (!(length > 0.5)) return;
  const line = fadeLine(edge, x, y, height, length, curve);
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (const [px, py] of line) ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fillStyle = palette.lane;
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = palette.clipText;
  ctx.lineWidth = 1;
  ctx.beginPath();
  line.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * A cross-fade: the outgoing clip's colour fills the half it still owns
 * and the two ramps cross over the overlap, each with its own curve.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 - Start of the overlap (the incoming clip's start)
 * @param {number} x1 - End of the overlap (the outgoing clip's end)
 * @param {number} y - Clip top
 * @param {number} height - Clip height
 * @param {string} outgoing - Colour of the outgoing clip
 * @param {Palette} palette
 * @param {{ in?: string, out?: string }} [curves] - Curve of the incoming
 *   clip's fade-in and of the outgoing clip's fade-out
 */
export function drawCrossfade(ctx, x0, x1, y, height, outgoing, palette, curves = {}) {
  if (!(x1 - x0 > 0.5)) return;
  const rising = fadeLine('in', x0, y, height, x1 - x0, curves.in);
  const falling = fadeLine('out', x1, y, height, x1 - x0, curves.out);
  ctx.fillStyle = outgoing;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  // Everything above the incoming clip's rising line still belongs to the outgoing one.
  for (const [px, py] of rising) ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = palette.lane;
  ctx.globalAlpha = 0.28;
  ctx.fillRect(x0, y, x1 - x0, height);
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = palette.clipText;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  for (const line of [rising, falling]) {
    line.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * The square a fade is dragged by, on the clip's top edge.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - Where the fade ends
 * @param {number} y - Clip top
 * @param {Palette} palette
 * @param {number} [size=7]
 */
export function drawFadeHandle(ctx, x, y, palette, size = 7) {
  const half = size / 2;
  ctx.fillStyle = palette.clipText;
  ctx.fillRect(x - half, y, size, size);
  ctx.strokeStyle = palette.selection;
  ctx.lineWidth = 1;
  ctx.strokeRect(x - half + 0.5, y + 0.5, size - 1, size - 1);
}
