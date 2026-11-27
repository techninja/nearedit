/**
 * The frame compositor — draw the picture of a document at a moment onto a
 * Canvas 2D context. The browser preview and the server render both call
 * this one function, so what is previewed is what renders.
 *
 * Back to front: the background colour; then each visible video track, last
 * first; on a track each clip covering the time, in start order. A track
 * with effects, an opacity below 1 or a blend mode is composed on a surface
 * of its own and then joins the frame as one picture.
 *
 * A frame is a pure function of the document and the time: nothing is
 * remembered from one call to the next except pooled scratch canvases.
 * Isomorphic. Reference: docs/app-spec/COMPOSITOR.md § Layer pipeline.
 * @module utils/compose/drawFrame
 */

import { applyEffects } from './applyEffects.js';
import { cssColor } from './color.js';
import { composite, drawClip } from './drawClip.js';
import { frameInfo, timelineTime } from './frame.js';
import { composeFor } from './host.js';
import {
  enabledEffects,
  trackLayers,
  trackNeedsSurface,
  trackOpacity,
  tracksBackToFront,
} from './layers.js';

/**
 * Draw one track's clips, through a track surface when the track needs one.
 * @param {any} ctx
 * @param {any} track
 * @param {import('./drawClip.js').FrameRun} run
 */
function drawTrack(ctx, track, run) {
  const layers = trackLayers(track, run.time);
  if (!layers.length) return;
  if (!trackNeedsSurface(track)) {
    for (const layer of layers) drawClip(ctx, layer, run);
    return;
  }
  const opacity = trackOpacity(track);
  if (!(opacity > 0)) return;
  const { pool } = run.compose;
  const surface = pool.acquire();
  for (const layer of layers) drawClip(surface.ctx, layer, run);
  const time = timelineTime(run.edl, run.time, run.frame.fps);
  applyEffects(surface, enabledEffects(track.effects), time, run.frame, run.compose);
  composite(ctx, surface, opacity, track.blendMode);
  pool.release(surface);
}

/**
 * Draw the frame of a document at a time.
 * @param {any} ctx - A Canvas 2D context (browser or server)
 * @param {any} edl - The document
 * @param {number} time - Timeline seconds
 * @param {import('./host.js').HostEnv} env - The host: canvases, images, footage, fonts
 * @param {import('./frame.js').Frame} [frame] - The canvas being drawn;
 *   by default the whole of `ctx.canvas` (see `frameInfo`)
 */
export function drawFrame(
  ctx,
  edl,
  time,
  env,
  frame = frameInfo(edl, ctx.canvas.width, ctx.canvas.height),
) {
  const compose = composeFor(env);
  compose.pool.begin(frame.width, frame.height);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.fillStyle = cssColor(edl.background, '#000000');
  ctx.fillRect(0, 0, frame.width, frame.height);
  const run = { edl, time, frame, compose };
  for (const track of tracksBackToFront(edl)) drawTrack(ctx, track, run);
  ctx.restore();
  compose.pool.end();
}
