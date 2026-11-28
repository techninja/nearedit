/**
 * Where the audition's playhead is in a part's own loop, and as words.
 * A part repeats its loop inside every bar range where it plays, starting
 * again at the start of each. Pure.
 * @module utils/musicUi/playhead
 */

/**
 * @param {number} bar - Where the music is, in bars of the song (fractional)
 * @param {number[][]} ranges - `[from, to)` bar ranges where the part
 *   sounds; empty = everywhere
 * @param {number} bars - Length of the part's loop
 * @returns {number} 0 … 1 along the loop; −1 where the part is silent
 */
export function loopPlace(bar, ranges, bars) {
  const length = Math.max(1, bars);
  if (!(bar >= 0)) return -1;
  if (!ranges.length) return (bar % length) / length;
  const range = ranges.find(([from, to]) => bar >= from && bar < to);
  return range ? ((bar - range[0]) % length) / length : -1;
}

/**
 * @param {number} bar - In bars of the song (fractional)
 * @param {number} beatsPerBar
 * @returns {string} `3.2`: the third bar, its second beat; '' for no position
 */
export function beatText(bar, beatsPerBar) {
  if (!(bar >= 0)) return '';
  const whole = Math.floor(bar + 1e-6);
  return `${whole + 1}.${Math.floor((bar - whole) * beatsPerBar + 1e-6) + 1}`;
}
