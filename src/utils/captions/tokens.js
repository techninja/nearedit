/**
 * From repaired words to the tokens grouping works with: punctuation that
 * was transcribed on its own joins the word before it, every word is put
 * into the style's capitals and punctuation, words of scripts written
 * without spaces are cut into the pieces a caption marks one by one, and
 * each token knows how much room it takes and whether a sentence or a
 * clause ends with it.
 * Isomorphic and pure. Contract: docs/app-spec/CAPTIONS.md § Groups and timing.
 * @module utils/captions/tokens
 */

import {
  attaches,
  charCount,
  endsClause,
  endsSentence,
  hasLetter,
  isUnspaced,
  joins,
  leans,
  shownText,
  unspacedPieces,
} from './text.js';

/**
 * @typedef {Object} Token
 * @property {string} text - As shown
 * @property {number} start
 * @property {number} end
 * @property {boolean} glue - Written onto the token before, without a space
 * @property {number} chars - Room it takes, in Latin letters
 * @property {boolean} stop - A sentence ends with it
 * @property {boolean} clause - A clause ends with it
 * @property {boolean} symbol - An emoji or a symbol on its own: it takes
 *   room but does not count as a word
 * @property {boolean} lean - It belongs to what follows: a poor place to break after
 * @property {boolean} inner - A later piece of a word that was cut into
 *   pieces: a poor place to break before
 */

/**
 * Words with the punctuation tokens that belong to them.
 * @param {import('./types.js').Word[]} words - Repaired
 * @returns {import('./types.js').Word[]}
 */
function attached(words) {
  /** @type {import('./types.js').Word[]} */
  const out = [];
  for (const word of words) {
    const before = out[out.length - 1];
    // A dash keeps its space ("team —"); a comma or an ending does not.
    const space = /^[—–-]/.test(word[2]) ? ' ' : '';
    if (before && attaches(word[2])) {
      out[out.length - 1] = [before[0], word[1], before[2] + space + word[2]];
    } else out.push(word);
  }
  return out;
}

/**
 * The tokens of a list of words.
 * @param {import('./types.js').Word[]} words - Repaired: in order, none overlapping
 * @param {{ case: string, punctuation: string }} style
 * @returns {Token[]}
 */
export function tokenize(words, style) {
  /** @type {Token[]} */
  const tokens = [];
  for (const [start, end, said] of attached(words)) {
    const text = shownText(said, style);
    const before = tokens[tokens.length - 1];
    let stop = endsSentence(said);
    const clause = endsClause(said);
    // An emoji after a full stop still belongs to that sentence.
    if (before?.stop && !hasLetter(said) && start - before.end < 0.25) {
      before.stop = false;
      stop = true;
    }
    if (!text) {
      // Nothing left to show (a dash on its own): what it ended still ended.
      if (before) [before.stop, before.clause] = [before.stop || stop, before.clause || clause];
      continue;
    }
    const glue = Boolean(before) && joins(before.text, text);
    const pieces = isUnspaced(text) ? unspacedPieces(text) : [text];
    const sizes = pieces.map(charCount);
    const total = sizes.reduce((sum, size) => sum + size, 0) || 1;
    let at = start;
    pieces.forEach((piece, i) => {
      const last = i === pieces.length - 1;
      const next = last ? end : at + ((end - start) * sizes[i]) / total;
      tokens.push({
        text: piece,
        start: at,
        end: next,
        glue: i > 0 || glue,
        chars: sizes[i],
        stop: last && stop,
        clause: last && clause,
        symbol: !hasLetter(piece),
        lean: last && !clause && !stop && leans(said),
        inner: i > 0,
      });
      at = next;
    });
  }
  return tokens;
}

/**
 * How much room a stretch of tokens takes on one line, spaces included.
 * @param {Token[]} tokens
 * @param {number} from
 * @param {number} to - Exclusive
 * @returns {{ chars: number, words: number }} `words` counts what is
 *   written apart: tokens glued together are one word
 */
export function measureTokens(tokens, from, to) {
  let chars = 0;
  let words = 0;
  for (let i = from; i < to; i++) {
    const apart = i === from || !tokens[i].glue;
    chars += tokens[i].chars + (apart && i > from ? 1 : 0);
    if (apart && !tokens[i].symbol) words++;
  }
  return { chars, words };
}
