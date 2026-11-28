/**
 * Laying out the sections of a score along the bars of a song, so that the
 * music changes where the picture does: at the timeline's turning points,
 * each moved to the nearest bar line. Stretches without a turning point are
 * divided into phrases; what the sections are called and how much happens
 * in each comes from the arc (`arc.js`) or from a plan.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § Sections. Isomorphic and pure.
 * @module utils/director/score/sections
 */

import { SECTION_ENERGY, arcLevels, sectionNames, shapeEnergy } from './arc.js';

/**
 * @typedef {{ time: number, weight: number, kind?: string, label?: string }} TurningPoint -
 *   `time`: seconds from the start of the span; `weight`: 3 a marker or a
 *   region, 2 a title or a generated scene, 1 a long shot; `kind` says which
 * @typedef {{ name: string, from: number, to: number, energy: number }} Section - Bars;
 *   `to` is not included
 * @typedef {{ name: string, share: number, energy?: number }} AskedSection - A
 *   section of a plan: its share of the length
 */

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
const leastBars = (barSeconds) => Math.max(2, Math.ceil(MIN_SECONDS / barSeconds - 1e-9));

/**
 * The bars at which sections may begin, from the timeline's turning points:
 * the weightiest first, each on its nearest bar line, none too close to
 * another or to either end.
 * @param {number} bars
 * @param {number} barSeconds
 * @param {TurningPoint[]} points
 * @returns {number[]} Ascending
 */
export function turningBars(bars, barSeconds, points) {
  const least = leastBars(barSeconds);
  const sorted = [...points].sort((a, b) => b.weight - a.weight || a.time - b.time);
  /** @type {number[]} */
  const taken = [];
  for (const point of sorted) {
    const bar = Math.round(point.time / barSeconds);
    if (bar < least || bar > bars - Math.max(3, least) || taken.length >= MAX_SECTIONS - 1)
      continue;
    if (taken.every((other) => Math.abs(other - bar) >= least)) taken.push(bar);
  }
  return taken.sort((a, b) => a - b);
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
 * a turning point still has a form. A phrase is four bars, or eight or
 * sixteen at a faster tempo — the first of those to last eleven seconds;
 * shorter when the song would otherwise have fewer than three sections,
 * longer when it would have too many.
 * @param {number[]} cuts - Ascending
 * @param {number} bars
 * @param {number} barSeconds
 * @returns {number[]} The cuts and the phrase lines between them, ascending
 */
export function phraseBars(cuts, bars, barSeconds) {
  let phrase = 4;
  while (phrase * barSeconds < PHRASE_SECONDS && phrase < 64) phrase *= 2;
  if (divide(cuts, bars, phrase).length < 2 && phrase > 4) phrase /= 2;
  while (divide(cuts, bars, phrase).length >= MAX_SECTIONS && phrase <= bars) phrase *= 2;
  return divide(cuts, bars, phrase);
}

/**
 * Where the sections of a plan begin: at their share of the length, on the
 * picture's turning point when one is within two bars.
 * @param {AskedSection[]} asked
 * @param {number} bars
 * @param {number[]} turning - Bars of the turning points
 * @param {number} least - Fewest bars of a section
 * @returns {number[]}
 */
function askedBars(asked, bars, turning, least) {
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

/**
 * Lay out the sections of a score.
 * @param {{ bars: number, barSeconds: number, points?: TurningPoint[], energy?: number,
 *   asked?: AskedSection[] }} input - `asked`: the sections of a plan
 * @returns {Section[]} They cover `0 … bars` without gaps
 */
export function layoutSections({ bars, barSeconds, points = [], energy = 0.5, asked = [] }) {
  const turning = turningBars(bars, barSeconds, points);
  const cuts = asked.length
    ? askedBars(asked, bars, turning, leastBars(barSeconds))
    : phraseBars(turning, bars, barSeconds);
  const edges = [0, ...cuts, bars];
  const names = sectionNames(edges.length - 1);
  const levels = arcLevels(names);
  const total = asked.reduce((sum, section) => sum + section.share, 0);
  return edges.slice(0, -1).map((from, i) => {
    const to = edges[i + 1];
    if (!asked.length) return { name: names[i], from, to, energy: shapeEnergy(levels[i], energy) };
    // The section of the plan that the middle of this stretch falls into.
    let [end, plan] = [0, asked[asked.length - 1]];
    for (const section of asked) {
      end += (section.share / total) * bars;
      if ((from + to) / 2 < end) {
        plan = section;
        break;
      }
    }
    const level = Number.isFinite(plan.energy) ? plan.energy : (SECTION_ENERGY[plan.name] ?? 0.55);
    return { name: plan.name, from, to, energy: shapeEnergy(level, energy) };
  });
}
