/**
 * Cutting a stretch of speech into caption groups. A stretch (no long
 * pause, no sentence end inside) is divided so that no group exceeds the
 * word and character limits, and of all such divisions the one that reads
 * best is taken: few groups, of even length, broken after a comma or at a
 * small pause rather than in the middle of a phrase, and no short word left
 * on its own. The same idea then balances two lines.
 * Isomorphic and pure. Contract: docs/app-spec/CAPTIONS.md § Groups and timing.
 * @module utils/captions/partition
 */

import { measureTokens } from './tokens.js';

/** @typedef {import('./tokens.js').Token} Token */

/** A word this short should not stand alone, characters (its punctuation counted). */
const SHORT = 5;
/** A word this short should not even when that means breaking inside a clause. */
const TINY = 3;
/** What every group costs: fewer groups are better. */
const GROUP_COST = 1;
/** What an empty group would cost on top; a full one costs nothing more. */
const SLACK_COST = 0.5;
/** What leaving a tiny word alone costs; a short one costs half. */
const ORPHAN_COST = 1.5;
/** What ending a group on a word that leans on the next costs, or cutting through a word. */
const LEAN_COST = 0.35;
/** What breaking after a comma wins: a little more than the group it adds. */
const CLAUSE_GAIN = 1.25;
/** What breaking at a pause as long as the style's limit wins. */
const PAUSE_GAIN = 0.4;

/**
 * Where a stretch is best cut into groups.
 * @param {Token[]} tokens - One stretch
 * @param {{ words: number, chars: number, pause: number }} limits
 * @returns {number[]} The index each group starts at, ascending, from 0
 */
export function partition(tokens, limits) {
  const n = tokens.length;
  /** @type {number[]} best[i]: cost of the best division of the first i tokens */
  const best = new Array(n + 1).fill(Infinity);
  /** @type {number[]} from[i]: where the last group of that division starts */
  const from = new Array(n + 1).fill(0);
  best[0] = 0;
  for (let i = 1; i <= n; i++) {
    // What a break after token i - 1 wins (the stretch's own end wins nothing).
    let gain = 0;
    if (i < n) {
      const last = tokens[i - 1];
      const gap = (tokens[i].start - last.end) / limits.pause;
      gain = PAUSE_GAIN * Math.max(0, Math.min(1, gap));
      if (last.clause) gain += CLAUSE_GAIN;
      else if (last.lean || tokens[i].inner) gain -= LEAN_COST;
    }
    let chars = 0;
    let words = 0;
    for (let j = i - 1; j >= 0; j--) {
      // The group grows backwards: token j joins the front of j + 1 .. i - 1.
      const next = j < i - 1 ? tokens[j + 1] : null;
      chars += tokens[j].chars + (next && !next.glue ? 1 : 0);
      words += (tokens[j].symbol ? 0 : 1) - (next?.glue && !next.symbol ? 1 : 0);
      // A single token is always a group, however long it is.
      if (i - j > 1 && (words > limits.words || chars > limits.chars)) break;
      const slack = Math.max(0, 1 - chars / limits.chars);
      const alone = words === 1 && chars <= SHORT && n > 1 && limits.words > 1;
      const orphan = alone ? (chars <= TINY ? ORPHAN_COST : ORPHAN_COST / 2) : 0;
      const cost = best[j] + GROUP_COST + SLACK_COST * slack * slack + orphan - gain;
      if (cost < best[i]) [best[i], from[i]] = [cost, j];
    }
  }
  /** @type {number[]} */
  const starts = [];
  for (let i = n; i > 0; i = from[i]) starts.unshift(from[i]);
  return starts;
}

/**
 * How a group's words are best set in lines: one line when it is short
 * enough or one line is all the style allows, otherwise two of even length
 * — breaking after a comma when that is nearly as even, and with the
 * shorter line on top when it is a tie.
 * @param {Token[]} tokens - One group
 * @param {{ chars: number, lines: number }} limits
 * @returns {number[]} How many tokens each line holds
 */
export function balanceLines(tokens, limits) {
  const whole = measureTokens(tokens, 0, tokens.length).chars;
  if (limits.lines < 2 || tokens.length < 2 || whole <= Math.ceil(limits.chars / limits.lines)) {
    return [tokens.length];
  }
  let at = 0;
  let least = Infinity;
  for (let i = 1; i < tokens.length; i++) {
    const top = measureTokens(tokens, 0, i).chars;
    const bottom = measureTokens(tokens, i, tokens.length).chars;
    const uneven = Math.abs(top - bottom) + (top > bottom ? 0.5 : 0);
    const poor = tokens[i - 1].lean || tokens[i].inner ? 1.5 : 0;
    const score = uneven + poor - (tokens[i - 1].clause ? 2 : 0);
    if (score < least) [least, at] = [score, i];
  }
  return [at, tokens.length - at];
}
