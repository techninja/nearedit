/**
 * Laying out the sections of a score along the bars of a song, so that the
 * music changes where the picture does: the sections begin on the cuts
 * `cuts.js` finds — turning points and phrase lines — and what they are
 * called and how much happens in each comes from the arc (`arc.js`) or
 * from a plan.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § Sections. Isomorphic and pure.
 * @module utils/director/score/sections
 */

import { SECTION_ENERGY, arcOf, shapeEnergy } from './arc.js';
import { askedBars, phraseBars, phraseOf, turningBars } from './cuts.js';

/**
 * @typedef {{ time: number, weight: number, kind?: string, label?: string }} TurningPoint -
 *   `time`: seconds from the start of the span; `weight`: 3 a marker or a
 *   region, 2 a title or a generated scene, 1 a long shot; `kind` says which
 * @typedef {{ name: string, from: number, to: number, energy: number }} Section - Bars;
 *   `to` is not included
 * @typedef {{ name: string, share: number, energy?: number }} AskedSection - A
 *   section of a plan: its share of the length
 */

/**
 * The section of a plan that a stretch of bars belongs to: the one its
 * middle falls into.
 * @param {AskedSection[]} asked
 * @param {number} middle - Bar
 * @param {number} bars
 * @returns {AskedSection}
 */
function planAt(asked, middle, bars) {
  const total = asked.reduce((sum, section) => sum + section.share, 0);
  let end = 0;
  for (const section of asked) {
    end += (section.share / total) * bars;
    if (middle < end) return section;
  }
  return asked[asked.length - 1];
}

/**
 * Lay out the sections of a score.
 * @param {{ bars: number, barSeconds: number, points?: TurningPoint[], energy?: number,
 *   asked?: AskedSection[] }} input - `points`: the turning points of the
 *   timeline; `energy`: the parameter, 0 … 1; `asked`: the sections of a plan
 * @returns {Section[]} They cover `0 … bars` without gaps
 */
export function layoutSections({ bars, barSeconds, points = [], energy = 0.5, asked = [] }) {
  const turning = turningBars(bars, barSeconds, points);
  const lines = turning.map((point) => point.bar);
  const cuts = asked.length
    ? askedBars(asked, bars, lines, barSeconds)
    : phraseBars(lines, bars, barSeconds);
  const edges = [0, ...cuts, bars];
  if (asked.length) {
    return edges.slice(0, -1).map((from, i) => {
      const plan = planAt(asked, (from + edges[i + 1]) / 2, bars);
      const level = Number.isFinite(plan.energy) ? plan.energy : SECTION_ENERGY[plan.name];
      return {
        name: plan.name,
        from,
        to: edges[i + 1],
        energy: shapeEnergy(level ?? 0.55, energy),
      };
    });
  }
  const marked = turning
    .filter((point) => point.weight >= 3)
    .map((point) => edges.indexOf(point.bar));
  const { names, levels } = arcOf(edges.length - 1, marked);
  // An opening longer than a phrase is no intro: it would be a long wait.
  if (names[0] === 'intro' && edges[1] > phraseOf(barSeconds)) {
    [names[0], levels[0]] = ['verse', SECTION_ENERGY.verse];
  }
  return edges.slice(0, -1).map((from, i) => ({
    name: names[i],
    from,
    to: edges[i + 1],
    energy: shapeEnergy(levels[i], energy),
  }));
}
