/**
 * Director panel actions: load the schemas and the LLM status, open an
 * action's form, edit it. Running a form is in `run.js`.
 * @module utils/directorUi/controller
 */

import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import UserPrefs, { setUserPrefs } from '#store/UserPrefs.js';
import { api } from '#utils/api/http.js';
import { getDoc } from '#utils/editor/session.js';
import { isPlaying } from '#utils/playback/transport.js';
import { directorRange, insertTime } from '#utils/directorUi/context.js';
import { initialValues } from '#utils/directorUi/form.js';
import { modeChoices, pickMode } from '#utils/directorUi/modes.js';
import { currentAction, directorState } from '#utils/directorUi/state.js';

/** (Re)check whether the language model can be reached. @returns {Promise<void>} */
export async function refreshLlm() {
  try {
    const status = await api('/intelligence/status');
    directorState.set({ llm: status.llm || null });
  } catch (err) {
    console.warn('[director] could not read the provider status:', err.message);
  }
}

/** Load the action schemas (once) and the LLM status. @returns {Promise<void>} */
export async function loadDirector() {
  refreshLlm();
  if (directorState.get().actions.length) return;
  try {
    const { data } = await api('/director/actions');
    directorState.set({ actions: data, loadError: '' });
  } catch (err) {
    directorState.set({ loadError: err.message });
  }
}

/**
 * The mode choices for an action as the editor stands now.
 * @param {import('#utils/director/actions.js').ActionSchema} action
 * @returns {import('#utils/directorUi/modes.js').ModeChoice[]}
 */
export function currentModes(action) {
  const view = store.get(ViewState);
  const doc = getDoc();
  return modeChoices(action, {
    range: directorRange(view, doc),
    insertAt: insertTime(view, isPlaying()),
    selected: (view.selection || []).length,
    fps: Number(doc.fps) || 30,
  });
}

/**
 * Open an action's form with its defaults.
 * @param {string} actionId
 * @param {{ prompt?: string, mode?: string }} [preset]
 */
export function openAction(actionId, preset = {}) {
  const action = directorState.get().actions.find((a) => a.id === actionId);
  if (!action) return;
  directorState.set({
    actionId,
    values: initialValues(action),
    prompt: preset.prompt || '',
    mode: pickMode(action, currentModes(action), preset.mode),
    problems: {},
    error: null,
  });
}

/** Back to the list of actions. */
export function closeAction() {
  directorState.set({ actionId: '', problems: {}, error: null });
}

/**
 * Change one field of the open form (`mode` and `prompt` included).
 * @param {string} key
 * @param {string|number|boolean} value
 */
export function setDirectorField(key, value) {
  const { values, problems } = directorState.get();
  const rest = { ...problems };
  delete rest[key];
  if (key === 'mode' || key === 'prompt') directorState.set({ [key]: value, problems: rest });
  else directorState.set({ values: { ...values, [key]: value }, problems: rest });
}

/** Keep the chosen mode valid as the selection and loop region change. */
export function reconcileMode() {
  const action = currentAction();
  if (!action) return;
  const mode = pickMode(action, currentModes(action), directorState.get().mode);
  if (mode !== directorState.get().mode) directorState.set({ mode });
}

/** The first-use hint was read. */
export function dismissHint() {
  setUserPrefs({ directorHintSeen: true });
}

/** @returns {boolean} Whether to show the first-use hint */
export const hintWanted = () => !store.get(UserPrefs).directorHintSeen;
