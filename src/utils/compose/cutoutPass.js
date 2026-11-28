/**
 * The matte pass — draw a clip as the person alone. The host hands over the
 * packed frame of the clip's cutout file: the picture on the left, its
 * matte on the right. Here the picture is cut out through the matte's
 * brightness, with the edge shaped by `feather` and `shrink`, and the
 * result is placed like any picture — so the transform, crop, effects,
 * blend mode and fades of the clip apply to the person as to any layer.
 * `mode: blur` keeps the whole picture, blurred, behind the person.
 *
 * The work is done at the size the clip is drawn at (never above the size
 * of what was handed over): a small preview, or a person in a corner, pays
 * for its own pixels — and the matte, which is the one thing read pixel by
 * pixel, at half or a quarter of that where its edge is soft enough to
 * lose nothing. Lengths are units — hundredths of the shorter side of the
 * clip's picture — so they scale with the clip.
 * Isomorphic. Reference: docs/app-spec/CUTOUT.md § Drawing.
 * @module utils/compose/cutoutPass
 */

import { normalizeCutout } from '#utils/cutout/fields.js';
import { placeSource } from '#utils/edl/geometry.js';
import { runModule } from './applyEffects.js';
import { gaussianBlur } from './effects/blur.js';
import { matteToAlpha } from './matteCurve.js';
import { FOOTPRINT, RAMP, edgeShape } from './matteEdge.js';
import { drawPlaced } from './place.js';

/** The matte model works on a picture reduced to this on its long side. */
const MATTE_GRID = 512;
/** The deviation of a matte's edge as made, in pixels of the model's grid (measured on real mattes). */
const NATIVE = 0.7;
/** The matte is read at a reduced size while the edge to draw stays this soft there, pixels. */
const FINE_ENOUGH = 0.5;
const MAX_REDUCTION = 4;

/**
 * Draw a clip's picture through its matte.
 * @param {any} ctx - The frame, or the clip's own surface
 * @param {any} packed - The cutout's frame: picture left, matte right
 * @param {{ width: number, height: number }} size - Its natural size
 * @param {any} clip - Resolved; `clip.cutout.made` describes the cutout file
 * @param {import('#utils/edl/geometry.js').FlatTransform} t
 * @param {number} alpha - 0..1
 * @param {import('./drawClip.js').FrameRun} run
 */
export function drawCutout(ctx, packed, size, clip, t, alpha, run) {
  const { frame, compose } = run;
  const half = Math.floor(size.width / 2);
  const p = placeSource(half, size.height, frame.outWidth, frame.outHeight, t);
  if (!(p.dw > 0 && p.dh > 0)) return;
  // Canvas pixels per pixel handed over, along the axis drawn larger: the picture
  // keeps its proportions while it is worked on, so a length is the same both ways.
  const across = (p.dw * frame.width) / frame.outWidth / p.sw;
  const down = (p.dh * frame.height) / frame.outHeight / p.sh;
  const zoom = Math.min(1, Math.max(across, down));
  const width = Math.max(1, Math.ceil(p.sw * zoom));
  const height = Math.max(1, Math.ceil(p.sh * zoom));
  const settings = normalizeCutout(clip.cutout);
  const { made } = clip.cutout;
  // A unit, the edge to draw and the matte's own softness, in the pixels worked on.
  const unit = (Math.min(half, size.height) / 100) * zoom;
  const soft = (settings.feather * unit) / RAMP;
  const grid = Math.max(1, Math.max(made.width, made.height) / MATTE_GRID);
  const native = NATIVE * grid * (half / made.width) * zoom;
  let less = 1;
  while (less < MAX_REDUCTION && soft / (less * 2) >= FINE_ENOUGH) less *= 2;
  runModule('cutout', ctx, compose.pool, () => {
    const { env } = compose;
    /** @type {(target: any, left: number, by: number) => void} */
    const take = (target, left, by) =>
      target.drawImage(packed, left + p.sx, p.sy, p.sw, p.sh, 0, 0, width / by, height / by);
    const matte = env.scratch(Math.ceil(width / less), Math.ceil(height / less));
    take(matte.ctx, size.width - half, less);
    const shrink = (settings.shrink * unit) / less;
    const shape = edgeShape(soft / less, shrink, Math.hypot(native / less, FOOTPRINT), env);
    gaussianBlur(matte, shape.blur, env);
    matteToAlpha(matte, shape.curve);
    let person = matte;
    if (less > 1) {
      person = env.scratch(width, height);
      person.ctx.drawImage(matte.canvas, 0, 0, matte.width * less, matte.height * less);
    }
    person.ctx.globalCompositeOperation = 'source-in';
    take(person.ctx, 0, 1);
    let out = person;
    if (settings.mode === 'blur') {
      out = env.scratch(width, height);
      take(out.ctx, 0, 1);
      gaussianBlur(out, settings.blur * unit, env);
      out.ctx.drawImage(person.canvas, 0, 0);
    }
    drawPlaced(ctx, out.canvas, { sx: 0, sy: 0, sw: width, sh: height }, p, frame, t, alpha);
  });
}
