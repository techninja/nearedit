/**
 * Fades on clips: the ramp of a deliberate fade-in or fade-out, the
 * crossing ramps of a cross-fade between two overlapping clips, and the
 * handles the fades are dragged by.
 * @module utils/timeline/draw/fades
 */

/** @typedef {import('#utils/timeline/palette.js').Palette} Palette */

/**
 * A fade ramp on one edge: the part of the clip that is "not there yet"
 * is washed with the lane colour and the ramp drawn as a line.
 * @param {CanvasRenderingContext2D} ctx
 * @param {'in'|'out'} edge
 * @param {number} x - The clip edge the fade starts from
 * @param {number} y - Clip top
 * @param {number} height - Clip height
 * @param {number} length - Fade length in pixels
 * @param {Palette} palette
 */
export function drawFadeRamp(ctx, edge, x, y, height, length, palette) {
  if (!(length > 0.5)) return;
  const tip = edge === 'in' ? x + length : x - length;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(tip, y);
  ctx.lineTo(x, y + height);
  ctx.closePath();
  ctx.fillStyle = palette.lane;
  ctx.globalAlpha = 0.6;
  ctx.fill();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = palette.clipText;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + height);
  ctx.lineTo(tip, y);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * A cross-fade: the outgoing clip's colour fills the half it still owns
 * and the two ramps cross over the overlap.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x0 - Start of the overlap (the incoming clip's start)
 * @param {number} x1 - End of the overlap (the outgoing clip's end)
 * @param {number} y - Clip top
 * @param {number} height - Clip height
 * @param {string} outgoing - Colour of the outgoing clip
 * @param {Palette} palette
 */
export function drawCrossfade(ctx, x0, x1, y, height, outgoing, palette) {
  if (!(x1 - x0 > 0.5)) return;
  ctx.fillStyle = outgoing;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.lineTo(x0, y + height);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = palette.lane;
  ctx.globalAlpha = 0.28;
  ctx.fillRect(x0, y, x1 - x0, height);
  ctx.globalAlpha = 0.95;
  ctx.strokeStyle = palette.clipText;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y + height);
  ctx.moveTo(x0, y + height);
  ctx.lineTo(x1, y);
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
