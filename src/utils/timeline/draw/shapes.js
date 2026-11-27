/**
 * Small canvas helpers shared by the drawing layers: hatching, rounded
 * rectangles and cheap text fitting.
 * @module utils/timeline/draw/shapes
 */

/** @type {Map<string, number>} Measured text widths, by font and text */
const widths = new Map();
const MAX_MEASURED = 4000;

/**
 * Diagonal lines across a rectangle. The caller sets the stroke style.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} [gap=8] - Distance between lines
 * @param {number} [slant=1] - 1 leans right (/), -1 leans left (\)
 */
export function hatch(ctx, x, y, width, height, gap = 8, slant = 1) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.beginPath();
  for (let offset = -height; offset < width; offset += gap) {
    const from = x + offset;
    ctx.moveTo(slant > 0 ? from : from + height, y + height);
    ctx.lineTo(slant > 0 ? from + height : from, y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Trace a rectangle with rounded corners as the current path.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} radius - 0 for square corners
 */
export function boxPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  if (radius > 0 && ctx.roundRect) ctx.roundRect(x, y, width, height, radius);
  else ctx.rect(x, y, width, height);
}

/**
 * Shorten text to fit a width, ending in an ellipsis. Each distinct text is
 * measured once per font, so a thousand clips cost a thousand map lookups.
 * @param {CanvasRenderingContext2D} ctx - With the font already set
 * @param {string} text
 * @param {number} maxWidth - Pixels
 * @returns {string} '' when not even two characters fit
 */
export function fitText(ctx, text, maxWidth) {
  if (!text || maxWidth <= 0) return '';
  const key = `${ctx.font}|${text}`;
  let width = widths.get(key);
  if (width === undefined) {
    if (widths.size > MAX_MEASURED) widths.clear();
    width = ctx.measureText(text).width;
    widths.set(key, width);
  }
  if (width <= maxWidth) return text;
  const keep = Math.floor((text.length * maxWidth) / width) - 1;
  return keep >= 2 ? `${text.slice(0, keep)}…` : '';
}
