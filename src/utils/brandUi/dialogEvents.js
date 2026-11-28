/**
 * What the Brand dialog (`<brand-dialog>`) does with what happens in it:
 * a kit is chosen or removed, a customisation is started or given up, and
 * element clips are brought up to date — only ever when asked. What a
 * customisation itself does is in `dialogDraftEvents.js`.
 * @module utils/brandUi/dialogEvents
 */

import { confirmAction } from '#utils/ui/confirm.js';
import { refocusIfLost } from '#utils/ui/focus.js';
import { brandDialog, closeBrandDialog } from './dialogState.js';
import { beginDraft, draftState, endDraft } from './draftState.js';
import { chooseKit, deleteKit, loadKits } from './kitList.js';
import { kitState, reloadKit } from './kitState.js';
import { elementsWord, updateToBrand } from './stale.js';

/**
 * @typedef {Object} BrandDialogHost
 * @property {import('./dialogState.js').BrandDialogState} state
 * @property {import('./kitState.js').KitState} kit
 * @property {import('./draftState.js').DraftState} draft
 * @property {any} doc - The open document
 * @property {import('#store/TimelineState.js').TimelineStateShape} timeline
 * @property {boolean} naming - "Save to library as…" is asking for a name
 * @property {string} libraryName
 * @property {boolean} [services] - Internal: keeps the project's kit loaded
 * @property {boolean} [opened] - Internal: tells the dialog it was opened
 */

/** @typedef {BrandDialogHost & HTMLElement} Host */

/**
 * Give up a customisation — after asking, when something was changed.
 * @returns {Promise<boolean>} false when the person wants to keep working on it
 */
async function leaveDraft() {
  const { draft, dirty } = draftState.get();
  if (draft && dirty) {
    const sure = await confirmAction({
      title: 'Discard the changes to the brand?',
      message: 'The colours, fonts and files you set here were not saved.',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      danger: true,
    });
    if (!sure) return false;
  }
  endDraft();
  return true;
}

/** The dialog was opened: read the kits there are. @param {Host} _host @param {boolean} open @param {boolean} was */
export function handleOpened(_host, open, was) {
  if (open && !was) loadKits();
}

/**
 * After every render: the kits may only just have arrived, or the view
 * changed under the focused button. Focus that fell out of the dialog goes
 * to the kit in use, or to the first field of the form.
 * @param {Host} host
 */
export function keepFocus(host) {
  if (!host.state.open) return;
  requestAnimationFrame(() =>
    refocusIfLost(host, '.brand-kit-card[aria-pressed="true"], brand-token-editor input'),
  );
}

/** Close the dialog. @param {Host} host */
export async function handleClose(host) {
  if (!(await leaveDraft())) return;
  host.naming = false;
  closeBrandDialog();
}

/** A kit was pressed: it becomes the project's. @param {Host} _host @param {CustomEvent} event */
export function handleChoose(_host, event) {
  event.stopPropagation();
  chooseKit(event.detail.id);
}

/** A library kit's remove button. @param {Host} _host @param {CustomEvent} event */
export async function handleRemove(_host, event) {
  event.stopPropagation();
  const { id, name } = event.detail;
  const sure = await confirmAction({
    title: `Remove “${name}” from the library?`,
    message:
      'Projects that use it go back to the built-in Clean kit. Elements already on timelines keep the look they have.',
    confirmLabel: 'Remove',
    danger: true,
  });
  if (!sure || !(await deleteKit(id))) return;
  // The open project may have been using it.
  if (kitState.get().choice === id) await reloadKit();
}

/** "Customise…": shape the kit in use for this project. @param {Host} host */
export async function handleCustomise(host) {
  await beginDraft();
  host.naming = false;
  brandDialog.set({ view: 'customise', error: '', problems: [], said: '' });
}

/** "All kits": back to choosing. @param {Host} host */
export async function handleBack(host) {
  if (!(await leaveDraft())) return;
  host.naming = false;
  brandDialog.set({ view: 'choose', error: '', problems: [], said: '' });
}

/** "Update N elements to brand": every out-of-date clip, one undo step. */
export function handleUpdate() {
  const changed = updateToBrand();
  brandDialog.set({ said: changed ? `Updated ${elementsWord(changed)} to the brand.` : '' });
}
