/**
 * Changes to a recipe as the web editor makes them: add, remove, copy and
 * move steps, and set one named field. Each returns a new recipe for
 * `updateWebRecipe`, which normalises it; nothing here changes its
 * argument. Pure and isomorphic.
 * @module utils/webUi/recipeEdit
 */

import { RECIPE_LIMITS } from '#utils/web/index.js';
import { sizePatch } from './sizes.js';

/** @typedef {import('#utils/web/types.js').Recipe} Recipe */

const STEP_FIELD = /^steps\.(\d+)\.([A-Za-z]+)$/;
const CURSOR_FIELD = /^cursor\.(style|size|color|clicks)$/;
/** Fields of the recipe itself that a control may set. */
const PLAIN = ['url', 'colorScheme', 'lead', 'tail', 'onMissing', 'scale', 'hide'];

/**
 * @param {Recipe} recipe
 * @param {number} at - Where the step goes: 0 = first, `steps.length` = last
 * @param {any} step - As written; `updateWebRecipe` normalises it
 * @returns {Recipe} Unchanged when the recipe is full
 */
export function insertStep(recipe, at, step) {
  if (recipe.steps.length >= RECIPE_LIMITS.steps) return recipe;
  const index = Math.max(0, Math.min(recipe.steps.length, Math.round(at)));
  const steps = [...recipe.steps.slice(0, index), step, ...recipe.steps.slice(index)];
  return { ...recipe, steps };
}

/**
 * @param {Recipe} recipe
 * @param {number} index
 * @returns {Recipe}
 */
export function removeStep(recipe, index) {
  if (!recipe.steps[index]) return recipe;
  return { ...recipe, steps: recipe.steps.filter((_step, i) => i !== index) };
}

/**
 * A copy of a step, placed right after it.
 * @param {Recipe} recipe
 * @param {number} index
 * @returns {Recipe}
 */
export function duplicateStep(recipe, index) {
  const step = recipe.steps[index];
  return step ? insertStep(recipe, index + 1, { ...step }) : recipe;
}

/**
 * @param {Recipe} recipe
 * @param {number} from
 * @param {number} to - Index the step has afterwards
 * @returns {Recipe}
 */
export function moveStep(recipe, from, to) {
  const count = recipe.steps.length;
  const target = Math.max(0, Math.min(count - 1, Math.round(to)));
  if (!recipe.steps[from] || target === from) return recipe;
  const steps = recipe.steps.filter((_step, i) => i !== from);
  steps.splice(target, 0, recipe.steps[from]);
  return { ...recipe, steps };
}

/**
 * Set fields of one step. A value of `undefined` removes the field, which
 * for `duration` and `hold` means "as long as the kind says".
 * @param {Recipe} recipe
 * @param {number} index
 * @param {Record<string, any>} patch
 * @returns {Recipe}
 */
export function patchStep(recipe, index, patch) {
  if (!recipe.steps[index]) return recipe;
  /** @type {any} */
  const step = { ...recipe.steps[index] };
  for (const [name, value] of Object.entries(patch)) {
    if (value === undefined) delete step[name];
    else step[name] = value;
  }
  return { ...recipe, steps: recipe.steps.map((old, i) => (i === index ? step : old)) };
}

/**
 * Set one named field of a recipe: `url`, `colorScheme`, `lead`, `tail`,
 * `onMissing`, `hide` (the whole list), `size` (the id of an offered size), `cursor.style`,
 * `cursor.size`, `cursor.color`, `cursor.clicks`, or `steps.<n>.<field>`.
 * @param {Recipe} recipe
 * @param {string} name
 * @param {any} value
 * @returns {Recipe} Unchanged for a name that is none of these
 */
export function setRecipeField(recipe, name, value) {
  const step = STEP_FIELD.exec(name);
  if (step) return patchStep(recipe, Number(step[1]), { [step[2]]: value });
  const cursor = CURSOR_FIELD.exec(name);
  if (cursor) return { ...recipe, cursor: { ...recipe.cursor, [cursor[1]]: value } };
  if (name === 'size') return { ...recipe, ...sizePatch(value) };
  return PLAIN.includes(name) ? { ...recipe, [name]: value } : recipe;
}

/**
 * Where the selection goes after a step was removed.
 * @param {number} selected - Index selected before; `count` = the end
 * @param {number} removed
 * @returns {number}
 */
export function selectionAfterRemove(selected, removed) {
  return selected > removed ? selected - 1 : selected;
}

/**
 * Where the selection goes after a step moved from one place to another.
 * @param {number} selected
 * @param {number} from
 * @param {number} to
 * @returns {number}
 */
export function selectionAfterMove(selected, from, to) {
  if (selected === from) return to;
  if (from < selected && to >= selected) return selected - 1;
  if (from > selected && to <= selected) return selected + 1;
  return selected;
}
