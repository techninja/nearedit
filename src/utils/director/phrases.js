/**
 * Group transcript words into readable phrases — captions, and transcript
 * segments for sidecars that only carry word timestamps.
 * Isomorphic and pure.
 * @module utils/director/phrases
 */

const SENTENCE_END = /[.!?…]["')\]]?$/;
const CLAUSE_END = /[,;:]["')\]]?$/;
const ATTACHES = /^['’\-.,!?;:%)\]]/;

/**
 * @typedef {Object} Phrase
 * @property {string} text
 * @property {number} start - Start of the first word
 * @property {number} end - End of the last word
 * @property {number} first - Index of the first word
 * @property {number} last - Index of the last word
 */

/**
 * Whether a phrase should close before taking the next word.
 * @param {Phrase} phrase
 * @param {string} lastToken - Previous word as written
 * @param {{ start: number, end: number }} word - Candidate next word
 * @param {string} token - Its text
 * @param {{ maxChars: number, maxDuration: number, maxGap: number }} limits
 * @returns {boolean}
 */
function shouldBreak(phrase, lastToken, word, token, limits) {
  const { maxChars, maxDuration, maxGap } = limits;
  if (word.start - phrase.end > maxGap) return true;
  if (phrase.text.length + 1 + token.length > maxChars) return true;
  if (word.end - phrase.start > maxDuration) return true;
  if (SENTENCE_END.test(lastToken) && phrase.text.length >= maxChars * 0.4) return true;
  return CLAUSE_END.test(lastToken) && phrase.text.length >= maxChars * 0.6;
}

/**
 * Split words into phrases at pauses, sentence ends and length limits.
 * @param {{ word?: string, start: number, end: number }[]} words - Ascending
 * @param {{ maxChars?: number, maxDuration?: number, maxGap?: number }} [opts]
 * @returns {Phrase[]}
 */
export function groupPhrases(words, opts = {}) {
  const limits = { maxChars: 36, maxDuration: 4, maxGap: 0.6, ...opts };
  /** @type {Phrase[]} */
  const phrases = [];
  /** @type {Phrase|null} */
  let current = null;
  let lastToken = '';
  (words || []).forEach((word, index) => {
    const token = String(word.word ?? '').trim();
    if (!token) return;
    if (current && shouldBreak(current, lastToken, word, token, limits)) {
      phrases.push(current);
      current = null;
    }
    if (!current) {
      current = { text: token, start: word.start, end: word.end, first: index, last: index };
    } else {
      current.text += ATTACHES.test(token) ? token : ` ${token}`;
      current.end = Math.max(current.end, word.end);
      current.last = index;
    }
    lastToken = token;
  });
  if (current) phrases.push(current);
  return phrases;
}

/**
 * Sentence-like transcript segments derived from word timestamps, in the
 * sidecar `segments` shape. Used when a sidecar has words but no segments.
 * @param {{ word?: string, start: number, end: number }[]} words
 * @returns {{ id: number, start: number, end: number, text: string }[]}
 */
export function deriveSegments(words) {
  return groupPhrases(words, { maxChars: 140, maxDuration: 12, maxGap: 0.7 }).map((p, id) => ({
    id,
    start: p.start,
    end: p.end,
    text: p.text,
  }));
}

/**
 * Break a phrase into two balanced lines when it is wider than a line.
 * @param {string} text
 * @param {number} lineChars - Characters that fit on one line
 * @returns {string} The text, with at most one `\n`
 */
export function wrapLines(text, lineChars) {
  if (text.length <= lineChars || !text.includes(' ')) return text;
  const parts = text.split(' ');
  let best = 0;
  let bestDiff = Infinity;
  let run = 0;
  for (let i = 0; i < parts.length - 1; i++) {
    run += parts[i].length + (i ? 1 : 0);
    const diff = Math.abs(text.length - run - 1 - run);
    if (diff < bestDiff) {
      best = i;
      bestDiff = diff;
    }
  }
  return `${parts.slice(0, best + 1).join(' ')}\n${parts.slice(best + 1).join(' ')}`;
}
