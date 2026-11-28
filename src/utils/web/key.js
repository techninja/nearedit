/**
 * The identity of a recording: a key made from everything that decides what
 * is recorded — the recipe, the frame rate and the recorder's version — and
 * from nothing else. The same recipe is never recorded twice; a changed one
 * has a new key. Isomorphic and pure.
 * @module utils/web/key
 */

import { normalizeRecipe } from './normalize.js';
import { scoreFps, stepDuration, stepHold } from './score.js';
import { sha256 } from './sha256.js';

/** @typedef {import('./types.js').Recipe} Recipe */

/**
 * Version of the recorder. Raise it when the recorder draws the same recipe
 * differently (a new cursor, another way of scrolling): every existing
 * recording then counts as stale.
 */
export const RECORDER_VERSION = 1;

/** Hex digits of a key. */
export const KEY_LENGTH = 20;

/** What a key looks like. */
export const KEY_PATTERN = /^[0-9a-f]{20}$/;

/**
 * JSON with the keys of every object in order, so that two equal values
 * always read the same.
 * @param {any} value - JSON-safe data
 * @returns {string}
 */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value !== 'object' || value === null) return JSON.stringify(value) ?? 'null';
  const fields = Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
  return `{${fields.join(',')}}`;
}

/**
 * The recipe as the key sees it: normalised, every default filled in — each
 * step's `duration` and `hold` written out, so a step that spells out its
 * default is the same as one that leaves it to the table — and without the
 * notes, which change nothing in the picture.
 * @param {any} recipe
 * @returns {Record<string, any>}
 */
export function canonicalRecipe(recipe) {
  const normal = normalizeRecipe(recipe);
  const steps = normal.steps.map((step) => {
    /** @type {Record<string, any>} */
    const seen = { ...step, duration: stepDuration(step), hold: stepHold(step) };
    delete seen.note;
    return seen;
  });
  return { ...normal, steps };
}

/**
 * The key of the recording a recipe makes at a frame rate.
 * @param {any} recipe - Normalised here
 * @param {number} [fps=30]
 * @param {number|string} [version] - The recorder's version, for tests
 * @returns {string} 20 lowercase hex digits: the start of the SHA-256 of
 *   `version \n fps \n canonical JSON`
 */
export function recipeKey(recipe, fps, version = RECORDER_VERSION) {
  const text = `${version}\n${scoreFps(fps)}\n${canonicalJson(canonicalRecipe(recipe))}`;
  return sha256(text).slice(0, KEY_LENGTH);
}
