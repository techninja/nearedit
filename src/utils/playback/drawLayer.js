/**
 * Layer drawing — put one picture or one title onto a 2D canvas whose
 * coordinate system is already scaled to **output-resolution pixels**.
 * Placement comes from geometry.js, the same maths the renderer uses
 * (docs/app-spec/EDL.md § transform).
 * @module utils/playback/drawLayer
 */

import { placeSource } from '#utils/edl/geometry.js';
import { layoutTitle } from '#utils/playback/titleLayout.js';

/**
 * @typedef {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} Ctx2D
 * @typedef {import('#utils/edl/geometry.js').FlatTransform} FlatTransform
 * @typedef {{ width: number, height: number }} Size
 */

/**
 * Rotate the canvas about a point.
 * @param {Ctx2D} ctx
 * @param {number} degrees - Clockwise
 * @param {number} x
 * @param {number} y
 */
function rotateAbout(ctx, degrees, x, y) {
  if (!degrees) return;
  ctx.translate(x, y);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.translate(-x, -y);
}

/**
 * Draw a video frame or still: crop, fit, scale, offset, rotate, fade.
 * @param {Ctx2D} ctx
 * @param {CanvasImageSource} image
 * @param {Size} source - Natural size of the image
 * @param {Size} out - Output frame size
 * @param {FlatTransform} t - Resolved transform (ken burns applied)
 * @param {number} alpha - transform opacity × fade, 0..1
 */
export function drawPicture(ctx, image, source, out, t, alpha) {
  if (!(source.width > 0 && source.height > 0)) return;
  const p = placeSource(source.width, source.height, out.width, out.height, t);
  if (!(p.dw > 0 && p.dh > 0)) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  rotateAbout(ctx, t.rotation, p.dx + p.dw * t.anchorX, p.dy + p.dh * t.anchorY);
  ctx.drawImage(image, p.sx, p.sy, p.sw, p.sh, p.dx, p.dy, p.dw, p.dh);
  ctx.restore();
}

/**
 * Draw a title's text block at full opacity: centred in the frame, moved by
 * x/y, scaled about its centre, rotated about its anchor. Background box,
 * then outline, then fill.
 * @param {Ctx2D} ctx
 * @param {any} text - The clip's `text` block
 * @param {Size} out - Output frame size
 * @param {FlatTransform} t - Resolved transform
 */
export function drawTitle(ctx, text, out, t) {
  if (!t.scaleX || !t.scaleY) return;
  ctx.save();
  const layout = layoutTitle(text, (line, font) => {
    ctx.font = font;
    return ctx.measureText(line).width;
  });
  ctx.translate(out.width / 2 + t.x, out.height / 2 + t.y);
  rotateAbout(
    ctx,
    t.rotation,
    (t.anchorX - 0.5) * layout.width * t.scaleX,
    (t.anchorY - 0.5) * layout.height * t.scaleY,
  );
  ctx.scale(t.scaleX, t.scaleY);
  if (text.background) {
    ctx.fillStyle = text.background;
    ctx.fillRect(layout.box.x, layout.box.y, layout.box.width, layout.box.height);
  }
  ctx.font = layout.font;
  ctx.textAlign = layout.align;
  ctx.textBaseline = 'middle';
  if (text.outlineWidth > 0) {
    // The stroke straddles the glyph edge, so double it for an outside outline.
    ctx.lineJoin = 'round';
    ctx.lineWidth = text.outlineWidth * 2;
    ctx.strokeStyle = text.outlineColor || '#000000';
    for (const line of layout.lines) ctx.strokeText(line.text, line.x, line.y);
  }
  ctx.fillStyle = text.color || '#ffffff';
  for (const line of layout.lines) ctx.fillText(line.text, line.x, line.y);
  ctx.restore();
}
