/**
 * Auto b-roll — deterministic cover for what the plan left bare:
 * - narration with no picture is covered end to end with footage and
 *   stills that match what is being said;
 * - jump cuts in a talking head (where a pause was removed) get a short
 *   cutaway laid across them (see cutaways.js).
 * Material is matched by keywords against tags, description and filename
 * and rotated so nothing repeats before everything has been used.
 * @module api/director/assemble/autoBroll
 */

import { matchScore, tokenize } from '#utils/director/keywords.js';
import { toFrames } from '#utils/director/snap.js';
import { lengthOnBeat } from './beats.js';
import { cutawayWindows } from './cutaways.js';
import { uncovered } from './fragment.js';
import { spokenText } from './spine.js';
import { placeBroll } from './visuals.js';

/**
 * @typedef {import('./fragment.js').Fragment} Fragment
 * @typedef {import('./options.js').AssembleOptions} AssembleOptions
 * @typedef {import('./spine.js').SpineItem} SpineItem
 * @typedef {ReturnType<import('./options.js').createStats>} Stats
 */

/**
 * The pool file that best fits some spoken text; ties go to the least used.
 * @param {AssembleOptions} opts
 * @param {string} text - What is said while it is on screen
 * @param {Stats} stats
 * @returns {import('../context/mediaInfo.js').MediaInfo|null}
 */
export function chooseBroll(opts, text, stats) {
  const query = tokenize(text);
  let best = null;
  let bestRank = -Infinity;
  for (const media of opts.pool) {
    const about = `${media.tags.join(' ')} ${media.description} ${media.relativePath}`;
    const used = stats.uses.get(media.filePath) || 0;
    const rank = matchScore(query, about).score - used * 2;
    if (rank > bestRank) [best, bestRank] = [media, rank];
  }
  return best;
}

/**
 * Fill [startF, endF) of the B-roll track with shots from the pool.
 * @param {Fragment} fragment
 * @param {SpineItem[]} items
 * @param {[number, number]} gap
 * @param {AssembleOptions} opts
 * @param {number[]} beatsF
 * @param {Stats} stats
 */
function fill(fragment, items, [startF, endF], opts, beatsF, stats) {
  const { fps } = opts;
  const shotF = toFrames(opts.shotDuration, fps);
  const minF = Math.max(2, toFrames(0.8, fps));
  let cursorF = startF;
  for (let guard = 0; endF - cursorF >= 2 && guard < 1000; guard++) {
    let wantF = Math.min(shotF, endF - cursorF);
    if (endF - cursorF - wantF < minF) wantF = endF - cursorF;
    else wantF = lengthOnBeat(cursorF, wantF, beatsF, minF, endF - cursorF - minF);
    const media = chooseBroll(opts, spokenText(items, cursorF, cursorF + wantF, fps), stats);
    if (!media) return;
    const part = { media, start: null, end: null, duration: null, basis: 'auto' };
    const got = placeBroll(fragment, /** @type {any} */ (part), cursorF, wantF, opts, stats);
    if (got < 2) return;
    stats.autoBroll++;
    cursorF += got;
  }
}

/**
 * Run both auto b-roll passes.
 * @param {Fragment} fragment
 * @param {SpineItem[]} items
 * @param {AssembleOptions} opts
 * @param {number[]} beatsF
 * @param {Stats} stats
 */
export function autoBroll(fragment, items, opts, beatsF, stats) {
  const endF = fragment.endF();
  const bare = items
    .flatMap((i) => i.pieces)
    .filter((p) => !p.hasPicture)
    .map((p) => /** @type {[number, number]} */ ([p.startF, p.endF]));
  // Join the bare pieces into stretches, then leave out what a visual covers.
  const gaps = uncovered(0, endF, uncovered(0, endF, bare)).flatMap(([from, to]) =>
    uncovered(from, to, fragment.spans('broll')),
  );
  if (gaps.length && !opts.pool.length) {
    stats.notes.push('Some speech has no picture and the project has no b-roll to cover it.');
    return;
  }
  for (const gap of gaps) fill(fragment, items, gap, opts, beatsF, stats);

  for (const window of cutawayWindows(items, toFrames(opts.shotDuration, opts.fps), opts.fps)) {
    // A cutaway is a garnish: stop before the same few clips keep coming back.
    if (opts.pool.every((m) => (stats.uses.get(m.filePath) || 0) >= 2)) break;
    if (fragment.isFree('broll', window[0], window[1]))
      fill(fragment, items, window, opts, beatsF, stats);
  }
}
