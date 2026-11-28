/**
 * Titles — draw a clip's `text` as a layer. The block is laid out in the
 * middle of its own output-sized frame and placed with the clip's transform
 * like any other source, but as vectors, so text stays sharp at any scale.
 * Drawn straight through when it can be; through pooled layers when the
 * title must be treated as one picture: a fade (so the outline never shows
 * through the fill), a drop shadow (cast by outline and fill together), or
 * pieces fading in an entrance or exit.
 * Isomorphic. Reference: docs/app-spec/COMPOSITOR.md § text.
 * @module utils/compose/text/title
 */

import { fontString } from '#utils/compose/fonts.js';
import { placeVector } from '#utils/compose/place.js';
import { REST, animateText } from './animate.js';
import { drawBox, drawInk, setFont } from './draw.js';
import { drawLayer, unitScale } from './layer.js';
import { layoutText, textPieces } from './layout.js';
import { hasShadow, textStyle } from './style.js';

/**
 * Layouts by `text` object. Documents are never mutated, so the same object
 * is the same text; a keyframed text property makes a new object each frame
 * and is simply laid out again.
 * @type {WeakMap<object, { layout: import('./layout.js').TextLayout,
 *   pieces: Record<string, import('./layout.js').Piece[]>, fonts: any[]|undefined }>}
 */
const layouts = new WeakMap();

/**
 * The layout of a text block and, on demand, its animation pieces.
 * @param {object} text - The clip's `text` block
 * @param {import('./style.js').TextStyle} style
 * @param {import('./wrap.js').Measure} measure
 * @returns {{ layout: import('./layout.js').TextLayout, piecesOf: (by: string) =>
 *   import('./layout.js').Piece[] }}
 */
function laidOut(text, style, measure) {
  let entry = layouts.get(text);
  // The same words in another font table are another layout.
  if (!entry || entry.fonts !== style.fonts) {
    entry = { layout: layoutText(style, measure), pieces: {}, fonts: style.fonts };
    layouts.set(text, entry);
  }
  const { layout, pieces } = entry;
  const piecesOf = (/** @type {string} */ by) =>
    (pieces[by] ||= textPieces(layout, by, measure, style.letterSpacing));
  return { layout, piecesOf };
}

/**
 * Draw a title.
 * @param {any} ctx - Destination, frame-sized
 * @param {any} text - The clip's `text` block (keyframes applied)
 * @param {import('#utils/edl/geometry.js').FlatTransform} t
 * @param {number} alpha - Opacity to draw with, 0..1
 * @param {import('#utils/compose/frame.js').Time} time
 * @param {import('#utils/compose/frame.js').Frame} frame
 * @param {import('#utils/compose/host.js').Compose} compose
 */
export function drawTitle(ctx, text, t, alpha, time, frame, compose) {
  const style = textStyle(text, frame.fonts);
  if (!compose.env.fontReady(fontString(style, 1), style.content)) return;
  ctx.save();
  setFont(ctx, style);
  const { layout, piecesOf } = laidOut(text, style, (run) => ctx.measureText(run).width);
  const motion = animateText(style, time, (by) => (by === 'block' ? 1 : piecesOf(by).length));
  const states = motion && motion.by !== 'block' ? motion.states : null;
  const pieces = states ? piecesOf(motion.by) : layout.lines;
  ctx.restore();
  const whole = motion?.by === 'block' ? motion.states[0] : REST;
  const opacity = alpha * whole.alpha;
  if (!(opacity > 0 && whole.scale > 0)) return;

  const { pool } = compose;
  const shadow = hasShadow(style);
  const cutout = Boolean(states) && style.outlineWidth > 0 && states.some((s) => s.alpha < 1);
  const group = opacity < 1 || whole.blur > 0 ? pool.acquire() : null;
  const target = group ? group.ctx : ctx;
  /** Place a context: the clip's transform, then the block's own motion. */
  const place = (/** @type {any} */ c) => {
    if (!placeVector(c, frame, t)) return false;
    c.translate(whole.dx, whole.dy);
    c.scale(whole.scale, whole.scale);
    return true;
  };
  target.save();
  if (place(target)) {
    const m = target.getTransform();
    const scale = unitScale(target);
    const area = { m, box: layout.box, margin: style.fontSize * 1.25 + style.outlineWidth };
    // How far the shadow falls from the ink, canvas pixels.
    const reach = (Math.hypot(style.shadowX, style.shadowY) + style.shadowBlur) * scale;
    drawBox(target, style, layout.box);
    if (shadow || cutout) {
      // The ink on a layer of its own: one shadow for outline and fill together.
      const ink = pool.acquire();
      place(ink.ctx);
      drawInk(ink.ctx, style, pieces, states, true);
      target.setTransform(1, 0, 0, 1, 0, 0);
      if (shadow) {
        target.shadowColor = style.shadowColor;
        target.shadowBlur = style.shadowBlur * scale;
        target.shadowOffsetX = m.a * style.shadowX + m.c * style.shadowY;
        target.shadowOffsetY = m.b * style.shadowX + m.d * style.shadowY;
      }
      drawLayer(target, ink, area, shadow ? reach : 0);
      pool.release(ink);
    } else {
      drawInk(target, style, pieces, states);
    }
    if (group) {
      const blur = whole.blur * scale;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = opacity;
      if (blur > 0) ctx.filter = `blur(${blur}px)`;
      drawLayer(ctx, group, { ...area, margin: area.margin + reach / scale }, blur * 3);
      ctx.restore();
    }
  }
  target.restore();
  if (group) pool.release(group);
}
