/**
 * Keyword matching for finding material by prompt — tokenising, stop words
 * and forgiving token comparison. No language model involved.
 * Isomorphic and pure.
 * @module utils/director/keywords
 */

const STOPWORDS = new Set(
  `a an and are as at be but by for from had has have he her his i if in into is it its me my
   of on or our she so than that the their them then there these they this to up us was we
   were what when where which who will with you your
   add insert put place show showing shows use using find get give make want need like
   some any more here now please bit little short long nice good
   clip clips shot shots video videos footage broll roll cutaway cutaways scene scenes
   picture pictures image images photo photos over under after before during`.split(/\s+/),
);

/**
 * Distinct lower-case content words of a text, stop words removed.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text) {
  const words = String(text || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  return [...new Set(words)];
}

/**
 * How well two tokens match: 1 for identical, 0.6 when one extends the
 * other by a short ending ("dog"/"dogs", "play"/"playing"), else 0.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function tokenMatch(a, b) {
  if (a === b) return 1;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 3 || long.length - short.length > 4) return 0;
  return long.startsWith(short) ? 0.6 : 0;
}

/**
 * Score a text against query tokens: each query token contributes its best
 * match among the text's tokens.
 * @param {string[]} queryTokens - From `tokenize`
 * @param {string|string[]} text - Raw text, or an already tokenised list
 * @returns {{ score: number, matched: string[] }}
 */
export function matchScore(queryTokens, text) {
  const tokens = Array.isArray(text) ? text : tokenize(text);
  let score = 0;
  const matched = [];
  for (const q of queryTokens) {
    let best = 0;
    for (const t of tokens) {
      best = Math.max(best, tokenMatch(q, t));
      if (best === 1) break;
    }
    if (best > 0) matched.push(q);
    score += best;
  }
  return { score, matched };
}
