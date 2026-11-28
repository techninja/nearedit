/**
 * Caption groups — the words that are on screen together. Words are
 * repaired, put into the style's capitals and punctuation, cut into
 * stretches at long pauses and sentence ends, and each stretch divided into
 * groups within the style's word and character limits. Nothing is stored:
 * groups follow from the words and the style, and are worked out once for
 * each pair.
 * Isomorphic and pure. Contract: docs/app-spec/CAPTIONS.md § Groups and timing.
 * @module utils/captions/groups
 */

import { balanceLines, partition } from './partition.js';
import { resolveCaptionStyle } from './resolve.js';
import { tokenize } from './tokens.js';
import { repairWords } from './words.js';

/**
 * @typedef {import('./types.js').CaptionGroup} CaptionGroup
 * @typedef {import('./tokens.js').Token} Token
 */

/** @type {WeakMap<object, WeakMap<object, CaptionGroup[]>>} Groups by words, then by style */
const memo = new WeakMap();

/**
 * One group from its tokens.
 * @param {Token[]} tokens
 * @param {{ chars: number, lines: number }} limits
 * @returns {Omit<CaptionGroup, 'index' | 'until'>}
 */
function build(tokens, limits) {
  const lines = balanceLines(tokens, limits);
  let text = '';
  let line = 0;
  let left = lines[0];
  for (const token of tokens) {
    if (left === 0) {
      text += '\n';
      left = lines[++line];
    } else if (text && !token.glue) text += ' ';
    text += token.text;
    left--;
  }
  return {
    start: tokens[0].start,
    end: tokens[tokens.length - 1].end,
    words: tokens.map(({ text: shown, start, end, glue }) => ({ text: shown, start, end, glue })),
    lines,
    text,
  };
}

/**
 * Cut tokens where a group may never continue: after a sentence, and at a
 * pause as long as the style's.
 * @param {Token[]} tokens
 * @param {number} pause - Seconds
 * @returns {Token[][]} Stretches
 */
function stretches(tokens, pause) {
  /** @type {Token[][]} */
  const out = [];
  tokens.forEach((token, i) => {
    const before = tokens[i - 1];
    if (!before || before.stop || token.start - before.end >= pause - 1e-9) out.push([]);
    out[out.length - 1].push(token);
  });
  return out;
}

/**
 * The groups of a list of words in a style, in time order. A group appears
 * with its first word and stays `hold` seconds after its last, or until the
 * next one begins.
 * @param {unknown} words - `[start, end, text]` triples (or `{ start, end,
 *   word }` objects); badly timed words are repaired first
 * @param {unknown} [style] - A stored or resolved caption style
 * @returns {CaptionGroup[]} Frozen. The same words and style objects give
 *   the same array
 */
export function captionGroups(words, style) {
  const resolved = resolveCaptionStyle(style);
  const key = words !== null && typeof words === 'object' ? words : null;
  const known = key && memo.get(key)?.get(resolved);
  if (known) return known;
  const limits = resolved.group;
  /** @type {CaptionGroup[]} */
  const groups = [];
  for (const stretch of stretches(tokenize(repairWords(words), resolved), limits.pause)) {
    const starts = partition(stretch, limits);
    starts.forEach((from, i) => {
      const group = build(stretch.slice(from, starts[i + 1] ?? stretch.length), limits);
      groups.push({ ...group, index: groups.length, until: group.end + resolved.hold });
    });
  }
  groups.forEach((group, i) => {
    const next = groups[i + 1];
    if (next && next.start < group.until) group.until = next.start;
    Object.freeze(group);
  });
  Object.freeze(groups);
  if (key) {
    if (!memo.has(key)) memo.set(key, new WeakMap());
    memo.get(key).set(resolved, groups);
  }
  return groups;
}
