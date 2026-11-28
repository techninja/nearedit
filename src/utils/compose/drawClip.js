/**
 * One clip of the layer pipeline: resolve its keyframes, draw its source
 * (footage, a still, a generator, a title or a brand element) with its transform, and — when
 * it has effects or a blend mode — do that on a surface of its own first,
 * run the effects there and composite the result.
 * Isomorphic. Reference: docs/app-spec/COMPOSITOR.md § Layer pipeline.
 * @module utils/compose/drawClip
 */

import { resolveClip } from '#utils/edl/animate.js';
import { clipProgress, resolveTransform } from '#utils/edl/geometry.js';
import { videoOpacity } from '#utils/edl/levels.js';
import { applyEffects, runModule } from './applyEffects.js';
import { compositeOperation, isBlended } from './blend.js';
import { generatorModule } from './catalog.js';
import { drawElement } from './elementLayer.js';
import { clipTime } from './frame.js';
import { pictureSize, warnOnce } from './host.js';
import { enabledEffects } from './layers.js';
import { resolveParams } from './params.js';
import { drawFrameSized, drawPicture, isIdentity } from './place.js';
import { drawTitle } from './text/title.js';

/**
 * @typedef {Object} FrameRun - What stays the same for a whole frame
 * @property {any} edl
 * @property {number} time - Timeline seconds
 * @property {import('./frame.js').Frame} frame
 * @property {import('./host.js').Compose} compose
 */

/**
 * Put a surface onto a context, pixel for pixel.
 * @param {any} ctx
 * @param {import('./pool.js').Surface} surface
 * @param {number} alpha - 0..1
 * @param {unknown} blendMode
 */
export function composite(ctx, surface, alpha, blendMode) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = compositeOperation(blendMode);
  ctx.drawImage(surface.canvas, 0, 0);
  ctx.restore();
}

/**
 * Draw a generator clip: the module paints a blank frame-sized canvas, which
 * is then placed like any other source.
 * @param {any} ctx
 * @param {any} clip
 * @param {import('#utils/edl/geometry.js').FlatTransform} t
 * @param {number} alpha
 * @param {import('./frame.js').Time} time
 * @param {FrameRun} run
 * @param {boolean} blank - `ctx` is a blank frame-sized surface of the clip's own
 */
function drawGenerator(ctx, clip, t, alpha, time, run, blank) {
  const { type, seed, params } = clip.generator;
  const module = generatorModule(type);
  if (!module) return warnOnce(`generator:${type}`, `unknown generator "${type}" draws nothing`);
  const { pool, env } = run.compose;
  const values = {
    seed: Number.isFinite(seed) ? seed : 0,
    ...resolveParams(module.params, params),
  };
  // On the clip's own blank surface an untransformed generator needs no detour.
  const own = blank && isIdentity(t) ? null : pool.acquire();
  const target = own ? own.ctx : ctx;
  runModule(`generator "${type}"`, target, pool, () =>
    module.draw(target, values, time, run.frame, env),
  );
  if (!own) return;
  drawFrameSized(ctx, own.canvas, run.frame, t, alpha);
  pool.release(own);
}

/**
 * Draw a clip's source.
 * @param {any} ctx
 * @param {import('./layers.js').Layer} layer - With `clip` already resolved
 * @param {import('#utils/edl/geometry.js').FlatTransform} t
 * @param {number} alpha
 * @param {import('./frame.js').Time} time
 * @param {FrameRun} run
 * @param {boolean} blank
 */
function drawSource(ctx, layer, t, alpha, time, run, blank) {
  const { clip, kind, sourceTime } = layer;
  const { env } = run.compose;
  if (kind === 'element') return drawElement(ctx, layer, t, alpha, run, drawClip);
  if (kind === 'generator') return drawGenerator(ctx, clip, t, alpha, time, run, blank);
  if (kind === 'title') return drawTitle(ctx, clip.text, t, alpha, time, run.frame, run.compose);
  const picture = kind === 'image' ? env.image(clip.sourceFile) : env.frameOf(clip, sourceTime);
  if (picture) drawPicture(ctx, picture, pictureSize(picture), run.frame, t, alpha);
}

/**
 * Draw one layer of a track onto a context.
 * @param {any} ctx - The frame, or the track's surface
 * @param {import('./layers.js').Layer} layer - As `trackLayers` returns it
 * @param {FrameRun} run
 */
export function drawClip(ctx, layer, run) {
  const clip = resolveClip(layer.clip, run.time);
  const t = resolveTransform(clip, clipProgress(clip, run.time));
  // Cross-fades are true dissolves: videoOpacity keeps the outgoing clip opaque.
  const fade = videoOpacity(layer.track, clip, run.time);
  const alpha = Math.max(0, Math.min(1, t.opacity * fade));
  if (!(alpha > 0)) return;
  const resolved = { ...layer, clip };
  const time = clipTime(clip, run.time, run.frame.fps);
  const effects = enabledEffects(clip.effects);
  if (!effects.length && !isBlended(clip.blendMode)) {
    return drawSource(ctx, resolved, t, alpha, time, run, false);
  }
  const { pool } = run.compose;
  const surface = pool.acquire();
  drawSource(surface.ctx, resolved, t, 1, time, run, true);
  applyEffects(surface, effects, time, run.frame, run.compose);
  composite(ctx, surface, alpha, clip.blendMode);
  pool.release(surface);
}
