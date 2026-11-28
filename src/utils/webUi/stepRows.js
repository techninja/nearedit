/**
 * The steps list of the web editor, as data: one row per step with its
 * label, when it starts and how long it takes, and whether something is
 * wrong with it. Pure and isomorphic.
 * @module utils/webUi/stepRows
 */

import { STEP_KINDS, compileScore, stepKind, stepLabel } from '#utils/web/index.js';

/** @typedef {import('#utils/web/types.js').Recipe} Recipe */

/**
 * @typedef {Object} StepRow
 * @property {number} index
 * @property {string} do
 * @property {string} label
 * @property {number} start - Seconds into the recording
 * @property {number} length - Action and hold together, seconds
 * @property {string} problem - The first thing wrong with it, '' when fine
 */

/** @type {(seconds: number) => string} `1.3 s` */
export const secondsLabel = (seconds) => `${(Math.round(seconds * 10) / 10).toFixed(1)} s`;

/**
 * A time of the recording, for a list: `0:04.2`.
 * @param {number} seconds
 * @returns {string}
 */
export function clockLabel(seconds) {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const minutes = Math.floor(tenths / 600);
  return `${minutes}:${String(((tenths % 600) / 10).toFixed(1)).padStart(4, '0')}`;
}

/**
 * @param {Recipe} recipe - Normalised
 * @param {number} fps
 * @param {Record<number, Record<string, string>>} [problems] - By step, from
 *   `recipeProblems`
 * @returns {{ rows: StepRow[], duration: number }}
 */
export function stepRows(recipe, fps, problems = {}) {
  const score = compileScore(recipe, fps);
  const rows = score.steps.map((at) => ({
    index: at.index,
    do: at.do,
    label: stepLabel(recipe.steps[at.index]),
    start: at.start,
    length: at.end - at.start,
    problem: Object.values(problems[at.index] || {})[0] || '',
  }));
  return { rows, duration: score.duration };
}

/**
 * The step kinds, for the "add a step" menu.
 * @returns {{ do: string, label: string, description: string }[]}
 */
export function kindChoices() {
  return STEP_KINDS.map((kind) => ({
    do: kind.do,
    label: kind.label,
    description: kind.description,
  }));
}

/**
 * A new step of a kind, with nothing set: the table's defaults apply.
 * @param {string} name - A step's `do`
 * @returns {{ do: string }|null} null for an unknown kind
 */
export function blankStep(name) {
  const kind = stepKind(name);
  return kind ? { do: kind.do } : null;
}
