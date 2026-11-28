/**
 * The form of one step, as data: a field for every parameter the step-kind
 * table (`STEP_KINDS`) gives its kind, then the fields every step has
 * (`STEP_COMMON`) — each with the value to show, its default as the
 * placeholder, and the problem `validateRecipe` found with it. Nothing
 * about a step kind is written down here. Pure and isomorphic.
 * @module utils/webUi/stepForm
 */

import {
  STEP_COMMON,
  describeTarget,
  stepDuration,
  stepHold,
  stepKind,
  validateRecipe,
} from '#utils/web/index.js';

/** @typedef {import('#utils/web/types.js').Step} Step */
/** @typedef {import('#utils/web/types.js').StepParam} StepParam */

/**
 * @typedef {Object} FormField
 * @property {string} name - The step's field
 * @property {StepParam} spec
 * @property {string} label
 * @property {any} value - What the control shows: text for a box (''
 *   when the field is at its default), a boolean, a word, or a list of words
 * @property {string} placeholder - The default, for a box
 * @property {string} problem - '' when there is none
 * @property {boolean} common - One of the fields every step has
 */

/** Returned by `readField` for text that cannot be the field's value. */
export const NOT_A_VALUE = Symbol('not a value');

const TARGET_HINT = 'text=…, label=… or a CSS selector';
const BOXES = ['text', 'number', 'target', 'key', 'code'];

/** @type {(seconds: number) => string} Seconds without a trail of zeros. */
export const secondsText = (seconds) => String(Math.round(seconds * 1000) / 1000);

/**
 * @param {StepParam} spec
 * @param {any} value - As the normalised step holds it
 * @returns {any} What the control shows
 */
function shown(spec, value) {
  if (!BOXES.includes(spec.type)) return value;
  if (value === undefined || value === spec.default) return '';
  if (spec.type === 'target')
    return typeof value === 'number' ? String(value) : describeTarget(value);
  return String(value);
}

/**
 * @param {StepParam} spec
 * @returns {string}
 */
function hint(spec) {
  if (spec.type !== 'target') return spec.default === '' ? '' : String(spec.default);
  const words = [...(spec.options || []), ...(spec.number ? ['pixels'] : [])];
  return words.length ? `${TARGET_HINT}, ${words.join(', ')}` : TARGET_HINT;
}

/**
 * The fields of a step's form.
 * @param {Step} step - A normalised step
 * @param {Record<string, string>} [problems] - By field, from `stepProblems`
 * @returns {FormField[]} The kind's parameters in table order, then
 *   `duration`, `hold`, `ease` and `note`; empty for an unknown kind
 */
export function stepFields(step, problems = {}) {
  const kind = stepKind(step?.do);
  if (!kind) return [];
  /** @type {Record<string, string>} What `duration` and `hold` are when the step sets none */
  const timing = {
    duration: secondsText(stepDuration({ ...step, duration: undefined })),
    hold: secondsText(stepHold({ ...step, hold: undefined })),
  };
  /** @type {(name: string) => string} A timing the step sets itself, else '' */
  const own = (name) => (step[name] === undefined ? '' : secondsText(step[name]));
  /** @type {(name: string, spec: StepParam, common: boolean) => FormField} */
  const field = (name, spec, common) => ({
    name,
    spec,
    label: spec.label,
    value: name in timing ? own(name) : shown(spec, step[name]),
    placeholder: timing[name] ?? hint(spec),
    problem: problems[name] || '',
    common,
  });
  return [
    ...Object.entries(kind.params).map(([name, spec]) => field(name, spec, false)),
    ...Object.entries(STEP_COMMON).map(([name, spec]) => field(name, spec, true)),
  ];
}

/**
 * What a box's text means for the step.
 * @param {FormField} field
 * @param {string} text - As typed
 * @returns {any} The value to store — `undefined` to leave a timing to its
 *   kind — or `NOT_A_VALUE` for text that is not a number where one is needed
 */
export function readField(field, text) {
  const { spec, name } = field;
  const typed = String(text ?? '');
  const number = Number(typed.trim().replace(',', '.'));
  const numeric = typed.trim() !== '' && Number.isFinite(number);
  if (spec.type === 'target') return spec.number && numeric ? number : typed;
  if (spec.type !== 'number') return typed;
  if (typed.trim() === '') return name in STEP_COMMON ? undefined : spec.default;
  return numeric ? number : NOT_A_VALUE;
}

/**
 * The problems of a recipe, sorted to where they show.
 * @param {any} recipe
 * @returns {{ recipe: Record<string, string>, steps: Record<number, Record<string, string>> }}
 *   `recipe` by field (`url`, `steps`…), `steps` by index, then by field
 */
export function recipeProblems(recipe) {
  /** @type {ReturnType<typeof recipeProblems>} */
  const sorted = { recipe: {}, steps: {} };
  for (const { path, message } of validateRecipe(recipe).problems) {
    const at = /^steps\[(\d+)\](?:\.(\w+))?$/.exec(path);
    if (!at) sorted.recipe[path || 'recipe'] ??= message;
    else (sorted.steps[Number(at[1])] ??= {})[at[2] || 'do'] ??= message;
  }
  return sorted;
}
