/**
 * Setting the text of a layer: the largest size at which it fits its width
 * in few enough lines without a word being broken, wrapped so the lines
 * come out about equally long; a text that is still too long at its
 * smallest size is cut with an ellipsis. Layout is the compositor's own
 * (`layoutText`), so a block is drawn exactly as it was measured here.
 * Isomorphic and pure.
 * @module utils/brand/element/textFit
 */

import { layoutText } from '#utils/compose/text/layout.js';
import { isPlainObject } from '#utils/edl/jsonBag.js';
import { num } from './measure.js';

/**
 * @typedef {Object} TextFont - The font of a text layer, every field usable
 * @property {string} family
 * @property {number} weight
 * @property {boolean} italic
 * @property {number} tracking - Letter spacing as a share of the size
 * @property {number} lineHeight
 * @property {boolean} upper
 * @property {number} scale
 */

/**
 * @typedef {Object} Fitted
 * @property {string} content - With a line break wherever it wraps
 * @property {number} fontSize - Output pixels
 * @property {number} width - Of the block as drawn, output pixels
 * @property {number} height - Lines × line pitch
 * @property {number} lines
 * @property {TextFont} font
 */

/** How much smaller each attempt is. */
const SHRINK = 0.94;

/**
 * The font a text layer is set in: its `font` (a font token), with the
 * layer's own `weight`, `italic`, `tracking`, `lineHeight` and `upper` on top.
 * @param {Record<string, any>} layer
 * @returns {TextFont}
 */
export function textFont(layer) {
  const font = isPlainObject(layer.font) ? layer.font : {};
  return {
    family: typeof font.family === 'string' && font.family ? font.family : 'Inter',
    weight: num(layer.weight ?? font.weight, 400, 1, 1000),
    italic: (layer.italic ?? font.italic) === true,
    tracking: num(layer.tracking ?? font.tracking, 0, -0.2, 1),
    lineHeight: num(layer.lineHeight ?? font.lineHeight, 1.15, 0.7, 2.5),
    upper: (layer.upper ?? font.upper) === true,
    scale: num(font.scale, 1, 0.4, 2.5),
  };
}

/**
 * The words of a text layer as they are drawn.
 * @param {Record<string, any>} layer - Slots filled in
 * @returns {string} '' when there is nothing to draw
 */
export function textContent(layer) {
  const text = typeof layer.text === 'string' ? layer.text.replace(/\r\n?/g, '\n').trim() : '';
  return textFont(layer).upper ? text.toUpperCase() : text;
}

/**
 * Fit the text of a layer into a width.
 * @param {Record<string, any>} layer - A text layer, slots filled in
 * @param {number} width - Widest the block may be, output pixels
 * @param {{ unit: number, measure: import('./measure.js').MeasureRun }} env
 * @returns {Fitted|null} null when the layer has no text
 */
export function fitText(layer, width, env) {
  const content = textContent(layer);
  if (!content) return null;
  const font = textFont(layer);
  const top = num(layer.size, 5, 0.5, 80) * font.scale * env.unit;
  const floor = Math.min(top, num(layer.minSize, layer.size * 0.6, 0.5, 80) * font.scale * env.unit);
  const most = Math.round(num(layer.lines, 3, 1, 12));
  const room = Math.max(1, width);
  const words = content.split(/\s+/).filter(Boolean);
  /** @type {(size: number, maxWidth: number, text?: string) => any} */
  const lay = (size, maxWidth, text = content) => {
    const letterSpacing = Math.round(font.tracking * size * 100) / 100;
    const run = { fontFamily: font.family, fontSize: size, weight: font.weight, letterSpacing };
    const measure = (/** @type {string} */ piece) =>
      env.measure(piece, { ...run, italic: font.italic });
    const block = { content: text, maxWidth, letterSpacing, lineHeight: font.lineHeight };
    const style = { ...block, fontSize: size, align: 'left', boxPadding: 0 };
    const layout = layoutText(/** @type {any} */ (style), measure);
    const widest = Math.max(0, ...words.map((word) => measure(word) - letterSpacing));
    return { layout, widest, measure, size };
  };
  let set = lay(Math.round(top * 100) / 100, room);
  const fits = () => set.layout.lines.length <= most && set.widest <= room;
  while (!fits() && set.size > floor) {
    set = lay(Math.max(floor, Math.round(set.size * SHRINK * 100) / 100), room);
  }
  const cut = set.layout.lines.length > most;
  if (cut) set = lay(set.size, 0, clipped(set, most, room));
  const count = set.layout.lines.length;
  if (!cut && count > 1 && set.widest <= room) {
    // The narrowest width that keeps this number of lines evens them out.
    let [low, high] = [Math.min(set.widest, room), room];
    for (let i = 0; i < 12 && high - low > 1; i++) {
      const middle = (low + high) / 2;
      if (lay(set.size, middle).layout.lines.length <= count) high = middle;
      else low = middle;
    }
    set = lay(set.size, Math.min(room, Math.ceil(high)));
  }
  const { layout } = set;
  return {
    content: layout.lines.map((/** @type {{ text: string }} */ line) => line.text).join('\n'),
    fontSize: set.size,
    width: layout.width,
    height: layout.height,
    lines: layout.lines.length,
    font,
  };
}

/**
 * The first lines of a text that is too long, ending in an ellipsis.
 * @param {{ layout: any, measure: (text: string) => number }} set
 * @param {number} most - Lines to keep
 * @param {number} room - Width of a line, output pixels
 * @returns {string}
 */
function clipped(set, most, room) {
  const kept = set.layout.lines.slice(0, most).map((/** @type {{ text: string }} */ l) => l.text);
  let last = kept[most - 1].replace(/[\s.,;:!?…-]+$/, '');
  while (last.includes(' ') && set.measure(`${last}…`) > room) {
    last = last.slice(0, last.lastIndexOf(' ')).replace(/[\s.,;:!?…-]+$/, '');
  }
  kept[most - 1] = `${last}…`;
  return kept.join('\n');
}
