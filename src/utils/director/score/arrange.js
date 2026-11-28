/**
 * The arrangement of a score: in which bars each part plays. Every part is
 * a loop that starts again wherever it comes in, so all loops stop one bar
 * before a section ends — that bar is the turnaround, with a fill when
 * drums follow — and begin together on the first bar of the next: the
 * music changes exactly on the section line, and every part is at the top
 * of the progression when it does. The last two bars of the song are the
 * turnaround and the final chord.
 * Reference: docs/app-spec/DIRECTOR-SCORE.md § The song. Isomorphic and pure.
 * @module utils/director/score/arrange
 */

/** @typedef {import('./sections.js').Section} Section */

/**
 * @typedef {Object} Arrangement
 * @property {(from: number) => number[][]} loops - Bar ranges of a looped
 *   part that joins at an energy
 * @property {(from: number) => number[][]} layers - The same for a drum
 *   layer, which plays through a turnaround that has no fill
 * @property {(from: number) => number[][]} turns - Bar ranges of a cadence
 *   part: the turnaround bars around the sections it plays in, and the
 *   closing bars of the song
 * @property {() => number[][]} fills - Bar ranges of the fill part
 */

/**
 * Bar ranges as a song stores them: those that touch are one.
 * @param {number[][]} ranges - In order
 * @returns {number[][]}
 */
function joined(ranges) {
  /** @type {number[][]} */
  const out = [];
  for (const [from, to] of ranges) {
    const last = out[out.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}

/**
 * @param {Section[]} sections - Covering `0 … bars`
 * @param {number} bars - Of the song
 * @param {number} drumsFrom - Energy at which the first drum layer joins
 * @returns {Arrangement}
 */
export function arrange(sections, bars, drumsFrom) {
  const last = sections.length - 1;
  /** Where the loops of a section stop: before its turnaround bar. */
  const loopEnd = (/** @type {number} */ i) => (i === last ? bars - 2 : sections[i].to - 1);
  const drums = (/** @type {number} */ i) => sections[i].energy >= drumsFrom;
  /** Whether a fill leads out of a section: into drums, or into the final chord. */
  const fill = (/** @type {number} */ i) => drums(i === last ? i : i + 1);
  /**
   * @param {number} from
   * @param {(i: number) => number} end
   * @returns {number[][]}
   */
  const where = (from, end) =>
    sections
      .map((section, i) => [section.from, section.energy >= from ? end(i) : -1])
      .filter(([start, stop]) => stop > start);
  return {
    loops: (from) => where(from, loopEnd),
    layers: (from) => joined(where(from, (i) => (fill(i) ? loopEnd(i) : sections[i].to))),
    turns(from) {
      const ranges = sections
        .slice(0, -1)
        .filter((section, i) => section.energy >= from || sections[i + 1].energy >= from)
        .map((section) => [section.to - 1, section.to]);
      return [...ranges, bars >= 2 ? [bars - 2, bars] : [0, 1]];
    },
    fills() {
      const ranges = sections
        .slice(0, -1)
        .filter((_, i) => fill(i))
        .map((section) => [section.to - 1, section.to + 1]);
      return joined(bars >= 2 && fill(last) ? [...ranges, [bars - 2, bars]] : ranges);
    },
  };
}
