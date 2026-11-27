/**
 * The script review: `generate_script` returns several script options;
 * the user compares them, picks one, edits it, and builds the timeline
 * from it with `execute_script`.
 * @module utils/directorUi/scripts
 */

import { currentModes } from '#utils/directorUi/controller.js';
import { initialValues } from '#utils/directorUi/form.js';
import { pickMode } from '#utils/directorUi/modes.js';
import { directorState } from '#utils/directorUi/state.js';

/** @param {Partial<import('#utils/directorUi/state.js').ScriptReview>} patch */
function patchScripts(patch) {
  const { scripts } = directorState.get();
  if (scripts) directorState.set({ scripts: { ...scripts, ...patch } });
}

/** @returns {import('#utils/director/actions.js').ActionSchema|undefined} */
const executeAction = () => directorState.get().actions.find((a) => a.id === 'execute_script');

/**
 * Show the options a `generate_script` run produced.
 * @param {{ scripts: any[], folder?: string, summary?: string, notes?: string[] }} result
 */
export function openScriptReview(result) {
  const action = executeAction();
  const mode = action ? pickMode(action, currentModes(action)) : 'replace';
  const scripts = {
    options: result.scripts,
    folder: result.folder || '',
    picked: -1,
    text: '',
    mode,
    open: true,
  };
  const summary = result.summary || `${result.scripts.length} script options written`;
  directorState.set({
    scripts,
    result: { title: 'Generate script', summary, notes: result.notes || [] },
  });
}

/** Show or hide the review dialog (the options are kept). @param {boolean} open */
export const showScriptReview = (open) => patchScripts({ open });

/**
 * Pick an option to edit; -1 goes back to comparing.
 * @param {number} index
 */
export function pickScript(index) {
  const { scripts } = directorState.get();
  if (!scripts) return;
  patchScripts({ picked: index, text: index >= 0 ? scripts.options[index]?.script || '' : '' });
}

/** @param {string} text */
export const editScript = (text) => patchScripts({ text });

/** @param {string} mode */
export const setScriptMode = (mode) => patchScripts({ mode });

/**
 * The mode choices for building from the script.
 * @returns {import('#utils/directorUi/modes.js').ModeChoice[]}
 */
export function scriptModes() {
  const action = executeAction();
  return action ? currentModes(action) : [];
}

/**
 * What `runDirective` needs to build the timeline from the edited script.
 * @returns {{ action: import('#utils/director/actions.js').ActionSchema,
 *   form: { mode: string, prompt: string, values: Record<string, any> } }|null} null when
 *   there is nothing to build from
 */
export function scriptRun() {
  const { scripts } = directorState.get();
  const action = executeAction();
  if (!scripts || !action || !scripts.text.trim()) return null;
  return {
    action,
    form: { mode: scripts.mode, prompt: scripts.text, values: initialValues(action) },
  };
}
