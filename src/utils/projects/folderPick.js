/**
 * Choosing a folder on the server, as a promise:
 * `const folder = await pickFolder({ title })`. The router mounts one
 * `<folder-browser>` that shows the request; this module holds its state
 * and talks to `GET /api/browse` and `POST /api/browse/mkdir`.
 * @module utils/projects/folderPick
 */

import { browseFolder, makeFolder } from '#utils/projects/api.js';
import { createObservable } from '#utils/ui/observable.js';

/**
 * @typedef {Object} PickRequest
 * @property {string} title
 * @property {string} confirmLabel
 * @property {string} projectNote - Shown when the folder already holds a project; '' = none
 * @typedef {{ path: string, hasProject: boolean }} PickedFolder
 * @typedef {Object} FolderPickState
 * @property {PickRequest|null} request - null while no dialog is open
 * @property {import('#utils/projects/api.js').FolderListing|null} listing
 * @property {boolean} loading
 * @property {string} error
 * @property {boolean} naming - The "new folder" row is open
 * @property {string} newError - Why the last "new folder" attempt failed
 * @property {boolean} nativeBusy - The server's own dialog is open
 * @property {boolean} nativeTried - It was tried and gave nothing, so it is not offered again
 */

/** @type {import('#utils/ui/observable.js').Observable<FolderPickState>} */
export const folderPickState = createObservable({
  request: null,
  listing: null,
  loading: false,
  error: '',
  naming: false,
  newError: '',
  nativeBusy: false,
  nativeTried: false,
});

/** @type {((folder: PickedFolder|null) => void)|null} */
let resolvePick = null;
let lastPath = '';

/**
 * Show a folder in the browser.
 * @param {string} [path] - Omit for the first browse root
 * @returns {Promise<boolean>} false when it could not be listed (the previous listing stays)
 */
export async function browseTo(path) {
  folderPickState.set({ loading: true, error: '', naming: false });
  try {
    const listing = await browseFolder(path);
    lastPath = listing.path;
    folderPickState.set({ listing, loading: false });
    return true;
  } catch (err) {
    folderPickState.set({ loading: false, error: err.message });
    return false;
  }
}

/**
 * Open the folder browser.
 * @param {{ title?: string, confirmLabel?: string, projectNote?: string, startPath?: string }} [options]
 * @returns {Promise<PickedFolder|null>} null when dismissed
 */
export function pickFolder(options = {}) {
  resolvePick?.(null);
  const request = {
    title: options.title || 'Choose a folder',
    confirmLabel: options.confirmLabel || 'Choose this folder',
    projectNote: options.projectNote || '',
  };
  folderPickState.set({ request, listing: null, error: '', naming: false });
  // Start where the user was last; fall back to the first root when that is gone.
  browseTo(options.startPath || lastPath).then((ok) => ok || browseTo());
  return new Promise((resolve) => {
    resolvePick = resolve;
  });
}

/**
 * Close the browser.
 * @param {PickedFolder|null} folder - null = dismissed
 */
function finish(folder) {
  resolvePick?.(folder);
  resolvePick = null;
  folderPickState.set({ request: null });
}

/** Dismiss the browser without a choice. */
export const cancelPick = () => finish(null);

/** Choose the folder being shown. */
export function chooseCurrent() {
  const { listing } = folderPickState.get();
  if (listing) finish({ path: listing.path, hasProject: listing.hasProject });
}

/**
 * Open or close the "new folder" row.
 * @param {boolean} naming
 */
export function setNaming(naming) {
  folderPickState.set({ naming, newError: '' });
}

/**
 * Create a folder inside the one being shown and go into it. A failure is
 * left in `newError` for the form to show.
 * @param {string} name
 * @returns {Promise<void>}
 */
export async function createFolder(name) {
  const { listing } = folderPickState.get();
  if (!listing) return;
  try {
    const created = await makeFolder(listing.path, name.trim());
    await browseTo(created.path);
  } catch (err) {
    folderPickState.set({ newError: err.body?.fields?.name || err.message });
  }
}
