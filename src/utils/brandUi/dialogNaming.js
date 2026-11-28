/**
 * "Save to library as…" in the Brand dialog: the footer asks for a name,
 * and the customisation is saved under it as a kit other projects can
 * choose — after asking, when a kit of that name is there already.
 * @module utils/brandUi/dialogNaming
 */

import { confirmAction } from '#utils/ui/confirm.js';
import { brandDialog } from './dialogState.js';
import { slugOf } from './draftNames.js';
import { saveToLibrary } from './saveKit.js';

/** @typedef {import('./dialogEvents.js').BrandDialogHost & HTMLElement} Host */

/** "Save to library as…": ask for the name. @param {Host} host */
export function handleNaming(host) {
  host.naming = true;
  requestAnimationFrame(() => {
    /** @type {HTMLInputElement|null} */ (host.querySelector('.brand-dialog-name'))?.focus();
  });
}

/** @param {Host} host @param {Event} event */
export function handleName(host, event) {
  host.libraryName = /** @type {HTMLInputElement} */ (event.target).value;
}

/** @param {Host} host */
export function handleNamingCancel(host) {
  host.naming = false;
}

/** Save under the name that was typed. @param {Host} host */
export async function handleSaveAs(host) {
  const name = host.libraryName.trim();
  const id = slugOf(name);
  const there = brandDialog.get().kits.find((kit) => kit.source === 'library' && kit.id === id);
  if (there) {
    const sure = await confirmAction({
      title: `Replace “${there.name}” in the library?`,
      message: 'A kit of that name is there already. Projects that use it will find the new look.',
      confirmLabel: 'Replace',
    });
    if (!sure) return;
  }
  if (await saveToLibrary(name)) host.naming = false;
}

/** Enter saves, Escape puts the name away; no key reaches anything else. @param {Host} host @param {KeyboardEvent} event */
export function handleNameKeys(host, event) {
  event.stopPropagation();
  if (event.key === 'Enter') handleSaveAs(host);
  else if (event.key === 'Escape') handleNamingCancel(host);
}
