/**
 * Grouping a transcript into paragraphs: a new paragraph starts after a
 * real pause, and long unbroken speech is broken at a sentence end.
 * Pure and isomorphic.
 * @module utils/transcript/paragraphs
 */

import { rangeText } from './units.js';

/** @typedef {import('./units.js').Unit} Unit */

/**
 * @typedef {Object} Paragraph
 * @property {number} first - Index of its first unit
 * @property {number} last - Index of its last unit
 * @property {number} start - Source time of the first unit
 * @property {number} end - Source time the last unit ends
 */

const SENTENCE_END = /[.!?…]["')\]]?$/;

/**
 * @param {Unit[]} units
 * @param {{ pause?: number, maxUnits?: number }} [opts] - A gap longer than
 *   `pause` seconds starts a paragraph; one longer than `maxUnits` is
 *   broken at the next sentence end (and unconditionally at twice that)
 * @returns {Paragraph[]}
 */
export function groupParagraphs(units, opts = {}) {
  const { pause = 0.75, maxUnits = 60 } = opts;
  /** @type {Paragraph[]} */
  const paragraphs = [];
  let first = 0;
  for (let i = 0; i < units.length; i++) {
    const next = units[i + 1];
    const size = i - first + 1;
    const closes =
      !next ||
      next.start - units[i].end > pause ||
      (size >= maxUnits && SENTENCE_END.test(units[i].text)) ||
      size >= maxUnits * 2;
    if (!closes) continue;
    paragraphs.push({ first, last: i, start: units[first].start, end: units[i].end });
    first = i + 1;
  }
  return paragraphs;
}

/**
 * The whole transcript as text, paragraphs separated by a blank line.
 * @param {Unit[]} units
 * @param {Paragraph[]} paragraphs
 * @returns {string}
 */
export function transcriptText(units, paragraphs) {
  return paragraphs.map((p) => rangeText(units, p.first, p.last)).join('\n\n');
}

/**
 * Index of the paragraph that holds a unit.
 * @param {Paragraph[]} paragraphs
 * @param {number} unitIndex
 * @returns {number} -1 when there is none
 */
export function paragraphOf(paragraphs, unitIndex) {
  return paragraphs.findIndex((p) => unitIndex >= p.first && unitIndex <= p.last);
}
