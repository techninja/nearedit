/**
 * Small text tools the brief reader and the name matcher share: quotes,
 * the caption after a separator, tidy cut-off text, and the words of a
 * name as comparable tokens. Isomorphic and pure.
 * @module utils/director/web/words
 */

/** Opening quote → its closing quote. */
const QUOTES = { '"': '"', "'": "'", '“': '”', '‘': '’', '`': '`', '«': '»' };

/** What separates an instruction from its caption, with the spaces around it. */
const SEPARATOR = /\s+\|\s+|\s*—\s*|\s+–\s+|\s+--\s+/g;

/** Words that say nothing about which thing is meant. */
const FILLER = new Set(
  (
    'a an the of for to and or in on at with by from your our my its their this that these ' +
    'those is are be it as you we us'
  ).split(' '),
);

/**
 * Collapse white space and cut a text that is too long at a word.
 * @param {unknown} text
 * @param {number} limit
 * @returns {string}
 */
export function tidy(text, limit) {
  const clean = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), limit / 2)).trimEnd()}…`;
}

/**
 * The quoted text a string starts with.
 * @param {string} text
 * @returns {{ inner: string, rest: string }|null} What is between the quotes
 *   and what follows them; null when the string does not open with a quote
 *   that closes
 */
export function leadingQuote(text) {
  const close = QUOTES[text[0]];
  if (!close) return null;
  const end = text.indexOf(close, 1);
  // An apostrophe inside a word ("don't") does not end a quotation.
  if (end < 1 || (close === "'" && /\w/.test(text[end + 1] || ''))) return null;
  return { inner: text.slice(1, end), rest: text.slice(end + 1).trim() };
}

/**
 * A name or a text without the quotes around it.
 * @param {string} text
 * @returns {string}
 */
export function unquote(text) {
  const clean = text.trim();
  const quoted = leadingQuote(clean);
  return quoted && !quoted.rest ? quoted.inner.trim() : clean;
}

/**
 * Split a line at its caption separator — ` | `, an em dash, a spaced en
 * dash or ` -- ` — leaving separators inside quotes alone.
 * @param {string} line
 * @returns {{ head: string, caption: string }}
 */
export function splitCaption(line) {
  let close = '';
  const outside = [...line].map((char, i) => {
    const inside = close !== '';
    if (inside && char === close && !(char === "'" && /\w/.test(line[i + 1] || ''))) close = '';
    else if (!inside && QUOTES[char] && !/\w/.test(line[i - 1] || '')) close = QUOTES[char];
    return !inside && close === '';
  });
  // A quote that never closes is not a quotation: nothing is protected.
  const guard = close === '' ? outside : outside.map(() => true);
  for (const cut of line.matchAll(SEPARATOR)) {
    if (!guard[cut.index]) continue;
    return {
      head: line.slice(0, cut.index).trim(),
      caption: line.slice(cut.index + cut[0].length).trim(),
    };
  }
  return { head: line.trim(), caption: '' };
}

/**
 * A text as it is compared: lower case, letters and digits only.
 * @param {string} text
 * @returns {string}
 */
export function plain(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * One word as it is compared: a plural reads like its singular.
 * @param {string} word - Lower case
 * @returns {string}
 */
function stem(word) {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/**
 * The words of a name that tell things apart, as comparable tokens.
 * @param {string} text
 * @returns {string[]} Without articles and other filler — unless filler is all there is
 */
export function tokens(text) {
  const all = plain(text).split(' ').filter(Boolean);
  const telling = all.filter((word) => !FILLER.has(word));
  return (telling.length ? telling : all).map(stem);
}

/**
 * @param {string} text
 * @returns {number} Words in a text
 */
export const wordCount = (text) => (String(text || '').match(/\S+/g) || []).length;
