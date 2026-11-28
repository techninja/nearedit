/**
 * Every change the web editor makes to a clip's recipe, through the edit
 * session (`updateWebRecipe`), so undo works and autosave keeps it. Typing
 * in a box or dragging on the score strip changes the recipe many times;
 * those changes are one field interaction and so one undo step (the same
 * gesture the inspector uses).
 * @module utils/webUi/edits
 */

import { updateWebRecipe } from '#utils/edl/webClip.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { getView } from '#utils/editor/view.js';
import { cancelEdit, commitEdit, finishEdit, liveEdit } from '#utils/inspector/gesture.js';
import { selectStep, webClipOf, webEditorState } from './editorState.js';
import * as change from './recipeEdit.js';
import { retime } from './scoreStrip.js';

/** @typedef {import('#utils/web/types.js').Recipe} Recipe */
/** @typedef {'live'|'commit'|'cancel'} Phase */

/**
 * Change a clip's recipe.
 * @param {string} clipId
 * @param {string} key - Names the field being edited; live changes with
 *   one key are one undo step
 * @param {(recipe: Recipe) => Recipe} to - From the recipe the interaction started with
 * @param {Phase} [phase='commit']
 * @param {Element|null} [element] - The control, so presses inside it keep the step open
 * @returns {boolean} true when the document changed (always false while live)
 */
export function changeRecipe(clipId, key, to, phase = 'commit', element = null) {
  if (phase === 'cancel') {
    cancelEdit();
    return false;
  }
  const { autoCrossfade } = getView();
  /** @type {(doc: any) => any} */
  const operation = (doc) => updateWebRecipe(doc, clipId, to, { autoCrossfade });
  const name = `web:${clipId}:${key}`;
  if (phase === 'live') {
    liveEdit(name, operation, element);
    return false;
  }
  return commitEdit(name, operation);
}

/**
 * Set one named field of the recipe (`setRecipeField` names).
 * @param {string} clipId
 * @param {string} name
 * @param {any} value
 * @param {Phase} [phase]
 * @param {Element|null} [element]
 * @returns {boolean}
 */
export function setField(clipId, name, value, phase, element) {
  return changeRecipe(
    clipId,
    name,
    (recipe) => change.setRecipeField(recipe, name, value),
    phase,
    element,
  );
}

/**
 * Give a block of the score strip a new length.
 * @param {string} clipId
 * @param {{ part: 'lead'|'duration'|'hold'|'tail', index: number }} block
 * @param {number} frames
 * @param {Phase} [phase]
 * @param {Element|null} [element]
 * @returns {boolean}
 */
export function retimeBlock(clipId, block, frames, phase, element) {
  const fps = getDoc().fps || 30;
  const key = `time.${block.part}.${block.index}`;
  return changeRecipe(clipId, key, (recipe) => retime(recipe, block, frames, fps), phase, element);
}

/**
 * Add a step after the selected one and move the selection: at the end it
 * stays at the end (the page view then shows what the new step did),
 * otherwise it goes to the new step.
 * @param {string} clipId
 * @param {Record<string, any>} step
 * @returns {number} Index of the new step, -1 when it could not be added
 */
export function addStep(clipId, step) {
  const found = webClipOf(clipId);
  if (!found) return -1;
  const count = found.clip.web.recipe.steps.length;
  const selected = Math.min(count, webEditorState.get().selected);
  const at = selected >= count ? count : selected + 1;
  finishEdit();
  if (!edit((doc) => updateWebRecipe(doc, clipId, (recipe) => change.insertStep(recipe, at, step))))
    return -1;
  selectStep(selected >= count ? count + 1 : at);
  return at;
}

/**
 * Remove, copy or move a step, keeping the selection on the step it was on.
 * @param {string} clipId
 * @param {'remove'|'duplicate'|'move'} action
 * @param {number} index
 * @param {number} [to] - `move`: the index the step has afterwards
 * @returns {boolean}
 */
export function editStep(clipId, action, index, to = index) {
  const { selected } = webEditorState.get();
  finishEdit();
  /** @type {(recipe: Recipe) => Recipe} */
  const how =
    action === 'remove'
      ? (recipe) => change.removeStep(recipe, index)
      : action === 'duplicate'
        ? (recipe) => change.duplicateStep(recipe, index)
        : (recipe) => change.moveStep(recipe, index, to);
  if (!edit((doc) => updateWebRecipe(doc, clipId, how))) return false;
  if (action === 'remove') selectStep(change.selectionAfterRemove(selected, index));
  else if (action === 'duplicate') selectStep(index + 1);
  else selectStep(change.selectionAfterMove(selected, index, to));
  return true;
}
