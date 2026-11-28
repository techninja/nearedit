/**
 * Caption drawing — paint a laid-out caption onto a canvas: the plate, the
 * shadows, the outlines, the pill or underline, then the letters, the word
 * being said in front. Only Canvas 2D calls that the server canvas and
 * Chromium rasterise to the very same pixels are used: text from exact
 * outlines on the alphabetic baseline, round rectangles, rectangular clips,
 * and a blur filter for the soft shadow (a canvas `shadowBlur` differs
 * between the two by a level or two; a filter does not). Nothing is kept
 * between frames, and no other canvas is needed.
 * Isomorphic. Contract: docs/app-spec/CAPTIONS.md § Drawing.
 * @module utils/captions/draw
 */

import { withAlpha } from '#utils/compose/color.js';
import { drawFills, drawOutlines, drawShadows } from './ink.js';
import { resolveCaptionStyle } from './resolve.js';

/**
 * Trace a rounded rectangle.
 * @param {any} ctx
 * @param {import('./types.js').Rect} rect
 * @param {number} radius
 */
function round(ctx, rect, radius) {
  ctx.beginPath();
  ctx.roundRect(
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2)),
  );
}

/**
 * Draw a laid-out caption.
 * @param {any} ctx - A Canvas 2D context (browser or server); it is left as it was
 * @param {import('./types.js').LaidCaption|null} laid - From `layoutCaption`
 * @param {unknown} style - The style it was laid out with
 * @param {import('./types.js').CaptionFrame} [_frame] - Not needed: the
 *   layout is already in canvas pixels
 */
export function drawCaption(ctx, laid, style, _frame) {
  const { motion, mark } = laid || {};
  if (!laid || !(motion.alpha > 0 && motion.scale > 0)) return;
  const resolved = resolveCaptionStyle(style);
  const { unit, size, box } = laid;
  const stroke = resolved.stroke.width * unit;
  ctx.save();
  ctx.textRendering = 'geometricPrecision';
  ctx.font = laid.font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '0px';
  ctx.direction = laid.rtl ? 'rtl' : 'ltr';
  ctx.lineJoin = 'round';
  ctx.lineWidth = stroke * 2;
  ctx.filter = 'none';
  const alpha = ctx.globalAlpha * motion.alpha;
  const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
  ctx.translate(cx, cy + motion.dy);
  ctx.scale(motion.scale, motion.scale);
  ctx.translate(-cx, -cy);
  /** @type {import('./ink.js').Pen} */
  const pen = { ctx, laid, style: resolved, alpha, stroke, reach: stroke + size * 0.25 };
  if (laid.plate) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = withAlpha(resolved.plate.color, resolved.plate.opacity);
    round(ctx, laid.plate, resolved.plate.radius * unit);
    ctx.fill();
  }
  const shown = laid.words.filter((word) => word.alpha > 0 && word.scale > 0);
  // In front: the word being said. Under a pill it stays behind with the
  // rest: the pill covers its outline, and the letters go on top of both.
  const front = mark?.kind === 'box' ? [] : shown.filter((word) => word.state === 'saying');
  const back = shown.filter((word) => !front.includes(word));
  drawShadows(pen, shown);
  drawOutlines(pen, back);
  if (mark) {
    ctx.globalAlpha = alpha;
    round(ctx, mark, mark.radius);
    if (mark.kind === 'underline' && stroke > 0) {
      ctx.strokeStyle = resolved.stroke.color;
      ctx.stroke();
    }
    ctx.fillStyle = resolved.highlight.color;
    ctx.fill();
  }
  drawFills(pen, back);
  drawOutlines(pen, front);
  drawFills(pen, front);
  if (mark?.kind === 'box') {
    // Letters the pill covers take the colour that reads on it.
    round(ctx, mark, mark.radius);
    ctx.clip();
    const covered = shown.filter(
      (word) => word.x < mark.x + mark.width && word.x + word.width > mark.x,
    );
    drawFills(pen, covered, laid.onMark);
  }
  ctx.restore();
}
