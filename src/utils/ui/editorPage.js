/**
 * Editor page lifecycle: open an adaptation (document, media library,
 * keyboard shortcuts), keep it saved, and close it all again on leave.
 * The page reads `editorPageState` for its loading and failure views.
 * @module utils/ui/editorPage
 */

import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { closeAdaptation, openAdaptation, saveNow } from '#utils/editor/project.js';
import { canRedo, canUndo, onDocChange } from '#utils/editor/session.js';
import { destroyKeyboard, initKeyboard } from '#utils/keyboard/index.js';
import { clearLibrary, loadLibrary } from '#utils/media/library.js';
import { describeFailure } from '#utils/ui/editorFailure.js';
import { createObservable } from '#utils/ui/observable.js';
import { setPageTitle } from '#utils/ui/title.js';

/**
 * @typedef {Object} EditorPageState
 * @property {'idle'|'loading'|'ready'|'failed'} status
 * @property {'project'|'adaptation'|'other'|''} missing - What could not be found, when failed
 * @property {string} message - Why opening failed
 * @property {boolean} canUndo
 * @property {boolean} canRedo
 * @property {boolean} exportOpen
 */

const IDLE = {
  status: /** @type {EditorPageState['status']} */ ('idle'),
  missing: /** @type {EditorPageState['missing']} */ (''),
  message: '',
  canUndo: false,
  canRedo: false,
  exportOpen: false,
};

/** @type {import('#utils/ui/observable.js').Observable<EditorPageState>} */
export const editorPageState = createObservable({ ...IDLE });

/** Opens and closes run one after another, never interleaved. */
let queue = Promise.resolve();
/** @type {(() => void)[]} */
let cleanups = [];

/** Ctrl/Cmd+S saves now instead of opening the browser's "save page". */
function onKeydown(/** @type {KeyboardEvent} */ event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 's') return;
  event.preventDefault();
  saveNow();
}

/** Closing the tab with unsaved changes: save, and let the browser ask. */
function onBeforeUnload(/** @type {BeforeUnloadEvent} */ event) {
  const { loaded, dirty, saveError } = store.get(ProjectState);
  if (!loaded || (!dirty && !saveError)) return;
  saveNow();
  event.preventDefault();
}

/** A tab going to the background may never come back (phones): save first. */
function onVisibility() {
  if (globalThis.document.visibilityState === 'hidden' && store.get(ProjectState).dirty) saveNow();
}

/**
 * @param {string} projectId
 * @param {string} adaptationId
 * @returns {Promise<void>}
 */
async function open(projectId, adaptationId) {
  editorPageState.set({ ...IDLE, status: 'loading' });
  initKeyboard();
  const syncHistory = () => editorPageState.set({ canUndo: canUndo(), canRedo: canRedo() });
  globalThis.addEventListener('keydown', onKeydown);
  globalThis.addEventListener('beforeunload', onBeforeUnload);
  globalThis.document.addEventListener('visibilitychange', onVisibility);
  cleanups = [
    onDocChange(syncHistory),
    () => globalThis.removeEventListener('keydown', onKeydown),
    () => globalThis.removeEventListener('beforeunload', onBeforeUnload),
    () => globalThis.document.removeEventListener('visibilitychange', onVisibility),
  ];
  try {
    const { project, adaptation } = await openAdaptation(projectId, adaptationId);
    loadLibrary(projectId);
    setPageTitle(adaptation.name, project.name);
    editorPageState.set({ status: 'ready' });
    syncHistory();
  } catch (err) {
    setPageTitle('Could not open the editor');
    editorPageState.set({ status: 'failed', ...describeFailure(err) });
  }
}

/** @returns {Promise<void>} */
async function close() {
  for (const cleanup of cleanups.splice(0)) cleanup();
  destroyKeyboard();
  await closeAdaptation();
  clearLibrary();
  editorPageState.set({ ...IDLE });
}

/**
 * Open an adaptation in the editor.
 * @param {string} projectId
 * @param {string} adaptationId
 * @returns {Promise<void>}
 */
export function enterEditor(projectId, adaptationId) {
  queue = queue.then(close).then(() => open(projectId, adaptationId));
  return queue;
}

/** Leave the editor: flush the last changes and release everything. @returns {Promise<void>} */
export function leaveEditor() {
  queue = queue.then(close);
  return queue;
}

/** @param {boolean} exportOpen */
export const setExportOpen = (exportOpen) => editorPageState.set({ exportOpen });
