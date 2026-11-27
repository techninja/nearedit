/**
 * Text drawing — paint a laid-out title onto a context whose origin is the
 * block centre and whose unit is one output pixel: the background box, then
 * every outline, then every fill (so no glyph's outline ever covers its
 * neighbour's fill). Pieces in motion carry a state: opacity, offset, scale
 * about their own centre, blur.
 * Isomorphic.
 * @module utils/compose/text/draw
 */

import { fontString } from '#utils/compose/fonts.js';
import { unitScale } from './layer.js';

/**
 * @typedef {import('./layout.js').Piece} Piece
 * @typedef {import('./style.js').TextStyle} TextStyle
 * @typedef {import('./animate.js').UnitState} UnitState
 */

/**
 * Put a context into the text style: font, baseline, spacing. Glyphs are
 * drawn from their exact outlines at exact positions (`geometricPrecision`:
 * no hinting, no snapping to the pixel grid) — what video wants, since text
 * then moves and scales smoothly, and the one mode in which the browser and
 * the server canvas produce the same pixels.
 * @param {any} ctx
 * @param {TextStyle} style
 */
export function setFont(ctx, style) {
  ctx.textRendering = 'geometricPrecision';
  ctx.font = fontString(style, 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${style.letterSpacing}px`;
}

/**
 * Fill the background box.
 * @param {any} ctx
 * @param {TextStyle} style
 * @param {{ x: number, y: number, width: number, height: number }} box
 */
export function drawBox(ctx, style, box) {
  if (!style.background) return;
  ctx.fillStyle = style.background;
  const radius = Math.min(style.boxRadius, box.width / 2, box.height / 2);
  if (radius > 0) {
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.width, box.height, radius);
    ctx.fill();
  } else {
    ctx.fillRect(box.x, box.y, box.width, box.height);
  }
}

/**
 * Enter a piece's own motion. Returns false when the piece is invisible.
 * @param {any} ctx
 * @param {Piece} piece
 * @param {UnitState} state
 * @param {TextStyle} style
 * @param {number} scale - Canvas pixels per output pixel, for the blur
 * @returns {boolean}
 */
function enter(ctx, piece, state, style, scale) {
  if (!(state.alpha > 0 && state.scale > 0)) return false;
  const cx = piece.x + piece.width / 2;
  ctx.globalAlpha = state.alpha;
  ctx.translate(cx + state.dx, piece.y + state.dy);
  ctx.scale(state.scale, state.scale);
  ctx.translate(-cx, -piece.y);
  if (state.blur > 0) {
    // A filter costs as much as the area it may touch: bound it to the piece.
    const reach = style.fontSize + style.outlineWidth + (state.blur * 3) / state.scale;
    ctx.beginPath();
    ctx.rect(piece.x - reach, piece.y - reach, piece.width + reach * 2, reach * 2);
    ctx.clip();
    ctx.filter = `blur(${state.blur * scale}px)`;
  }
  return true;
}

/**
 * Draw the text itself: outlines, then fills.
 * @param {any} ctx
 * @param {TextStyle} style
 * @param {Piece[]} pieces
 * @param {UnitState[]|null} states - One per piece, or null when all rest
 * @param {boolean} [isolated=false] - The context is a blank layer of its
 *   own. A fading piece then has the inside of its outline cut away before
 *   its fill goes on, so the outline never shows through the fill
 */
export function drawInk(ctx, style, pieces, states, isolated = false) {
  setFont(ctx, style);
  ctx.lineJoin = 'round';
  // The stroke straddles the glyph edge, so double it for an outside outline.
  ctx.lineWidth = style.outlineWidth * 2;
  ctx.strokeStyle = style.outlineColor;
  ctx.fillStyle = style.color;
  const scale = states ? unitScale(ctx) : 1;
  for (const pass of style.outlineWidth > 0 ? ['outline', 'fill'] : ['fill']) {
    pieces.forEach((piece, i) => {
      const state = states?.[i];
      if (state) ctx.save();
      if (!state || enter(ctx, piece, state, style, scale)) {
        if (pass === 'fill') {
          ctx.fillText(piece.text, piece.x, piece.y);
        } else {
          ctx.strokeText(piece.text, piece.x, piece.y);
          if (isolated && state && state.alpha < 1) {
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillText(piece.text, piece.x, piece.y);
          }
        }
      }
      if (state) ctx.restore();
    });
  }
}
