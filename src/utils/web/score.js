/**
 * The score: when each step of a recipe happens, worked out without looking
 * at any page. Every time is a whole number of frames, so a recording has
 * its length — and the timeline its ticks — before anything is recorded.
 * Isomorphic and pure.
 * @module utils/web/score
 */

import { normalizeRecipe } from './normalize.js';
import { TYPE_APPROACH, stepKind } from './stepKinds.js';
import { parseTarget } from './target.js';

/** @typedef {import('./types.js').Step} Step */
/** @typedef {import('./types.js').Score} Score */
/** @typedef {import('./types.js').ScoreStep} ScoreStep */

/** Tolerance, in frames, when a time is compared with a frame boundary. */
const NEAR = 1e-6;

/**
 * @param {any} fps
 * @returns {number} A usable frame rate: the given one, 30 when it is not one
 */
export function scoreFps(fps) {
  return Number.isFinite(fps) && fps > 0 ? Math.min(fps, 240) : 30;
}

/**
 * @param {Step} step
 * @returns {string[]} The characters a `type` step types, one per key
 *   (Unicode code points, so an emoji is one)
 */
export function typedCharacters(step) {
  return Array.from(typeof step?.text === 'string' ? step.text : '');
}

/**
 * @param {Step} step
 * @returns {number} Seconds a `type` step spends reaching its target before
 *   the first key: 0.5 with a target, 0 without
 */
export function typeApproach(step) {
  return step?.do === 'type' && parseTarget(step.target) ? TYPE_APPROACH : 0;
}

/**
 * How long a step's action takes: its own `duration` when it sets one,
 * otherwise the default of its kind — for `type`, the approach plus one
 * character every `1 / speed` seconds.
 * @param {Step} step - A normalised step
 * @returns {number} Seconds
 */
export function stepDuration(step) {
  if (Number.isFinite(step?.duration)) return Math.max(0, step.duration);
  const kind = stepKind(step?.do);
  if (!kind) return 0;
  if (kind.do !== 'type') return kind.duration;
  const speed = step.speed > 0 ? step.speed : kind.params.speed.default;
  return typeApproach(step) + typedCharacters(step).length / speed;
}

/**
 * @param {Step} step - A normalised step
 * @returns {number} Seconds of rest after the action
 */
export function stepHold(step) {
  if (Number.isFinite(step?.hold)) return Math.max(0, step.hold);
  return stepKind(step?.do)?.hold ?? 0;
}

/**
 * Compile a recipe into times. Each part — the lead, every duration, every
 * hold, the tail — is rounded to whole frames by itself, so equal steps
 * take equal numbers of frames and nothing drifts. A recording has at least
 * one frame.
 * @param {any} recipe - Normalised here; a raw recipe will do
 * @param {number} [fps=30]
 * @returns {Score}
 */
export function compileScore(recipe, fps) {
  const rate = scoreFps(fps);
  const normal = normalizeRecipe(recipe);
  const frames = (seconds) => Math.round(seconds * rate);
  let at = frames(normal.lead);
  /** @type {ScoreStep[]} */
  const steps = normal.steps.map((step, index) => {
    const start = at;
    const actionEnd = start + frames(stepDuration(step));
    at = actionEnd + frames(stepHold(step));
    return {
      index,
      do: step.do,
      start: start / rate,
      actionEnd: actionEnd / rate,
      end: at / rate,
      note: step.note,
    };
  });
  const total = Math.max(1, at + frames(normal.tail));
  return { fps: rate, duration: total / rate, frames: total, steps };
}

/**
 * What is happening at a time of the score.
 * - `lead`: before the first step (or the whole of a recipe without steps);
 *   `tail`: after the last. `step` is then null.
 * - `action`: inside a step's `duration`; `hold`: in its rest afterwards.
 * `progress` runs 0 → 1 through that phase. An instant that ends one phase
 * belongs to the next; a step without length is never "at" any time.
 * @param {Score} score
 * @param {number} time - Seconds
 * @returns {{ step: ScoreStep|null, phase: 'lead'|'action'|'hold'|'tail', progress: number }}
 */
export function stepAt(score, time) {
  const steps = score?.steps || [];
  const rate = scoreFps(score?.fps);
  const frame = (Number.isFinite(time) ? time : 0) * rate + NEAR;
  const through = (from, to) => {
    const length = (to - from) * rate;
    return length > 0 ? Math.min(1, Math.max(0, (frame - NEAR - from * rate) / length)) : 1;
  };
  const first = steps[0];
  const last = steps[steps.length - 1];
  const end = Number.isFinite(score?.duration) ? score.duration : last ? last.end : 0;
  if (!first || frame < first.start * rate) {
    return { step: null, phase: 'lead', progress: through(0, first ? first.start : end) };
  }
  for (const step of steps) {
    if (frame < step.actionEnd * rate) {
      return { step, phase: 'action', progress: through(step.start, step.actionEnd) };
    }
    if (frame < step.end * rate) {
      return { step, phase: 'hold', progress: through(step.actionEnd, step.end) };
    }
  }
  return { step: null, phase: 'tail', progress: through(last.end, end) };
}
