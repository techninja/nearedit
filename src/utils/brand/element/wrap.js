/**
 * Line breaking for an element's text. Unlike a title typed into the
 * editor, an element's text is fitted for its reader: a line may also end
 * after a hyphen, a dash or a slash inside a word (`Featherstonehaugh-` /
 * `Cholmondeley`), and only a piece that is wider than a whole line is
 * broken between characters. The lines are written into the clip, so the
 * compositor draws them exactly as they were broken here.
 * Isomorphic and pure.
 * @module utils/brand/element/wrap
 */

import { paragraphs, wrapLine } from '#utils/compose/text/wrap.js';

/** @typedef {(text: string) => number} Measure - Width of a run of text */

/** After these a word may be broken, when more of the word follows. */
const SOFT_BREAK = /(?<=[^\s-–—/][-–—/])(?=[^\s-–—/])/;

/**
 * The pieces a paragraph can be broken between.
 * @param {string} paragraph
 * @returns {{ text: string, spaced: boolean }[]} `spaced`: a space comes before it
 */
export function pieces(paragraph) {
  return paragraph
    .split(' ')
    .filter(Boolean)
    .flatMap((word) => word.split(SOFT_BREAK).map((text, i) => ({ text, spaced: i === 0 })));
}

/**
 * Wrap one paragraph to a width.
 * @param {string} paragraph
 * @param {number} maxWidth - 0 = do not wrap
 * @param {Measure} measure
 * @returns {string[]} At least one line
 */
function wrapParagraph(paragraph, maxWidth, measure) {
  if (!(maxWidth > 0) || measure(paragraph) <= maxWidth) return [paragraph];
  /** @type {string[]} */
  const lines = [];
  let line = '';
  for (const { text, spaced } of pieces(paragraph)) {
    const joined = line ? `${line}${spaced ? ' ' : ''}${text}` : text;
    if (measure(joined) <= maxWidth) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    // A piece wider than a line is the one thing broken between characters.
    const broken = wrapLine(text, maxWidth, measure);
    lines.push(...broken.slice(0, -1));
    line = broken[broken.length - 1];
  }
  lines.push(line);
  return lines;
}

/**
 * Wrap a text — its own line breaks kept — to a width.
 * @param {string} content
 * @param {number} maxWidth - 0 = do not wrap
 * @param {Measure} measure
 * @returns {string[]}
 */
export function wrapText(content, maxWidth, measure) {
  return paragraphs(content).flatMap((paragraph) => wrapParagraph(paragraph, maxWidth, measure));
}

/**
 * The widest piece of a text: nothing narrower than this fits it unbroken.
 * @param {string} content
 * @param {Measure} measure
 * @returns {number}
 */
export function widestPiece(content, measure) {
  const all = paragraphs(content).flatMap((paragraph) => pieces(paragraph));
  return Math.max(0, ...all.map(({ text }) => measure(text)));
}
