/**
 * Drawing a particle layer: every particle alive at the moment, each one a
 * single `drawImage` out of a cached sprite sheet. Particles that would not
 * show — fully transparent, of no size, outside the frame — are skipped
 * before anything is drawn, and a layer whose sprites never turn is drawn
 * without touching the transform at all.
 * Isomorphic. Reference: docs/app-spec/PARTICLES.md.
 * @module utils/compose/generators/particles/draw
 */

import { TINTED_SIDE, atlasOf } from './atlas.js';
import { alphaAt, angleAt, flipAt, lookOf, sizeAt } from './look.js';
import { launch, motionOf, newBirth, travel } from './motion.js';
import { rampOf, stepAt } from './ramp.js';
import { eachAlive, planOf } from './schedule.js';
import { BLENDS } from './schemaLook.js';
import { levelFor, levelWithin, sourceOf } from './source.js';
import { cacheFor } from './spriteCache.js';

/** Seconds a particle is followed ahead to find where it is heading. */
const AHEAD = 1 / 240;
/**
 * A tumbling sprite seen nearly edge-on is squeezed along one side only.
 * Its level is picked half-way between what its long and its short side
 * ask for (their geometric mean), and never below this share of its size:
 * the squeezed side then does not crawl and the long one barely softens.
 */
const EDGE_ON = 0.35;

// Working memory for one particle at a time; nothing in it outlives a particle.
const birth = newBirth();
const here = { x: 0, y: 0 };
const next = { x: 0, y: 0 };

/**
 * Draw the particles of a moment.
 * @param {any} ctx - A blank, frame-sized canvas context
 * @param {Record<string, any>} p - Resolved parameters, with `seed`
 * @param {import('#utils/compose/frame.js').Time} time
 * @param {import('#utils/compose/frame.js').Frame} frame
 * @param {import('#utils/compose/host.js').ComposeEnv} env
 */
export function drawParticles(ctx, p, time, frame, env) {
  const source = sourceOf(p, env);
  if (!source) return;
  const cache = cacheFor(env);
  const ramp = rampOf(p);
  const look = lookOf(p);
  const motion = motionOf(p, frame);
  const { scale, width, height } = frame;
  const steps = ramp.fills.length;
  const tint = source.image ? p.tint : 1;
  const most = TINTED_SIDE[ramp.picked ? 'picked' : 'life'];
  const first = tint > 0 && steps > 1 ? levelWithin(source.top, most) : source.first;
  /** @type {import('./atlas.js').Atlas[]} Sheets by level, fetched as levels come up */
  const sheets = [];
  const centreX = p.position.x * width;
  const centreY = p.position.y * height;
  const stretch = p.stretch * scale;
  const headed = p.align || stretch > 0;
  const tumbles = look.flip > 0;
  const turning = headed || tumbles || (look.turns && !source.round);
  let alphaNow = -1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = BLENDS[p.blend] || 'source-over';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';

  eachAlive(planOf(p), time.t, (seed, index, group, age, span, born) => {
    const f = age / span;
    const step = stepAt(ramp, seed, index, group, f);
    const alpha = Math.round(alphaAt(look, seed, index, group, f, age) * ramp.alphas[step] * 255);
    if (alpha < 1) return;
    const side = sizeAt(look, seed, index, group, f) * scale;
    if (!(side > 0)) return;
    launch(motion, seed, index, group, born, birth);
    travel(motion, birth, age, here);
    const x = centreX + here.x * scale;
    const y = centreY + here.y * scale;
    let angle = turning ? angleAt(look, seed, index, group, age) : 0;
    let long = 0;
    if (headed) {
      travel(motion, birth, age + AHEAD, next);
      const dx = next.x - here.x;
      const dy = next.y - here.y;
      angle += Math.atan2(dx, -dy);
      long = (Math.sqrt(dx * dx + dy * dy) / AHEAD) * stretch;
    }
    const w = side * source.w;
    const h = side * source.h + long;
    const reach = (w + h) / 2;
    if (x + reach < 0 || x - reach > width || y + reach < 0 || y - reach > height) return;
    const face = tumbles ? flipAt(look, seed, index, group, age) : 1;
    const seen = tumbles ? Math.max(Math.sqrt(Math.abs(face)), EDGE_ON) : 1;
    const level = levelFor(source, side * seen, first);
    const sheet = (sheets[level] ||= atlasOf(cache, source, level, ramp, tint));
    const cell = sheet.cells > 1 ? step : 0;
    const sx = (cell % sheet.cols) * sheet.cw;
    const sy = Math.floor(cell / sheet.cols) * sheet.ch;
    const dw = w * sheet.padX;
    const dh = h * sheet.padY;
    if (alpha !== alphaNow) ctx.globalAlpha = (alphaNow = alpha) / 255;
    if (!turning) {
      ctx.drawImage(sheet.canvas, sx, sy, sheet.cw, sheet.ch, x - dw / 2, y - dh / 2, dw, dh);
      return;
    }
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    ctx.setTransform(cos, sin, -sin * face, cos * face, x, y);
    ctx.drawImage(sheet.canvas, sx, sy, sheet.cw, sheet.ch, -dw / 2, -dh / 2, dw, dh);
  });
}
