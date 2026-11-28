/**
 * Motion maths shared by the recorder and the editor: where the cursor is on
 * its way to a target, where the page has scrolled to, how much of a text
 * is typed. The recorder calls these for every frame and the editor's
 * preview calls the same ones, so the two can never disagree.
 * Isomorphic and pure.
 * @module utils/web/motion
 */

import { ease as eased } from '#utils/edl/easing.js';
import { DEFAULT_EASE } from './limits.js';
import { stepDuration, typeApproach, typedCharacters } from './score.js';
import { parseTarget } from './target.js';

/** @typedef {import('./types.js').Step} Step */
/** @typedef {import('./types.js').ParsedTarget} ParsedTarget */
/** @typedef {{ x: number, y: number }} Point */

/** How long a mouse button or a key stays down, seconds. */
export const PRESS_SECONDS = 0.12;

/** How far a glide bows away from the straight line, as a share of its length. */
export const GLIDE_ARC = 0.07;

/** The widest bow of a glide, pixels — long moves stay nearly straight. */
export const GLIDE_ARC_MAX = 48;

/** Slack, in seconds, when a time is compared with the end of an action. */
const NEAR = 1e-9;

/**
 * Where the cursor is on its way from one point to another. It follows a
 * shallow arc, like a hand that pivots at the wrist: the path bows away
 * from the straight line by `GLIDE_ARC` of its length (never more than
 * `GLIDE_ARC_MAX`), always to the upper side of the line — and to the
 * right of a move straight down, to the left of one straight up. Nothing
 * is random: the same move always takes the same path.
 * @param {Point} from
 * @param {Point} to
 * @param {number} p - Progress through the move, 0..1
 * @param {string} [ease] - An easing name, `ease-in-out` by default
 * @returns {Point} Exactly `from` at 0 and exactly `to` at 1
 */
export function glide(from, to, p, ease = DEFAULT_EASE) {
  if (!(p > 0)) return { x: from.x, y: from.y };
  if (p >= 1) return { x: to.x, y: to.y };
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 0)) return { x: to.x, y: to.y };
  const along = eased(ease || DEFAULT_EASE, p);
  // The bow is widest half way and nothing at both ends, wherever an
  // overshooting easing carries `along`.
  const bow = Math.min(GLIDE_ARC * length, GLIDE_ARC_MAX) * Math.sin(Math.PI * along);
  const side = dx < 0 ? -1 : 1;
  return {
    x: from.x + dx * along + (dy / length) * side * bow,
    y: from.y + dy * along - (dx / length) * side * bow,
  };
}

/**
 * Where the page has scrolled to on its way from one position to another.
 * @param {number} fromY
 * @param {number} toY
 * @param {number} p - Progress, 0..1
 * @param {string} [ease] - An easing name, `ease-in-out` by default
 * @returns {number} Exactly `fromY` at 0 and exactly `toY` at 1
 */
export function scrollAt(fromY, toY, p, ease = DEFAULT_EASE) {
  if (!(p > 0)) return fromY;
  if (p >= 1) return toY;
  return fromY + (toY - fromY) * eased(ease || DEFAULT_EASE, p);
}

/**
 * Where a `scroll` step is headed: `to` when it is set — a number is a
 * position in pixels, `top` and `bottom` are the ends of the page, anything
 * else a target to bring into view — otherwise the distance `by`.
 * @param {Step} step - A normalised `scroll` step
 * @returns {{ to: 'top'|'bottom' } | { y: number } | { target: ParsedTarget } |
 *   { by: number } | null} null when the step says neither
 */
export function scrollGoal(step) {
  const to = step?.to;
  if (typeof to === 'number') return { y: to };
  if (to === 'top' || to === 'bottom') return { to };
  const target = parseTarget(to);
  if (target) return { target };
  return Number.isFinite(step?.by) && step.by !== 0 ? { by: step.by } : null;
}

/**
 * How many characters of a `type` step are typed after `elapsed` seconds of
 * its action. Nothing is typed while the cursor travels to the target (the
 * first 0.5 s, when there is one); then the characters come at an even
 * pace and the last one lands exactly at the end of the action.
 * @param {Step} step - A normalised `type` step
 * @param {number} elapsed - Seconds since the step's `start`
 * @param {number} [duration] - How long the action really takes. Pass the
 *   score's `actionEnd − start`, which is whole frames; by default the
 *   step's own unrounded duration
 * @returns {number} 0 … the number of characters (code points, see
 *   `typedCharacters`)
 */
export function typedLength(step, elapsed, duration = stepDuration(step)) {
  const count = typedCharacters(step).length;
  if (!count) return 0;
  // A nanosecond of slack: times that come from frame numbers are not exact.
  if (elapsed + NEAR >= duration) return count;
  const approach = Math.min(typeApproach(step), duration);
  const typing = duration - approach;
  if (!(elapsed > approach) || !(typing > 0)) return 0;
  return Math.min(count, Math.floor((count * (elapsed - approach + NEAR)) / typing));
}

/**
 * The text a `type` step has typed after `elapsed` seconds of its action.
 * @param {Step} step
 * @param {number} elapsed
 * @param {number} [duration] - See `typedLength`
 * @returns {string}
 */
export function typedText(step, elapsed, duration) {
  return typedCharacters(step)
    .slice(0, typedLength(step, elapsed, duration))
    .join('');
}
