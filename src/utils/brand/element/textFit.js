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
import { LIMITS } from '#utils/brand/limits.js';
import { num } from './measure.js';
import { widestPiece, wrapText } from './wrap.js';

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
/** The smallest size text is shrunk to when a design names none, units. */
const SMALLEST = 2.2;

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
 * The words of a text layer as they are drawn: at most `LIMITS.shown`
 * characters of them — more than any layer has room for.
 * @param {Record<string, any>} layer - Slots filled in
 * @returns {string} '' when there is nothing to draw
 */
export function textContent(layer) {
  const written = typeof layer.text === 'string' ? layer.text.slice(0, LIMITS.shown) : '';
  const text = written.replace(/\r\n?/g, '\n').trim();
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
  const px = (/** @type {number} */ units) => Math.round(units * font.scale * env.unit * 100) / 100;
  const top = px(num(layer.size, 5, 0.5, 80));
  // Unless the design says how small: a good half of the size, never below what reads.
  const least = Math.max(num(layer.size, 5) * 0.55, SMALLEST / font.scale);
  const floor = Math.min(top, px(num(layer.minSize, least, 0.5, 80)));
  const most = Math.round(num(layer.lines, 3, 1, 12));
  const room = Math.max(1, width);
  /** @type {(size: number, maxWidth: number, given?: string[]) => any} */
  const lay = (size, maxWidth, given) => {
    const letterSpacing = Math.round(font.tracking * size * 100) / 100;
    const run = { fontFamily: font.family, fontSize: size, weight: font.weight, letterSpacing };
    const measure = (/** @type {string} */ piece) =>
      env.measure(piece, { ...run, italic: font.italic });
    // A line's visible width ends at its last glyph, not after its spacing.
    const visible = (/** @type {string} */ text) => (text ? measure(text) - letterSpacing : 0);
    const lines = given || wrapText(content, maxWidth, visible);
    const block = { content: lines.join('\n'), maxWidth: 0, letterSpacing };
    const style = { ...block, fontSize: size, lineHeight: font.lineHeight, align: 'left' };
    const layout = layoutText(/** @type {any} */ ({ ...style, boxPadding: 0 }), measure);
    return { layout, lines, widest: widestPiece(content, visible), visible, size };
  };
  let set = lay(top, room);
  const fits = () => set.lines.length <= most && set.widest <= room;
  while (!fits() && set.size > floor) {
    set = lay(Math.max(floor, Math.round(set.size * SHRINK * 100) / 100), room);
  }
  const count = set.lines.length;
  if (count > most) {
    set = lay(set.size, 0, clipped(set, most, room));
  } else if (count > 1 && set.widest <= room) {
    // The narrowest width that keeps this number of lines evens them out.
    let [low, high] = [Math.min(set.widest, room), room];
    for (let i = 0; i < 12 && high - low > 1; i++) {
      const middle = (low + high) / 2;
      if (lay(set.size, middle).lines.length <= count) high = middle;
      else low = middle;
    }
    set = lay(set.size, Math.min(room, Math.ceil(high)));
  }
  const { layout } = set;
  return {
    content: set.lines.join('\n'),
    fontSize: set.size,
    width: layout.width,
    height: layout.height,
    lines: set.lines.length,
    font,
  };
}

/**
 * The first lines of a text that is too long, ending in an ellipsis.
 * @param {{ lines: string[], visible: (text: string) => number }} set
 * @param {number} most - Lines to keep
 * @param {number} room - Width of a line, output pixels
 * @returns {string[]}
 */
function clipped(set, most, room) {
  const kept = set.lines.slice(0, most);
  let last = kept[most - 1].replace(/[\s.,;:!?…-]+$/, '');
  while (last.includes(' ') && set.visible(`${last}…`) > room) {
    last = last.slice(0, last.lastIndexOf(' ')).replace(/[\s.,;:!?…-]+$/, '');
  }
  kept[most - 1] = `${last}…`;
  return kept;
}
