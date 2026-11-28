/**
 * What a press on the web editor's page view does: it fills in the target
 * a field is waiting for, or opens a menu of the steps that can be added
 * for what was pressed.
 * @module utils/webUi/editorPicks
 */

import { selectStep, webClipOf, webEditorState } from './editorState.js';
import { addStep, setField } from './edits.js';
import { pickActions, pickTitle, pickedTarget } from './pickActions.js';
import { snapshotState } from './snapshot.js';
import { recipeProblems } from './stepForm.js';

/** @typedef {import('./editorView.js').WebEditorHost & HTMLElement} Host */

/** @type {() => string} The clip the dialog shows */
const clipId = () => webEditorState.get().clipId;

/**
 * Add a step; when it still lacks something (a text to type, a target),
 * go to it so its form shows.
 * @param {any} step
 * @param {boolean} [always] - Go to it whatever it lacks
 */
export function addAndShow(step, always = false) {
  const at = addStep(clipId(), step);
  const found = webClipOf(clipId());
  if (at < 0 || !found) return;
  if (!always && !recipeProblems(found.clip.web.recipe).steps[at]) return;
  selectStep(at);
  webEditorState.set({ tab: 'steps' });
}

/**
 * Something on the page view was pressed: the target a field is waiting
 * for, or else a menu of the steps that can be added for it.
 * @param {Host} _host
 * @param {CustomEvent} event
 */
export function handlePick(_host, event) {
  const { pick, x, y } = event.detail;
  const { picking, selected } = webEditorState.get();
  const { snapshot } = snapshotState.get();
  if (!snapshot) return;
  if (!picking) return void webEditorState.set({ menu: { x, y, pick } });
  const target = pickedTarget(pick, snapshot);
  if (!target) return;
  setField(clipId(), `steps.${selected}.${picking}`, target);
  webEditorState.set({ picking: '' });
}

/** "Pick" of a target box: wait for a press on the page view (again: stop waiting). @param {Host} _host @param {CustomEvent} event */
export function handlePickField(_host, event) {
  const { name } = event.detail;
  const waiting = webEditorState.get().picking === name;
  webEditorState.set({ picking: waiting ? '' : name, tab: 'page', mode: 'page', menu: null });
}

/** Close the menu of a pick. */
export const handleMenuClose = () => webEditorState.set({ menu: null });

/**
 * The menu of what was pressed on the page view.
 * @param {import('./editorState.js').WebEditorState['menu']} menu
 * @param {import('./pageMap.js').Snapshot|null} snapshot
 * @returns {import('#utils/timeline/menuModel.js').MenuItem[]}
 */
export function pickMenu(menu, snapshot) {
  if (!menu || !snapshot) return [];
  const { pick, x, y } = menu;
  /** @type {import('#utils/timeline/menuModel.js').MenuItem[]} */
  const items = [{ label: pickTitle(pick, snapshot), disabled: true }, { separator: true }];
  for (const action of pickActions(pick, snapshot))
    items.push({ label: action.label, run: () => addAndShow(action.step) });
  if (pick.element) {
    const point = { element: null, point: pick.point };
    const reopen = () => webEditorState.set({ menu: { x, y, pick: point } });
    // After this menu has closed: it clears the menu state as it goes.
    items.push(
      { separator: true },
      { label: 'This point instead…', run: () => setTimeout(reopen) },
    );
  }
  return items;
}
