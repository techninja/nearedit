/**
 * The director panel's state: the action schemas, the LLM's availability,
 * the form being filled in, the running job, results and the session's
 * run history. `<director-panel>` renders it; `controller.js`, `run.js`
 * and `scripts.js` change it.
 * @module utils/directorUi/state
 */

import { createObservable } from '#utils/ui/observable.js';

/**
 * @typedef {Object} RunProgress
 * @property {string} title - What is running, e.g. "Base edit"
 * @property {number} progress - 0..100
 * @property {string[]} log - Latest lines from the job
 * @property {boolean} cancelling
 * @typedef {Object} ScriptReview
 * @property {{ variant: number, filename: string, filePath: string, script: string }[]} options
 * @property {string} folder - Where the options were saved
 * @property {number} picked - Index of the option being edited; -1 while comparing
 * @property {string} text - The picked script, as edited
 * @property {string} mode - Where the built timeline goes
 * @property {boolean} open - The review dialog is showing
 * @typedef {Object} DirectorState
 * @property {import('#utils/director/actions.js').ActionSchema[]} actions
 * @property {string} loadError - Why the actions could not be loaded
 * @property {import('#utils/directorUi/availability.js').LlmStatus|null} llm - null = not known yet
 * @property {string} actionId - The action whose form is open; '' = the list
 * @property {string} mode
 * @property {string} prompt
 * @property {Record<string, any>} values
 * @property {Record<string, string>} problems - Field → what the server objected to
 * @property {RunProgress|null} run - The running job
 * @property {{ message: string, detail: string }|null} error - Why the last run failed
 * @property {{ title: string, summary: string, notes: string[] }|null} result - What the last run did
 * @property {import('#utils/directorUi/history.js').RunRecord[]} history
 * @property {ScriptReview|null} scripts
 */

/** @type {DirectorState} */
const INITIAL = {
  actions: [],
  loadError: '',
  llm: null,
  actionId: '',
  mode: '',
  prompt: '',
  values: {},
  problems: {},
  run: null,
  error: null,
  result: null,
  history: [],
  scripts: null,
};

/** @type {import('#utils/ui/observable.js').Observable<DirectorState>} */
export const directorState = createObservable({ ...INITIAL });

/**
 * The schema of the action whose form is open.
 * @returns {import('#utils/director/actions.js').ActionSchema|undefined}
 */
export function currentAction() {
  const { actions, actionId } = directorState.get();
  return actions.find((action) => action.id === actionId);
}

/**
 * Forget everything that belongs to one adaptation (form, results, history)
 * but keep what was loaded from the server.
 */
export function resetDirector() {
  const { actions, llm } = directorState.get();
  directorState.set({ ...INITIAL, actions, llm });
}
