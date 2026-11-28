/**
 * State of the Brand dialog: whether it is open, which of its two views
 * shows — choosing a kit, or customising one — the kits there are, and
 * what it is busy with. The kit a customisation is working on lives in
 * `draftState.js`; the project's kit itself in `kitState.js`.
 * @module utils/brandUi/dialogState
 */

import { setAppState } from '#store/AppState.js';
import { createObservable } from '#utils/ui/observable.js';

/**
 * @typedef {Object} BrandDialogState
 * @property {boolean} open
 * @property {'choose'|'customise'} view
 * @property {import('./kitApi.js').KitEntry[]} kits - Built-in and library kits
 * @property {'idle'|'loading'|'ready'|'failed'} list - Where reading the kits stands
 * @property {string} busy - What is being done right now, as words; '' when idle
 * @property {string} error - Why the last action failed, in the server's words
 * @property {{ path: string, message: string, level?: string }[]} problems - What
 *   is wrong with a kit that was not stored
 * @property {string} said - What the last action did
 */

/** @type {BrandDialogState} */
const CLOSED = {
  open: false,
  view: 'choose',
  kits: [],
  list: 'idle',
  busy: '',
  error: '',
  problems: [],
  said: '',
};

/** @type {import('#utils/ui/observable.js').Observable<BrandDialogState>} */
export const brandDialog = createObservable({ ...CLOSED });

/**
 * Open the dialog.
 * @param {'choose'|'customise'} [view]
 */
export function openBrandDialog(view = 'choose') {
  // The dialog is mounted in the dock, which a narrow screen hides while its sheet is closed.
  setAppState({ sheetOpen: true });
  brandDialog.set({ ...CLOSED, kits: brandDialog.get().kits, open: true, view });
}

/** Close the dialog. */
export function closeBrandDialog() {
  if (brandDialog.get().open) brandDialog.set({ ...CLOSED, kits: brandDialog.get().kits });
}
