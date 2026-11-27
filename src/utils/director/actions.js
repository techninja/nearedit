/**
 * Director action schemas — the single list that drives the director form
 * (`GET /api/director/actions`) and server-side directive validation.
 * Reference: docs/app-spec/API.md § Director, docs/app-spec/DIRECTOR.md.
 * Isomorphic, pure data.
 * @module utils/director/actions
 */

import { BASE_EDIT, EXECUTE_SCRIPT, GENERATE_EDIT, GENERATE_SCRIPT } from './actionsGenerate.js';
import { MOTION_PIECE } from './actionsMotion.js';
import { ADD_CAPTIONS, BEAT_SYNC_ACTION, INSERT_BROLL } from './actionsTimeline.js';
import { REMOVE_SILENCE } from './actionsTimeline.js';

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
 */

/** @type {ActionSchema[]} In the order the form should list them. */
export const ACTIONS = [
  BASE_EDIT,
  GENERATE_EDIT,
  GENERATE_SCRIPT,
  EXECUTE_SCRIPT,
  INSERT_BROLL,
  MOTION_PIECE,
  REMOVE_SILENCE,
  BEAT_SYNC_ACTION,
  ADD_CAPTIONS,
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
