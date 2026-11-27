/**
 * Frame painter — composite every visible layer of the timeline at one
 * moment onto the preview canvas, back to front, following
 * docs/app-spec/EDL.md § Rendering Semantics.
 * @module utils/playback/paintFrame
 */

import { clipProgress, resolveTransform } from '#utils/edl/geometry.js';
import { videoOpacity } from '#utils/edl/levels.js';
import { drawPicture, drawTitle } from '#utils/playback/drawLayer.js';
import { videoLayers } from '#utils/playback/schedule.js';

/**
 * @typedef {Object} Surface
 * @property {HTMLCanvasElement} canvas
 * @property {CanvasRenderingContext2D} ctx
 * @property {HTMLCanvasElement|null} scratch - Lazily made buffer for fading titles
 */

/**
 * @typedef {{ image: CanvasImageSource, width: number, height: number }} Picture
 */

/**
 * A title that is fading is drawn opaque into a scratch buffer and blended
 * in one go, so its outline never shows through its own fill.
 * @param {Surface} surface
 * @param {any} text
 * @param {{ width: number, height: number }} out
 * @param {import('#utils/edl/geometry.js').FlatTransform} t
 * @param {number} alpha
 */
function paintTitle(surface, text, out, t, alpha) {
  const { ctx, canvas } = surface;
  if (alpha >= 1) return drawTitle(ctx, text, out, t);
  surface.scratch ||= document.createElement('canvas');
  const scratch = surface.scratch;
  if (scratch.width !== canvas.width || scratch.height !== canvas.height) {
    scratch.width = canvas.width;
    scratch.height = canvas.height;
  }
  const buffer = scratch.getContext('2d');
  buffer.setTransform(1, 0, 0, 1, 0, 0);
  buffer.clearRect(0, 0, scratch.width, scratch.height);
  buffer.setTransform(ctx.getTransform());
  drawTitle(buffer, text, out, t);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.drawImage(scratch, 0, 0);
  ctx.restore();
}

/**
 * Paint the frame at `time`. Starts from black (gaps are black); the first
 * video track ends up in front. Each layer is laid out in output-resolution
 * pixels and the whole frame is scaled to the canvas, so offsets, font
 * sizes and outlines keep their proportions at any preview size.
 * @param {Surface} surface
 * @param {any[]} tracks
 * @param {number} time - Timeline seconds
 * @param {{ width: number, height: number }} out - Output frame size
 * @param {(cue: import('#utils/playback/schedule.js').Cue) => Picture|null} pictureFor -
 *   The decoded frame or still for a layer, or null when none is ready
 */
export function paintFrame(surface, tracks, time, out, pictureFor) {
  const { ctx, canvas } = surface;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(canvas.width / out.width, 0, 0, canvas.height / out.height, 0, 0);
  for (const cue of videoLayers(tracks, time)) {
    const { clip, track } = cue;
    const t = resolveTransform(clip, clipProgress(clip, time));
    // Cross-fades are true dissolves: videoOpacity keeps the outgoing clip opaque.
    const alpha = Math.max(0, Math.min(1, t.opacity * videoOpacity(track, clip, time)));
    if (alpha <= 0) continue;
    if (cue.kind === 'title') {
      paintTitle(surface, clip.text, out, t, alpha);
      continue;
    }
    const picture = pictureFor(cue);
    if (picture) drawPicture(ctx, picture.image, picture, out, t, alpha);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
