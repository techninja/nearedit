/**
 * Text layout — the geometry of a title's text block around its own centre:
 * which lines there are after wrapping, where each sits, how big the block
 * and its background box are, and where the pieces an animation moves
 * (lines, words, characters) lie. All sizes are output pixels. Pure and
 * isomorphic: text measurement is injected, and widths are the same on the
 * browser and server canvas, so both wrap at the same words.
 * @module utils/compose/text/layout
 */

import { graphemes, paragraphs, wrapLine } from './wrap.js';

/**
 * @typedef {import('./wrap.js').Measure} Measure
 * @typedef {{ text: string, x: number, y: number, width: number }} Piece - A
 *   run of text: `x` is its left edge, `y` the middle of its line, both
 *   relative to the block centre
 */

/**
 * @typedef {Object} TextLayout
 * @property {Piece[]} lines
 * @property {number} width - Text block width (widest line)
 * @property {number} height - Text block height (lines × line pitch)
 * @property {number} pitch - Distance from one line to the next
 * @property {{ x: number, y: number, width: number, height: number }} box -
 *   Background rectangle (block plus padding), relative to the block centre
 */

/**
 * Lay a title out.
 * @param {import('./style.js').TextStyle} style
 * @param {Measure} measure - Advance width of a run in the style's font,
 *   letter spacing included (as `measureText` reports it)
 * @returns {TextLayout}
 */
export function layoutText(style, measure) {
  // Letter spacing follows every character, the last one too; a line's
  // visible width ends at its last glyph.
  const visible = (/** @type {string} */ text) =>
    text ? Math.max(0, measure(text) - style.letterSpacing) : 0;
  const texts = paragraphs(style.content).flatMap((line) =>
    wrapLine(line, style.maxWidth, visible),
  );
  const widths = texts.map(visible);
  const pitch = style.fontSize * style.lineHeight;
  const width = Math.max(0, ...widths);
  const height = texts.length * pitch;
  const lines = texts.map((text, i) => {
    const slack = width - widths[i];
    const inset = style.align === 'left' ? 0 : style.align === 'right' ? slack : slack / 2;
    return { text, width: widths[i], x: -width / 2 + inset, y: -height / 2 + pitch * (i + 0.5) };
  });
  const pad = style.fontSize * style.boxPadding;
  const box = {
    x: -width / 2 - pad,
    y: -height / 2 - pad,
    width: width + pad * 2,
    height: height + pad * 2,
  };
  return { lines, width, height, pitch, box };
}

/**
 * The pieces of a layout that an animation moves one by one, in reading
 * order. Positions come from measuring each line up to the piece, so
 * kerning and spacing are exactly those of the line drawn whole.
 * @param {TextLayout} layout
 * @param {'line'|'word'|'char'|string} by
 * @param {Measure} measure
 * @param {number} letterSpacing
 * @returns {Piece[]}
 */
export function textPieces(layout, by, measure, letterSpacing) {
  const lines = layout.lines.filter((line) => line.text.trim() !== '');
  if (by !== 'word' && by !== 'char') return lines;
  /** @type {Piece[]} */
  const pieces = [];
  const piece = (
    /** @type {Piece} */ line,
    /** @type {string} */ before,
    /** @type {string} */ text,
  ) => {
    const run = measure(text);
    const x = line.x + measure(before + text) - run;
    pieces.push({ text, x, y: line.y, width: Math.max(0, run - letterSpacing) });
  };
  for (const line of lines) {
    if (by === 'word') {
      for (const match of line.text.matchAll(/\S+/g)) {
        piece(line, line.text.slice(0, match.index), match[0]);
      }
      continue;
    }
    let before = '';
    for (const char of graphemes(line.text)) {
      if (char.trim() !== '') piece(line, before, char);
      before += char;
    }
  }
  return pieces;
}
