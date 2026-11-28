/**
 * Element clips — the layer kind `element`. A clip that carries a brand
 * element (docs/app-spec/BRAND.md) draws by **expanding** its design for
 * its own length and this frame into ordinary clips — titles, shapes,
 * pictures, generators — and drawing those with the clip drawing every
 * other layer uses; no element is ever inside an element. The layers go
 * onto a surface that is then the clip's picture: transform, opacity,
 * fades, effects and blend apply to it as to any source.
 *
 * Expansion is laid out with this canvas's own text measurement and kept
 * per clip (`elementExpansion.js`), so a frame costs little more than its
 * layers. Until every font the element's text needs is ready nothing is
 * drawn — a layout measured with a fallback font would stay wrong.
 * Isomorphic. Reference: docs/app-spec/COMPOSITOR.md § Element clips.
 * @module utils/compose/elementLayer
 */

import { elementSpan } from '#utils/brand/clip.js';
import { isBlended } from './blend.js';
import { expansionOf } from './elementExpansion.js';
import { drawFrameSized, isIdentity } from './place.js';

/**
 * @typedef {import('./drawClip.js').FrameRun} FrameRun
 * @typedef {(ctx: any, layer: import('./layers.js').Layer, run: FrameRun) => void} DrawClip
 */

/**
 * Draw an element clip.
 * @param {any} ctx
 * @param {import('./layers.js').Layer} layer - With `clip` already resolved
 * @param {import('#utils/edl/geometry.js').FlatTransform} t
 * @param {number} alpha
 * @param {FrameRun} run
 * @param {DrawClip} drawClip - The drawing of one ordinary clip
 */
export function drawElement(ctx, layer, t, alpha, run, drawClip) {
  // Pieces of one element that touch play as one: time runs through them.
  const span = elementSpan(layer.track, layer.clip);
  const layers = expansionOf(layer.clip.element, span.end - span.start, run, ctx);
  if (!layers.length) return;
  const time = run.time - span.start;
  const inner = { ...run, time };
  const showing = layers.filter(
    ({ clip }) => time >= clip.timelineStart && time < clip.timelineEnd,
  );
  // Untransformed and opaque, the layers can go where the surface would go:
  // the same picture without the detour — unless one of them blends, which
  // it must do with the element's own layers only.
  const direct =
    alpha === 1 && isIdentity(t) && !showing.some(({ clip }) => isBlended(clip.blendMode));
  const surface = direct ? null : run.compose.pool.acquire();
  const target = surface ? surface.ctx : ctx;
  for (const { clip, lane, kind } of showing) {
    drawClip(target, { clip, track: lane, kind, sourceTime: time }, inner);
  }
  if (!surface) return;
  drawFrameSized(ctx, surface.canvas, run.frame, t, alpha);
  run.compose.pool.release(surface);
}
