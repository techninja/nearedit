/**
 * Line breaking for titles: explicit line breaks, then word wrap to a
 * maximum width; a single word wider than the line is broken between
 * characters. Text measurement is injected. Isomorphic and pure.
 * @module utils/compose/text/wrap
 */

/** @typedef {(text: string) => number} Measure - Width of a run of text */

const segmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/**
 * The characters of a string as a reader sees them: an emoji with its
 * modifiers, or a letter with its accents, is one.
 * @param {string} text
 * @returns {string[]}
 */
export function graphemes(text) {
  if (!segmenter) return [...text];
  return Array.from(segmenter.segment(text), (part) => part.segment);
}

/**
 * Split content at its line breaks. Blank lines are kept.
 * @param {string} content
 * @returns {string[]}
 */
export function paragraphs(content) {
  return String(content ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
}

/**
 * Cut the longest head off a word that still fits the width (at least one
 * character, so wrapping always makes progress).
 * @param {string} word
 * @param {number} maxWidth
 * @param {Measure} measure
 * @returns {[string, string]} Head and the rest ('' when the word fits)
 */
function breakWord(word, maxWidth, measure) {
  const parts = graphemes(word);
  let head = parts[0] || '';
  let taken = 1;
  while (taken < parts.length && measure(head + parts[taken]) <= maxWidth) {
    head += parts[taken];
    taken++;
  }
  return [head, parts.slice(taken).join('')];
}

/**
 * Wrap one paragraph.
 * @param {string} line
 * @param {number} maxWidth - 0 = do not wrap
 * @param {Measure} measure
 * @returns {string[]} At least one line
 */
export function wrapLine(line, maxWidth, measure) {
  if (!(maxWidth > 0) || measure(line) <= maxWidth) return [line];
  /** @type {string[]} */
  const lines = [];
  let current = '';
  for (const word of line.split(' ')) {
    const joined = current ? `${current} ${word}` : word;
    if (measure(joined) <= maxWidth) {
      current = joined;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    while (measure(current) > maxWidth) {
      const [head, rest] = breakWord(current, maxWidth, measure);
      if (!rest) break;
      lines.push(head);
      current = rest;
    }
  }
  lines.push(current);
  return lines;
}
