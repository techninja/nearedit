/**
 * What snapshots said about steps they could not play, remembered for as
 * long as it stays true: a sentence about step 3 belongs to the recipe's
 * first three steps as they were, so it is shown — also after the selection
 * moved to that step and the page before it loaded fine — until one of
 * those steps, or the recipe around them, changes.
 * @module utils/webUi/saidMemory
 */

import { recipeKey } from '#utils/web/index.js';
import { readStepSaid } from './stepSaid.js';

const REMEMBERED = 60;
/** @type {Map<string, string>} Sentence by the key of the steps it was said of */
const said = new Map();
/** @type {WeakMap<object, { version: number, texts: string[] }>} */
const answers = new WeakMap();
let version = 0;

/**
 * @param {any} recipe
 * @param {number} count - Steps played
 * @returns {string} Equal for two recipes whose first `count` steps play the same
 */
const playedKey = (recipe, count) =>
  recipeKey({ ...recipe, steps: recipe.steps.slice(0, count) }, 30);

/**
 * Remember what a snapshot said, when it is about a step.
 * @param {any} recipe - The recipe that was played (or its first steps)
 * @param {string} text - The snapshot's error
 */
export function rememberSaid(recipe, text) {
  const about = readStepSaid(text);
  if (!about || about.index >= recipe.steps.length) return;
  if (said.size >= REMEMBERED) said.delete(said.keys().next().value);
  said.set(playedKey(recipe, about.index + 1), about.text);
  version += 1;
}

/**
 * @param {any} recipe - Normalised, as the clip holds it
 * @returns {string[]} What was said about its steps as they are now, in step order
 */
export function saidOf(recipe) {
  if (!said.size) return [];
  const known = answers.get(recipe);
  if (known?.version === version) return known.texts;
  const texts = recipe.steps
    .map((_step, index) => said.get(playedKey(recipe, index + 1)))
    .filter(Boolean);
  answers.set(recipe, { version, texts });
  return texts;
}

/** Forget everything (the dialog closed). */
export function forgetSaid() {
  said.clear();
  version += 1;
}
