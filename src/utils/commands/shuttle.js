/**
 * J / K / L shuttle arithmetic: which rate a key press leads to, and where
 * a shuttle at that rate gets to. Pure.
 * @module utils/commands/shuttle
 */

/** Rates a repeated J or L steps through, as multiples of real time. */
export const SHUTTLE_RATES = [1, 2, 4, 8];

/**
 * The rate after pressing J (-1) or L (+1). The first press plays at
 * normal speed that way; each further press in the same direction steps
 * the speed up; a press the other way turns round at normal speed.
 * @param {number} rate - Current rate; 0 = stopped, negative = backwards
 * @param {1|-1} direction
 * @returns {number}
 */
export function nextShuttleRate(rate, direction) {
  if (Math.sign(rate) !== direction) return direction;
  const at = SHUTTLE_RATES.indexOf(Math.abs(rate));
  return direction * SHUTTLE_RATES[Math.min(at + 1, SHUTTLE_RATES.length - 1)];
}

/**
 * Advance a shuttle.
 * @param {number} position - Seconds
 * @param {number} rate
 * @param {number} elapsed - Real seconds since the last step
 * @param {number} duration - End of the timeline, seconds
 * @returns {{ position: number, ended: boolean }} `ended`: it ran into the
 *   start or the end and stops there
 */
export function shuttleStep(position, rate, elapsed, duration) {
  const next = position + rate * Math.max(0, elapsed);
  if (next <= 0 && rate < 0) return { position: 0, ended: true };
  if (next >= duration && rate > 0) return { position: Math.max(0, duration), ended: true };
  return { position: next, ended: false };
}

/**
 * @param {number} rate
 * @returns {string} e.g. `2×`, `−4×`, '' when stopped or at normal speed
 */
export function shuttleLabel(rate) {
  if (!rate || rate === 1) return '';
  return `${rate < 0 ? '−' : ''}${Math.abs(rate)}×`;
}
