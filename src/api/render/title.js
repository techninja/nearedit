/**
 * Title clips. The text is drawn once with drawtext onto a transparent RGB
 * card, which then goes through the same layer chain as an image — so
 * titles get opacity, fades, rotation, scale and ken burns like any clip.
 * The text itself travels in a file, never in the graph. Pure.
 * @module api/render/title
 */

import { placeSource, resolveTransform } from '#utils/edl/geometry.js';
import { escapeValue, filter, hexColor } from './expr.js';
import { layerFades } from './mediaLayer.js';
import { layerGeometry } from './placement.js';
import { clipWindow } from './timing.js';

/**
 * @typedef {Object} TextSupport
 * @property {boolean} drawtext - The drawtext filter exists in this FFmpeg
 * @property {boolean} textAlign - drawtext has text_align / y_align (FFmpeg 6.1+)
 * @property {boolean} fontconfig - Fonts can be named; otherwise a file is needed
 * @property {Record<string, Record<string, string>>} [fontFiles] - family → style → path
 */

/** Padding of the background box, as a fraction of the font size. */
export const BOX_PADDING = 0.2;
const FAMILIES = ['sans-serif', 'serif', 'monospace'];
const NO_CROP = { cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0 };
const even = (v) => Math.ceil(v / 2) * 2;

/**
 * drawtext font option for a text block. With fontconfig, `fontfile` takes
 * a fontconfig pattern ("serif:bold:italic") — the documented way to pick a
 * style, and the generic family resolves the way a browser resolves it.
 * Without fontconfig the closest font file found at start-up is used.
 * @param {{ fontFamily?: string, bold?: boolean, italic?: boolean }} text
 * @param {TextSupport} support
 * @returns {{ fontfile: string } | null} null when no font can be found
 */
export function fontOption(text, support) {
  const family = FAMILIES.includes(text.fontFamily) ? text.fontFamily : 'sans-serif';
  if (support.fontconfig) {
    const pattern = [family, ...(text.bold ? ['bold'] : []), ...(text.italic ? ['italic'] : [])];
    return { fontfile: escapeValue(pattern.join(':')) };
  }
  const files = support.fontFiles || {};
  const styles = files[family] || files['sans-serif'] || Object.values(files)[0] || {};
  const style = `${text.bold ? 'bold' : ''}${text.italic ? 'italic' : ''}` || 'regular';
  const file = styles[style] || styles.regular || Object.values(styles)[0];
  return file ? { fontfile: escapeValue(file) } : null;
}

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
  const reach = (key, k) => Math.ceil(Math.max(...ends.map((t) => Math.abs(t[key]))) * k);
  const card = {
    w: even(Math.min(out.width * 4, out.width + 2 * reach('x', kx))),
    h: even(Math.min(out.height * 4, out.height + 2 * reach('y', ky))),
  };
  const rects = ends.map((t) => {
    const p = placeSource(frame.width, frame.height, frame.width, frame.height, {
      ...{ ...t, ...NO_CROP },
      ...{ scaleX: 1, scaleY: 1 },
    });
    const w = (card.w * Math.abs(t.scaleX)) / fontScale;
    const h = (card.h * Math.abs(t.scaleY)) / fontScale;
    return { x: (p.dx + p.dw / 2) * kx - w / 2, y: (p.dy + p.dh / 2) * ky - h / 2, w, h };
  });
  const whole = { x: 0, y: 0, w: card.w, h: card.h };
  const centred = { ...ends[0], anchorX: 0.5, anchorY: 0.5 };

  const size = Math.max(
    1,
    Math.min(4000, Math.round((Number(text.fontSize) || 72) * fontScale * ky)),
  );
  const outline = Math.round((Number(text.outlineWidth) || 0) * fontScale * ky);
  const background = hexColor(text.background);
  const path = `${ctx.workDir ? `${ctx.workDir}/` : ''}${name}.txt`;
  const drawtext = filter('drawtext', {
    ...font,
    textfile: escapeValue(path),
    expansion: 'none',
    fontsize: size,
    fontcolor: hexColor(text.color, '0xffffff@1'),
    x: '(w-text_w)/2',
    y: '(h-text_h)/2',
    ...(ctx.text.textAlign && {
      text_align: ['left', 'right'].includes(text.align) ? text.align : 'center',
      y_align: 'font',
    }),
    ...(background && { box: 1, boxcolor: background, boxborderw: Math.round(size * BOX_PADDING) }),
    ...(outline > 0 && {
      borderw: outline,
      bordercolor: hexColor(text.outlineColor, '0x000000@1'),
    }),
  });
  const blank = filter('color', { c: 'black@0', s: `${card.w}x${card.h}`, r: ctx.timing.fpsText });
  return {
    spec: {
      id: name,
      generate: [blank, 'format=gbrap', 'trim=end_frame=1', drawtext, 'unpremultiply=inplace=1'],
      still: true,
      source: { width: card.w, height: card.h, matrix: '' },
      geometry: layerGeometry(centred, [whole, whole], rects),
      window,
      ...layerFades(track, clip),
    },
    // Control characters would be drawn as boxes; line breaks and tabs stay.
    file: { path, content: titleText(text.content) },
  };
}

/**
 * Normalise title text for the text file.
 * @param {unknown} content
 * @returns {string}
 */
export function titleText(content) {
  const text = String(content ?? '').replace(/\r\n?/g, '\n');
  return [...text].filter((ch) => ch === '\n' || ch === '\t' || ch >= ' ').join('');
}
