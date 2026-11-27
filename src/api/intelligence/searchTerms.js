/**
 * Text helpers for media search: query terms and result excerpts.
 * @module api/intelligence/searchTerms
 */

/**
 * Split a query into distinct lower-case terms. Surrounding punctuation is
 * dropped, so "dog!" and "(dog)" both search for "dog".
 * @param {string} query
 * @returns {string[]}
 */
export function parseQuery(query) {
  const words = String(query || '')
    .toLowerCase()
    .split(/\s+/);
  const bare = words.map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''));
  return [...new Set(bare.filter(Boolean))];
}

/**
 * Cut a short excerpt around the first occurrence of any term.
 * @param {string} text
 * @param {string[]} terms
 * @param {number} [radius]
 * @returns {string}
 */
export function excerpt(text, terms, radius = 70) {
  const lower = text.toLowerCase();
  const hits = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0);
  const at = hits.length ? Math.min(...hits) : 0;
  const from = Math.max(0, at - radius);
  const to = Math.min(text.length, at + radius);
  const body = text.slice(from, to).replace(/\s+/g, ' ').trim();
  return `${from > 0 ? '…' : ''}${body}${to < text.length ? '…' : ''}`;
}
