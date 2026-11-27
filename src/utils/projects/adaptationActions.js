/**
 * What the project page can do to adaptations: create (optionally as a
 * copy of the parent), edit, set the status, delete.
 * @module utils/projects/adaptationActions
 */

import { createAdaptation, deleteAdaptation, updateAdaptation } from '#utils/projects/api.js';
import {
  createRequest,
  initialAdaptationForm,
  updateRequest,
} from '#utils/projects/adaptationForm.js';
import { validateAdaptationForm, withAspect } from '#utils/projects/adaptationForm.js';
import { projectPageState, reloadProject } from '#utils/projects/projectPage.js';
import { deletionEffect, deletionMessage } from '#utils/projects/tree.js';
import { confirmAction } from '#utils/ui/confirm.js';
import { showError, showToast } from '#utils/ui/toast.js';

/**
 * @typedef {Object} AdaptationDialog
 * @property {string} editingId - '' when creating
 * @property {import('#utils/projects/adaptationForm.js').AdaptationFormValues} values
 * @property {Record<string, string>} errors - Field → problem
 * @property {boolean} busy
 * @property {string} error - Why the server refused
 */

/** @param {string} id @returns {import('#utils/projects/api.js').Adaptation|undefined} */
const find = (id) => projectPageState.get().project?.adaptations.find((a) => a.id === id);

/** @param {Partial<AdaptationDialog>} patch */
function patchDialog(patch) {
  const { dialog } = projectPageState.get();
  if (dialog) projectPageState.set({ dialog: { ...dialog, ...patch } });
}

/**
 * Open the form for a new adaptation.
 * @param {string} [parentId] - Make it a variant of this adaptation
 */
export function openNewAdaptation(parentId = '') {
  const values = initialAdaptationForm({ parent: find(parentId) || null });
  projectPageState.set({ dialog: { editingId: '', values, errors: {}, busy: false, error: '' } });
}

/** Open the form on an existing adaptation. @param {string} id */
export function openEditAdaptation(id) {
  const editing = find(id);
  if (!editing) return;
  const values = initialAdaptationForm({ editing });
  projectPageState.set({ dialog: { editingId: id, values, errors: {}, busy: false, error: '' } });
}

/** Close the form. */
export const closeAdaptationDialog = () => projectPageState.set({ dialog: null });

/**
 * Change one field of the open form.
 * @param {string} key
 * @param {string|number|boolean} value
 */
export function setAdaptationField(key, value) {
  const { dialog } = projectPageState.get();
  if (!dialog) return;
  let values = { ...dialog.values, [key]: value };
  if (key === 'aspectRatio') values = withAspect(dialog.values, String(value));
  // A variant is offered as a copy; without a parent there is nothing to copy.
  if (key === 'parentId') values.copy = Boolean(value);
  patchDialog({ values, errors: {}, error: '' });
}

/** Create or update from the open form. @returns {Promise<void>} */
export async function submitAdaptation() {
  const { id, dialog } = projectPageState.get();
  if (!dialog || dialog.busy) return;
  const errors = validateAdaptationForm(dialog.values);
  if (Object.keys(errors).length) return patchDialog({ errors });
  patchDialog({ busy: true, error: '' });
  try {
    const saved = dialog.editingId
      ? await updateAdaptation(id, dialog.editingId, updateRequest(dialog.values))
      : await createAdaptation(id, createRequest(dialog.values));
    await reloadProject();
    closeAdaptationDialog();
    const done = dialog.editingId ? 'Saved' : dialog.values.copy ? 'Created a copy as' : 'Created';
    showToast({ kind: 'success', title: `${done} “${saved.name}”` });
  } catch (err) {
    patchDialog({ busy: false, errors: err.body?.fields || {}, error: err.message });
  }
}

/**
 * @param {import('#utils/projects/api.js').Adaptation} adaptation
 * @param {string} status
 * @returns {Promise<void>}
 */
export async function setAdaptationStatus(adaptation, status) {
  try {
    await updateAdaptation(projectPageState.get().id, adaptation.id, { status });
  } catch (err) {
    showError('Could not change the status', err);
  }
  await reloadProject();
}

/**
 * Delete an adaptation after telling the user what happens to its variants.
 * @param {import('#utils/projects/api.js').Adaptation} adaptation
 * @returns {Promise<void>}
 */
export async function removeAdaptation(adaptation) {
  const { id, project } = projectPageState.get();
  const effect = deletionEffect(project?.adaptations || [], adaptation.id);
  if (!effect.allowed) {
    showToast({
      title: 'A project needs at least one adaptation',
      detail: 'Create another one first.',
    });
    return;
  }
  const sure = await confirmAction({
    title: `Delete “${adaptation.name}”?`,
    message: deletionMessage(adaptation.name, effect),
    confirmLabel: 'Delete adaptation',
    danger: true,
  });
  if (!sure) return;
  try {
    await deleteAdaptation(id, adaptation.id);
    showToast({ title: `Deleted “${adaptation.name}”` });
  } catch (err) {
    showError('Could not delete the adaptation', err);
  }
  await reloadProject();
}
