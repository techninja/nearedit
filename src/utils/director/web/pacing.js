/**
 * The timing of a site demo, in whole frames. Every step takes the time
 * its kind takes in the recipe library, scaled by the pacing; a pause
 * after it lasts as long as its caption takes to read, and a page that was
 * scrolled to is looked at before the next scroll. A target length
 * stretches or trims the pauses — never the actions — so the recording
 * ends exactly on it. Reference: docs/app-spec/DIRECTOR-WEB.md § Timing.
 * Isomorphic and pure.
 * @module utils/director/web/pacing
 */

import { defaultRecipe } from '#utils/web/limits.js';
import { normalizeStep } from '#utils/web/normalize.js';
import { stepDuration, stepHold } from '#utils/web/score.js';
import { fitHolds } from './holds.js';
import { wordCount } from './words.js';

/**
 * Per pacing: `scale` multiplies the library's durations and holds; `look`
 * is the seconds a place is looked at; a caption takes `base + perWord ×
 * words` seconds to read.
 */
export const PACE = Object.freeze({
  slow: Object.freeze({ scale: 1.3, look: 2.4, base: 1.3, perWord: 0.36 }),
  medium: Object.freeze({ scale: 1, look: 1.8, base: 1, perWord: 0.28 }),
  fast: Object.freeze({ scale: 0.75, look: 1.2, base: 0.7, perWord: 0.2 }),
});

/** Kinds after which the page is left alone to be looked at. */
const PASSING = ['scroll', 'goto', 'wait'];
/** The shortest pause, and the share of its reading time a caption keeps at least. */
const MIN_HOLD = 0.15;
const MIN_READ = 0.65;
const MIN_TAIL = 0.3;

/** @param {string} pacing @returns {typeof PACE.medium} */
export const paceOf = (pacing) => PACE[pacing] || PACE.medium;

/**
 * @param {string} text - A caption
 * @param {string} pacing
 * @returns {number} Seconds it takes to read; 0 for no text
 */
export function readingSeconds(text, pacing) {
  const words = wordCount(text);
  const pace = paceOf(pacing);
  return words ? pace.base + pace.perWord * words : 0;
}

/**
 * What one step takes by itself.
 * @param {Record<string, any>} raw - A step without timing (a `wait` may carry its
 *   seconds, a scroll that only brings something into view its own short times)
 * @param {Record<string, any>|undefined} next
 * @param {string} pacing
 * @param {number} fps
 * @returns {{ step: Record<string, any>, action: number, hold: number, least: number }} Frames
 */
function naturalStep(raw, next, pacing, fps) {
  const pace = paceOf(pacing);
  const step = { ...raw };
  const normal = normalizeStep(step) || /** @type {any} */ ({});
  if (step.do === 'type')
    step.speed = Math.max(1, Math.min(60, Math.round(normal.speed / pace.scale)));
  const typed = step.do === 'type' || Number.isFinite(step.duration);
  const seconds = stepDuration({ ...normal, ...step }) * (typed ? 1 : pace.scale);
  const own = Number.isFinite(step.hold);
  let rest = own ? step.hold : stepHold(normal) * pace.scale;
  const passing = PASSING.includes(step.do) && step.do !== 'wait';
  if (!own && passing && (!next || PASSING.includes(next.do))) rest = Math.max(rest, pace.look);
  // A step that brings its own pause is on its way somewhere: nothing is read during it.
  const reading = own ? 0 : readingSeconds(step.note, pacing);
  const action = Math.round(seconds * fps);
  const hold = Math.max(Math.round(rest * fps), Math.ceil(reading * fps) - action, 0);
  const keep = reading ? Math.ceil(MIN_READ * reading * fps) - action : 0;
  return { step, action, hold, least: Math.min(hold, Math.max(Math.round(MIN_HOLD * fps), keep)) };
}

/**
 * Time the steps of a recipe.
 * @param {Record<string, any>[]} steps - Without timing; `note` is the caption
 * @param {{ fps: number, pacing: string, target?: number }} options - `target`:
 *   the length to end on, seconds; 0 lets the steps take what they take
 * @returns {{ steps: Record<string, any>[], lead: number, tail: number, seconds: number,
 *   notes: string[] }} Every step with its `duration` and `hold`; all times
 *   are whole frames
 */
export function paceSteps(steps, { fps, pacing, target = 0 }) {
  const pace = paceOf(pacing);
  const parts = steps.map((step, i) => naturalStep(step, steps[i + 1], pacing, fps));
  const leaves = PASSING.includes(steps[0]?.do) && steps[0].do !== 'wait';
  const lead = Math.round((leaves || !steps.length ? pace.look : 0.9 * pace.scale) * fps);
  const fixed = lead + parts.reduce((sum, part) => sum + part.action, 0);
  const natural = [
    ...parts.map((part) => part.hold),
    Math.round(defaultRecipe().tail * pace.scale * fps),
  ];
  const least = [...parts.map((part) => part.least), Math.round(MIN_TAIL * fps)];
  const wanted = Math.round(target * fps) - fixed;
  const holds = target > 0 ? fitHolds(natural, least, wanted) : natural;
  const frames = fixed + holds.reduce((a, b) => a + b, 0);
  const notes = [];
  const asked = natural.reduce((a, b) => a + b, 0);
  const said = (/** @type {number} */ count) => `${Math.round((count / fps) * 10) / 10} s`;
  if (target > 0 && frames > Math.round(target * fps)) {
    notes.push(
      `The demo cannot be as short as ${said(target * fps)}: its steps and captions need ` +
        `${said(frames)} even with every pause cut to the bone.`,
    );
  } else if (target > 0 && wanted > asked * 2.5) {
    notes.push(
      `To last ${said(target * fps)} every pause was stretched about ${Math.round(wanted / asked)}× — ` +
        'add stops, or set the target length to 0 to let the steps decide.',
    );
  }
  return {
    steps: parts.map((part, i) => ({
      ...part.step,
      duration: part.action / fps,
      hold: holds[i] / fps,
    })),
    ...{ lead: lead / fps, tail: holds[parts.length] / fps, seconds: frames / fps },
    notes,
  };
}
