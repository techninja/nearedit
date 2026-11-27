/**
 * Title text → drawtext options. Layout follows the preview's
 * `titleLayout.js`: lines are pitched 1.2 × the font size, the block is
 * centred on font metrics (not on the ink), and the background box is the
 * block plus 0.25 × the font size. Pure.
 * @module api/render/titleStyle
 */

import { TITLE_BOX_PADDING, TITLE_LINE_HEIGHT } from '#utils/playback/titleLayout.js';
import { escapeValue, filter, hexColor } from './expr.js';

/**
 * @typedef {Object} TextSupport
 * @property {boolean} drawtext - The drawtext filter exists in this FFmpeg
 * @property {boolean} textAlign - drawtext has text_align / y_align (FFmpeg 6.1+)
 * @property {boolean} fontconfig - Fonts can be named; otherwise a file is needed
 * @property {Record<string, Record<string, string>>} [fontFiles] - family → style → path
 * @property {Record<string, { lineBox: number, pitch: number }>} [fontMetrics] - Measured
 *   line box and natural line pitch per font option, as multiples of the font size
 */

const FAMILIES = ['sans-serif', 'serif', 'monospace'];

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
 * Normalise title text for the text file: line breaks and tabs stay, other
 * control characters (which would be drawn as boxes) go.
 * @param {unknown} content
 * @returns {string}
 */
export function titleText(content) {
  const text = String(content ?? '').replace(/\r\n?/g, '\n');
  return [...text].filter((ch) => ch === '\n' || ch === '\t' || ch >= ' ').join('');
}

/**
 * The drawtext filter that draws a text block in the middle of its card.
 * @param {any} text - The clip's `text` block
 * @param {{ font: { fontfile: string }, path: string, scale: number, support: TextSupport }} how -
 *   `path` is the text file; `scale` turns EDL pixels into card pixels
 * @returns {string}
 */
export function drawtextFilter(text, { font, path, scale, support }) {
  const size = Math.max(1, Math.min(4000, Math.round((Number(text.fontSize) || 72) * scale)));
  const outline = Math.round((Number(text.outlineWidth) || 0) * scale);
  const background = hexColor(text.background);
  const pad = Math.round(size * TITLE_BOX_PADDING);
  const metrics = support.fontMetrics?.[font.fontfile];
  // With measured metrics the line pitch and the box match the preview exactly;
  // otherwise the font's own line height is used.
  const spacing = metrics ? Math.round((TITLE_LINE_HEIGHT - metrics.pitch) * size) : 0;
  const lift = metrics ? Math.round(((TITLE_LINE_HEIGHT - metrics.lineBox) * size) / 2) : 0;
  const modern = support.textAlign && {
    text_align: ['left', 'right'].includes(text.align) ? text.align : 'center',
    y_align: 'font',
    line_spacing: spacing || undefined,
  };
  const box = background && {
    box: 1,
    boxcolor: background,
    boxborderw: modern ? `${Math.max(0, pad + lift)}|${pad}` : pad,
  };
  return filter('drawtext', {
    ...font,
    textfile: escapeValue(path),
    expansion: 'none',
    fontsize: size,
    fontcolor: hexColor(text.color, '0xffffff@1'),
    x: '(w-text_w)/2',
    y: '(h-text_h)/2',
    ...modern,
    ...box,
    ...(outline > 0 && {
      borderw: outline,
      bordercolor: hexColor(text.outlineColor, '0x000000@1'),
    }),
  });
}
