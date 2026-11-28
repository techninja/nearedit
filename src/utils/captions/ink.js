/**
 * The letters of a caption, pass by pass: shadows, outlines, fills. Each
 * pass draws a list of laid-out words, every word inside its own motion
 * and — when only a part of it has arrived — inside that part.
 * Isomorphic. Contract: docs/app-spec/CAPTIONS.md § Drawing.
 * @module utils/captions/ink
 */

import { withAlpha } from '#utils/compose/color.js';

/**
 * @typedef {import('./types.js').LaidCaption} LaidCaption
 * @typedef {import('./types.js').LaidWord} LaidWord
 */

/**
 * What the passes of one caption share.
 * @typedef {Object} Pen
 * @property {any} ctx - In the caption's font, moved into its arrival
 * @property {LaidCaption} laid
 * @property {import('./types.js').CaptionStyle} style - Resolved
 * @property {number} alpha - Opacity of the whole caption
 * @property {number} stroke - Outline width, canvas pixels
 * @property {number} reach - How far beyond its box a word's ink may go, canvas pixels
 */

/**
 * Run a drawing inside a word's own motion and, when only a part of the
 * word has arrived, inside that part.
 * @param {Pen} pen
 * @param {LaidWord} word
 * @param {'arrived'|'rest'|'all'} part - Which side of the word's sweep
 * @param {() => void} draw
 */
export function inWord({ ctx, laid, reach }, word, part, draw) {
  ctx.save();
  if (word.scale !== 1 || word.dy !== 0) {
    const cx = word.x + word.width / 2;
    ctx.translate(cx, word.cy + word.dy);
    ctx.scale(word.scale, word.scale);
    ctx.translate(-cx, -word.cy);
  }
  if (part !== 'all') {
    // The sweep runs from the word's leading edge: left, or right in a right-to-left line.
    const cut = word.width * (laid.rtl ? 1 - word.sweep : word.sweep);
    const first = (part === 'arrived') !== laid.rtl;
    const from = first ? -reach : cut;
    const to = first ? cut : word.width + reach;
    ctx.beginPath();
    ctx.rect(word.x + from, word.cy - laid.size - reach, to - from, (laid.size + reach) * 2);
    ctx.clip();
  }
  draw();
  ctx.restore();
}

/**
 * A word that is being revealed is drawn only as far as it has arrived.
 * @param {LaidWord} word
 * @returns {'arrived'|'all'}
 */
const visible = (word) => (word.sweep < 1 && !word.rest ? 'arrived' : 'all');

/**
 * While a caption or a word fades, what lies under its letters fades in
 * behind them (the square of the opacity), so an outline does not show
 * through the letters it surrounds.
 * @param {Pen} pen
 * @param {LaidWord} word
 * @returns {number} Opacity for a word's shadow and outline
 */
const under = ({ alpha, laid }, word) => alpha * laid.motion.alpha * word.alpha * word.alpha;

/**
 * The soft shadow: a blurred, offset copy of each word's outline (and of
 * its letters, when the shadow falls clear of the outline). A filter costs
 * as much as the area it may touch, so each copy is bound to its word.
 * @param {Pen} pen
 * @param {LaidWord[]} words
 */
export function drawShadows(pen, words) {
  const { ctx, laid, style, stroke } = pen;
  const { shadow } = style;
  const [blur, dx, dy] = [shadow.blur, shadow.x, shadow.y].map((units) => units * laid.unit);
  if (!(shadow.opacity > 0) || !(blur > 0 || dx !== 0 || dy !== 0)) return;
  ctx.fillStyle = ctx.strokeStyle = withAlpha(shadow.color, shadow.opacity);
  // As far as a shadow's ink goes beyond its word's box: the outline, the
  // blur's three deviations, a little for letters that overhang. Letters
  // stay within 0.8 of the font size above and below the middle of a line.
  const far = stroke + blur * 3 + laid.size * 0.1;
  const half = laid.size * 0.8 + far;
  for (const word of words) {
    ctx.globalAlpha = under(pen, word);
    inWord(pen, word, visible(word), () => {
      ctx.beginPath();
      ctx.rect(word.x + dx - far, word.cy + dy - half, word.width + far * 2, half * 2);
      ctx.clip();
      // A filter is not scaled with the drawing: the blur is, by hand.
      if (blur > 0) ctx.filter = `blur(${blur * laid.motion.scale * word.scale}px)`;
      if (stroke > 0) ctx.strokeText(word.text, word.x + dx, word.y + dy);
      if (!(stroke > 0) || Math.hypot(dx, dy) > stroke) {
        ctx.fillText(word.text, word.x + dx, word.y + dy);
      }
    });
  }
}

/**
 * The outlines of words.
 * @param {Pen} pen
 * @param {LaidWord[]} words
 */
export function drawOutlines(pen, words) {
  const { ctx, style, stroke } = pen;
  if (!(stroke > 0)) return;
  ctx.strokeStyle = style.stroke.color;
  for (const word of words) {
    ctx.globalAlpha = under(pen, word);
    inWord(pen, word, visible(word), () => ctx.strokeText(word.text, word.x, word.y));
  }
}

/**
 * The letters of words: each in its colour, or — while a colour or a
 * reveal sweeps through it — the part that has arrived in its colour and
 * the rest as it was.
 * @param {Pen} pen
 * @param {LaidWord[]} words
 * @param {string} [color] - One colour for all of them instead of their own
 */
export function drawFills(pen, words, color) {
  const { ctx, alpha } = pen;
  for (const word of words) {
    const letters = () => ctx.fillText(word.text, word.x, word.y);
    ctx.globalAlpha = alpha * word.alpha;
    ctx.fillStyle = color || word.color;
    inWord(pen, word, word.sweep < 1 && !(color && word.rest) ? 'arrived' : 'all', letters);
    if (color || !(word.sweep < 1) || !word.rest) continue;
    ctx.globalAlpha = alpha * word.rest.alpha;
    ctx.fillStyle = word.rest.color;
    inWord(pen, word, 'rest', letters);
  }
}
