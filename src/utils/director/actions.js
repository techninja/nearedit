/**
 * Director action schemas — the single list that drives the director form
 * (`GET /api/director/actions`) and server-side directive validation.
 * Reference: docs/app-spec/API.md § Director, docs/app-spec/DIRECTOR.md.
 * Isomorphic, pure data.
 * @module utils/director/actions
 */

import { BRAND_PASS } from './actionsBrand.js';
import { BASE_EDIT, EXECUTE_SCRIPT, GENERATE_EDIT, GENERATE_SCRIPT } from './actionsGenerate.js';
import { MOTION_PIECE } from './actionsMotion.js';
import { SCORE } from './actionsScore.js';
import { ADD_CAPTIONS, BEAT_SYNC_ACTION, INSERT_BROLL } from './actionsTimeline.js';
import { REMOVE_SILENCE } from './actionsTimeline.js';
import { SITE_DEMO } from './actionsWeb.js';

/**
 * @typedef {import('./fields.js').ActionField} ActionField
 * @typedef {Object} ActionSchema
 * @property {string} id - `directive.action`
 * @property {string} title
 * @property {string} description
 * @property {'no'|'yes'|'optional'} llm - Whether the action needs the LLM provider
 * @property {'director'|'script'} jobType - Job type, and which route runs it
 * @property {string[]} modes - Values of `directive.mode` that make sense
 * @property {string} defaultMode
 * @property {boolean} inPlace - Rewrites the posted timeline, so `edl` is required
 * @property {{ label: string, placeholder: string, required: boolean } | null} prompt -
 *   How to ask for `directive.prompt`; null when the action takes none
 * @property {ActionField[]} fields - Form fields, stored in `directive.params`
 * @property {boolean} [media] - `false` when the action never looks at the
 *   project's media, so the scan before it is skipped
 * @property {string} [noLlmNote] - For an `optional` action: what it does
 *   instead while the language model is not available
 * @property {string} [brand] - For an action that follows the project's
 *   brand kit: what it takes from it, in a line
 * @property {string} [run] - What the button that runs it says; left out, "Run <title>"
 * @property {number} [shown] - How many of its fields a form shows before
 *   "More options"; left out, the form decides
 */

/** @type {ActionSchema[]} In the order the form should list them. */
export const ACTIONS = [
  BASE_EDIT,
  GENERATE_EDIT,
  GENERATE_SCRIPT,
  EXECUTE_SCRIPT,
  INSERT_BROLL,
  MOTION_PIECE,
  SITE_DEMO,
  SCORE,
  REMOVE_SILENCE,
  BEAT_SYNC_ACTION,
  ADD_CAPTIONS,
  BRAND_PASS,
];

export const MODES = ['replace', 'append', 'prepend', 'insert', 'range'];

/**
 * @param {string} id
 * @returns {ActionSchema|null}
 */
export function getAction(id) {
  return ACTIONS.find((a) => a.id === id) || null;
}

/**
 * The default `params` of an action.
 * @param {string} id
 * @returns {Record<string, number|string|boolean>}
 */
export function defaultParams(id) {
  const action = getAction(id);
  return Object.fromEntries((action?.fields || []).map((f) => [f.key, f.default]));
}
