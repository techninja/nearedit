/**
 * Title clips. The text is drawn once with drawtext onto a transparent RGB
 * card, which then goes through the same layer chain as an image — so
 * titles get opacity, fades, rotation, scale and ken burns like any clip.
 * The text itself travels in a file, never in the graph. Pure.
 * @module api/render/title
 */

import { placeSource, resolveTransform } from '#utils/edl/geometry.js';
import { filter } from './expr.js';
import { layerFades } from './mediaLayer.js';
import { layerGeometry } from './placement.js';
import { clipWindow } from './timing.js';
import { drawtextFilter, fontOption, titleText } from './titleStyle.js';

/** @typedef {import('./titleStyle.js').TextSupport} TextSupport */

const NO_CROP = { cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0 };
const even = (v) => Math.ceil(v / 2) * 2;

/**
 * Describe the layer of a title clip and the text file it needs.
 * @param {any} clip - Snapped clip
 * @param {any} track - Snapped track that owns it
 * @param {string} name - Unique name, used for the pad and the text file
 * @param {{ timing: import('./timing.js').Timing, frame: { width: number, height: number },
 *   out: { width: number, height: number }, text: TextSupport, workDir: string }} ctx
 * @returns {{ spec: import('./layer.js').LayerSpec, file: { path: string, content: string } }
 *   | { warning: string } | null} null when the clip is outside the range
 */
export function titleLayer(clip, track, name, ctx) {
  const window = clipWindow(clip, ctx.timing);
  if (!window) return null;
  const text = clip.text || {};
  const font = ctx.text.drawtext ? fontOption(text, ctx.text) : null;
  if (!font) return { warning: `title "${clip.clipId}" skipped: this FFmpeg cannot draw text` };

  const { frame, out } = ctx;
  const kx = out.width / frame.width;
  const ky = out.height / frame.height;
  const ends = [resolveTransform(clip, 0), resolveTransform(clip, 1)];
  // Uniform scale goes into the font size (crisp text); the card is only
  // resized for what is left: a stretch, or a ken-burns zoom below its peak.
  const fontScale = Math.max(0.01, ...ends.map((t) => Math.abs(t.scaleY)));
  // The card is the frame, grown so text that x/y moves into view is on it.
  const reach = (key, k) => Math.ceil(Math.max(...ends.map((t) => Math.abs(t[key]))) * k);
  const card = {
    w: even(Math.min(out.width * 4, out.width + 2 * reach('x', kx))),
    h: even(Math.min(out.height * 4, out.height + 2 * reach('y', ky))),
  };
  const rects = ends.map((t) => {
    // The block's centre comes from the shared placement of a frame-sized source.
    const unit = { ...t, ...NO_CROP, scaleX: 1, scaleY: 1 };
    const p = placeSource(frame.width, frame.height, frame.width, frame.height, unit);
    const w = (card.w * Math.abs(t.scaleX)) / fontScale;
    const h = (card.h * Math.abs(t.scaleY)) / fontScale;
    return { x: (p.dx + p.dw / 2) * kx - w / 2, y: (p.dy + p.dh / 2) * ky - h / 2, w, h };
  });
  const whole = { x: 0, y: 0, w: card.w, h: card.h };
  // A title turns about the centre of its text block.
  const centred = { ...ends[0], anchorX: 0.5, anchorY: 0.5 };

  const path = `${ctx.workDir ? `${ctx.workDir}/` : ''}${name}.txt`;
  const blank = filter('color', { c: 'black@0', s: `${card.w}x${card.h}`, r: ctx.timing.fpsText });
  const draw = drawtextFilter(text, { font, path, scale: fontScale * ky, support: ctx.text });
  return {
    spec: {
      id: name,
      // drawtext blends into the transparent card premultiplied; undo that.
      generate: [blank, 'format=gbrap', 'trim=end_frame=1', draw, 'unpremultiply=inplace=1'],
      still: true,
      source: { width: card.w, height: card.h, matrix: '' },
      geometry: layerGeometry(centred, [whole, whole], rects),
      window,
      ...layerFades(track, clip),
    },
    file: { path, content: titleText(text.content) },
  };
}
