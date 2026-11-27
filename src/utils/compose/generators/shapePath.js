/**
 * Shape outlines — the paths of the shape generator, built around the
 * origin in canvas pixels. Pure geometry on the current path of a context.
 * @module utils/compose/generators/shapePath
 */

/**
 * A polygon whose corners lie on an ellipse, first corner straight up.
 * With `inner` below 1 every second corner is pulled toward the centre,
 * which makes a star.
 * @param {any} ctx
 * @param {number} rx - Half width
 * @param {number} ry - Half height
 * @param {number} corners - Outer corners
 * @param {number} [inner=1] - Inner radius as a fraction of the outer, 0..1
 */
export function polygonPath(ctx, rx, ry, corners, inner = 1) {
  const star = inner < 1;
  const steps = star ? corners * 2 : corners;
  for (let i = 0; i < steps; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / steps;
    const r = star && i % 2 ? inner : 1;
    const x = Math.cos(angle) * rx * r;
    const y = Math.sin(angle) * ry * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/**
 * Trace a shape centred on the origin.
 * @param {any} ctx
 * @param {'rectangle'|'ellipse'|'polygon'|'star'} shape
 * @param {number} w - Width, canvas pixels
 * @param {number} h - Height, canvas pixels
 * @param {{ radius: number, sides: number, points: number, inner: number }} detail -
 *   Corner radius in canvas pixels; corner counts; star inner radius 0..1
 */
export function shapePath(ctx, shape, w, h, detail) {
  ctx.beginPath();
  if (shape === 'ellipse') {
    ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (shape === 'polygon') {
    polygonPath(ctx, w / 2, h / 2, Math.round(detail.sides));
  } else if (shape === 'star') {
    polygonPath(ctx, w / 2, h / 2, Math.round(detail.points), Math.min(0.999, detail.inner));
  } else {
    const radius = Math.max(0, Math.min(detail.radius, w / 2, h / 2));
    if (radius > 0) ctx.roundRect(-w / 2, -h / 2, w, h, radius);
    else ctx.rect(-w / 2, -h / 2, w, h);
  }
}
