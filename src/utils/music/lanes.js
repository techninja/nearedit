/**
 * Drum lanes as strings: one character per step — `.` a rest, `o` a soft
 * hit, `x` a normal one, `X` an accent. Isomorphic and pure.
 * @module utils/music/lanes
 */

/** The characters of a lane and the velocity each plays at. */
export const LANE_VELOCITIES = Object.freeze({ '.': 0, o: 0.4, x: 0.75, X: 1 });

/** Characters that are skipped when a lane is read: bar lines and spaces. */
const SEPARATORS = /[\s|]/g;

/**
 * A lane as it is stored: only the four characters (anything else that is
 * not a bar line or a space becomes a rest), exactly `length` steps — cut
 * when it is longer, padded with rests when it is shorter.
 * @param {any} lane - `'X...x...'`; bar lines `|` and spaces may be written
 *   for the eye
 * @param {number} length - Steps
 * @returns {string}
 */
export function fitLane(lane, length) {
  const text =
    typeof lane === 'string' ? lane.slice(0, length * 2 + 64).replace(SEPARATORS, '') : '';
  let out = '';
  for (let i = 0; i < length; i++) out += Object.hasOwn(LANE_VELOCITIES, text[i]) ? text[i] : '.';
  return out;
}

/**
 * @param {string} lane
 * @returns {number} How many steps the lane writes down, separators not counted
 */
export function laneLength(lane) {
  return typeof lane === 'string' ? lane.replace(SEPARATORS, '').length : 0;
}

/**
 * @param {string} lane
 * @returns {number[]} The velocity of every step, 0 for a rest
 */
export function laneVelocities(lane) {
  return Array.from(typeof lane === 'string' ? lane : '', (char) => LANE_VELOCITIES[char] ?? 0);
}

/**
 * @param {number[]} velocities - 0 … 1 per step; 0 or less is a rest
 * @returns {string} The lane that plays them, each at the nearest of the
 *   three strengths
 */
export function laneFromVelocities(velocities) {
  const list = Array.isArray(velocities) ? velocities : [];
  return list.map((v) => (!(v > 0) ? '.' : v < 0.575 ? 'o' : v < 0.875 ? 'x' : 'X')).join('');
}

/**
 * @param {string} lane
 * @returns {boolean} True when the lane has no hit
 */
export function isSilentLane(lane) {
  return !/[oxX]/.test(typeof lane === 'string' ? lane : '');
}
