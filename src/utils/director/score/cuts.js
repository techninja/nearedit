/**
 * Where the sections of a score begin: on the bar lines nearest the
 * timeline's turning points — a marker wherever it is, titles, scenes and
 * long shots only a phrase apart — and, where a stretch has no turning
 * point, on the lines between its phrases.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § Sections. Isomorphic and pure.
 * @module utils/director/score/cuts
 */

/** @typedef {import('./sections.js').TurningPoint} TurningPoint */
/** @typedef {import('./sections.js').AskedSection} AskedSection */

/** Most sections a score has. */
export const MAX_SECTIONS = 24;
/** A section lasts at least this many seconds — and two bars; the last one three. */
const MIN_SECONDS = 4;
/** A phrase lasts at least this many seconds. */
const PHRASE_SECONDS = 11;

/**
 * @param {number} barSeconds
 * @returns {number} Fewest bars a section has
 */
export const leastBars = (barSeconds) => Math.max(2, Math.ceil(MIN_SECONDS / barSeconds - 1e-9));

/**
 * @param {number} barSeconds
 * @returns {number} Bars of a phrase: four, or eight or sixteen at a
 *   faster tempo — the first of those to last eleven seconds
 */
export function phraseOf(barSeconds) {
  let phrase = 4;
  while (phrase * barSeconds < PHRASE_SECONDS && phrase < 64) phrase *= 2;
  return phrase;
}

/**
 * The bars at which sections begin because the timeline turns there: each
 * turning point on its nearest bar line, the weightiest first. A marker
 * begins a section wherever it is, short of four seconds from another or
 * from an end; titles, scenes and long shots only a phrase apart — a
 * montage or a run of captions does not make a section per clip.
 * @param {number} bars
 * @param {number} barSeconds
 * @param {TurningPoint[]} points
 * @returns {{ bar: number, weight: number }[]} Ascending
 */
export function turningBars(bars, barSeconds, points) {
  const least = leastBars(barSeconds);
  const phrase = phraseOf(barSeconds);
  const sorted = [...points].sort((a, b) => b.weight - a.weight || a.time - b.time);
  /** @type {{ bar: number, weight: number }[]} */
  const taken = [];
  for (const { time, weight } of sorted) {
    const bar = Math.round(time / barSeconds);
    const apart = weight >= 3 ? least : Math.max(least, phrase);
    const edge = weight >= 3 ? least : Math.max(least, phrase / 2);
    if (bar < edge || bar > bars - Math.max(3, edge) || taken.length >= MAX_SECTIONS - 1) continue;
    if (taken.every((other) => Math.abs(other.bar - bar) >= apart)) taken.push({ bar, weight });
  }
  return taken.sort((a, b) => a.bar - b.bar);
}

/**
 * The cuts, and the lines between them that divide every stretch longer
 * than a phrase and a half into phrases.
 * @param {number[]} cuts - Ascending
 * @param {number} bars
 * @param {number} phrase - Bars
 * @returns {number[]} Ascending
 */
function divide(cuts, bars, phrase) {
  const all = [];
  const edges = [0, ...cuts, bars];
  for (let i = 0; i + 1 < edges.length; i++) {
    const [from, to] = [edges[i], edges[i + 1]];
    if (i > 0) all.push(from);
    const pieces = to - from > phrase * 1.5 ? Math.round((to - from) / phrase) : 1;
    const room = Math.max(phrase / 2, to === bars ? 3 : 2);
    for (let k = 1; k < pieces && to - (from + k * phrase) >= room; k++) {
      all.push(from + k * phrase);
    }
  }
  return all;
}

/**
 * Divide the stretches between cuts into phrases, so that a stretch without
 * a turning point still has a form. With no cuts at all, a song that would
 * have fewer than three sections gets phrases half as long; a long song
 * gets longer ones rather than more sections than a score may have.
 * @param {number[]} cuts - Ascending
 * @param {number} bars
 * @param {number} barSeconds
 * @returns {number[]} The cuts and the phrase lines between them, ascending
 */
export function phraseBars(cuts, bars, barSeconds) {
  let phrase = phraseOf(barSeconds);
  if (!cuts.length && divide(cuts, bars, phrase).length < 2 && phrase > 4) phrase /= 2;
  while (divide(cuts, bars, phrase).length >= MAX_SECTIONS && phrase <= bars) phrase *= 2;
  return divide(cuts, bars, phrase);
}

/**
 * Where the sections of a plan begin: at their share of the length, on the
 * picture's turning point when one is within two bars.
 * @param {AskedSection[]} asked
 * @param {number} bars
 * @param {number[]} turning - Bars of the turning points
 * @param {number} barSeconds
 * @returns {number[]}
 */
export function askedBars(asked, bars, turning, barSeconds) {
  const least = leastBars(barSeconds);
  const total = asked.reduce((sum, section) => sum + section.share, 0);
  /** @type {number[]} */
  const cuts = [];
  let share = 0;
  for (const section of asked.slice(0, -1)) {
    share += section.share;
    const wanted = Math.round((share / total) * bars);
    const near = turning.find((bar) => Math.abs(bar - wanted) <= 2) ?? wanted;
    const last = cuts.length ? cuts[cuts.length - 1] : 0;
    if (near - last >= least && near <= bars - Math.max(3, least)) cuts.push(near);
  }
  return cuts;
}
