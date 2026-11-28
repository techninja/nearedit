/**
 * Words — the timed words captions are made of, as `[start, end, text]`
 * triples, and the repairs a transcript needs before it can be shown:
 * transcribers hand out words of no length, words that overlap, words out
 * of order, and now and then a missing time. Stored words are untrusted
 * too, so everything is bounded. Nothing here throws.
 * Isomorphic and pure. Contract: docs/app-spec/CAPTIONS.md § In the document.
 * @module utils/captions/words
 */

/** @typedef {import('./types.js').Word} Word */

/** Most words one clip or file is captioned from. */
export const MAX_WORDS = 20000;
/** Longest word kept, characters. */
export const MAX_WORD_CHARS = 80;
/** Words that start closer together than this share their time, seconds. */
const TOGETHER = 0.02;

/**
 * How long a word of unknown length is taken to last.
 * @param {string} text
 * @returns {number} Seconds
 */
const guess = (text) => Math.max(0.15, Math.min(0.6, 0.06 * text.length + 0.06));

/**
 * One stored entry as a triple. Times that cannot be used come back NaN.
 * @param {any} entry - `[start, end, text]`, or `{ start, end, word | text }`
 * @returns {Word|null} null when it says nothing
 */
export function toWord(entry) {
  if (entry === null || typeof entry !== 'object') return null;
  const [start, end, said] = Array.isArray(entry)
    ? entry
    : [entry.start, entry.end, entry.word ?? entry.text];
  if (typeof said !== 'string' && typeof said !== 'number') return null;
  let text = String(said).replace(/\s+/g, ' ').trim();
  if (text.length > MAX_WORD_CHARS) text = [...text].slice(0, MAX_WORD_CHARS).join('');
  if (!text) return null;
  const time = (/** @type {unknown} */ v) =>
    typeof v === 'number' && Number.isFinite(v) ? v : NaN;
  return [time(start), time(end), text];
}

/**
 * A clip's `captions` block as a document stores it: whether captions are
 * on, and the clip's own words when it carries any — at most `MAX_WORDS`,
 * each with a start, in time order, times to the millisecond.
 * @param {unknown} raw
 * @returns {import('./types.js').CaptionsBlock}
 */
export function normalizeCaptions(raw) {
  const block = /** @type {any} */ (raw !== null && typeof raw === 'object' ? raw : {});
  const on = block.on === true;
  if (!Array.isArray(block.words)) return { on };
  const ms = (/** @type {number} */ v) => Math.round(v * 1000) / 1000;
  /** @type {Word[]} */
  const words = [];
  for (const entry of block.words) {
    const word = toWord(entry);
    if (!word || Number.isNaN(word[0])) continue;
    const end = word[1] > word[0] ? word[1] : word[0];
    words.push([ms(word[0]), ms(end), word[2]]);
    if (words.length >= MAX_WORDS) break;
  }
  words.sort((a, b) => a[0] - b[0]);
  return words.length ? { on, words } : { on };
}

/**
 * Give the words `from..to`, which start together, the time between
 * `start` and `end`, each a share by its length.
 * @param {Word[]} words
 * @param {number} from
 * @param {number} to - Exclusive
 * @param {number} start
 * @param {number} end
 */
function share(words, from, to, start, end) {
  let total = 0;
  for (let i = from; i < to; i++) total += words[i][2].length + 1;
  let at = start;
  for (let i = from; i < to; i++) {
    const next = at + ((end - start) * (words[i][2].length + 1)) / total;
    words[i] = [at, i === to - 1 ? end : next, words[i][2]];
    at = next;
  }
}

/**
 * Words fit to show: in time order, each with a length of its own, none
 * overlapping the next. A word without a start follows the one before it;
 * one without an end, or of no length, lasts until the next word or as long
 * as a word of its length usually does; words that start together share the
 * time until the next one.
 * @param {unknown} words - Triples or `{ start, end, word }` objects
 * @returns {Word[]} New triples; the input is not changed
 */
export function repairWords(words) {
  /** @type {Word[]} */
  const list = [];
  let after = 0;
  for (const entry of Array.isArray(words) ? words : []) {
    const word = toWord(entry);
    if (!word) continue;
    if (Number.isNaN(word[0])) word[0] = Number.isNaN(word[1]) ? after : word[1] - guess(word[2]);
    after = word[1] > word[0] ? word[1] : word[0];
    list.push(word);
    if (list.length >= MAX_WORDS) break;
  }
  list.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < list.length; ) {
    const start = list[i][0];
    let to = i + 1;
    let end = list[i][1] > start ? list[i][1] : NaN;
    let lasting = guess(list[i][2]);
    while (to < list.length && list[to][0] - start < TOGETHER) {
      if (list[to][1] > start) end = Number.isNaN(end) ? list[to][1] : Math.max(end, list[to][1]);
      lasting += guess(list[to][2]);
      to++;
    }
    if (Number.isNaN(end)) end = start + lasting;
    if (to < list.length) end = Math.min(end, list[to][0]);
    share(list, i, to, start, end);
    i = to;
  }
  return list;
}
