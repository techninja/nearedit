/**
 * Opening and saving an adaptation — glue between the API, the edit
 * session and the stores. The editor page calls `openAdaptation` on entry
 * and `closeAdaptation` on exit; everything in between autosaves.
 * @module utils/editor/project
 */

import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import ViewState from '#store/ViewState.js';
import { api } from '#utils/api/http.js';
import { fromSavedDocument, toSavedDocument } from '#utils/edl/savedDocument.js';
import { getDoc, loadDoc, onDocChange } from '#utils/editor/session.js';

const SAVE_DELAY_MS = 800;

let saveTimer = 0;
let saving = false;
let saveAgain = false;
/** @type {(() => void)|null} */
let stopListening = null;
/** @type {{ projectId: string, adaptationId: string }|null} */
let open = null;

/** @param {Partial<import('#store/ProjectState.js').ProjectStateShape>} patch */
function setProject(patch) {
  store.set(ProjectState, patch).catch((err) => console.error('[project] store update:', err));
}

/**
 * Write the current document (with view fields) to the server now.
 * @returns {Promise<boolean>} true when the save succeeded
 */
export async function saveNow() {
  clearTimeout(saveTimer);
  if (!open) return false;
  if (saving) {
    saveAgain = true;
    return false;
  }
  saving = true;
  const { projectId, adaptationId } = open;
  try {
    const body = toSavedDocument(getDoc(), store.get(ViewState));
    await api(`/projects/${projectId}/edl/${adaptationId}`, { method: 'PUT', body });
    if (open?.adaptationId === adaptationId) setProject({ dirty: saveAgain, saveError: '' });
    return true;
  } catch (err) {
    if (open?.adaptationId === adaptationId) setProject({ saveError: err.message });
    return false;
  } finally {
    saving = false;
    if (saveAgain) {
      saveAgain = false;
      scheduleSave();
    }
  }
}

/** Save shortly, coalescing bursts of edits into one request. */
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = /** @type {any} */ (setTimeout(saveNow, SAVE_DELAY_MS));
}

/**
 * Load an adaptation into the editor.
 * @param {string} projectId
 * @param {string} adaptationId
 * @returns {Promise<{ project: any, adaptation: any }>}
 * @throws {import('#utils/api/http.js').ApiError} when the project, adaptation or EDL cannot be loaded
 */
export async function openAdaptation(projectId, adaptationId) {
  await closeAdaptation();
  setProject({ projectId, adaptationId, loaded: false, dirty: false, saveError: '' });
  const project = await api(`/projects/${projectId}`);
  const adaptation = (project.adaptations || []).find((a) => a.id === adaptationId);
  if (!adaptation) throw new Error('Adaptation not found in this project');
  const saved = await api(`/projects/${projectId}/edl/${adaptationId}`);
  const { edl, view } = fromSavedDocument(saved);
  loadDoc(edl);
  await store.set(ViewState, { ...view, playing: false, selection: [], scrollY: 0 });
  open = { projectId, adaptationId };
  stopListening = onDocChange((_doc, info) => {
    if (info.transient || info.reason === 'load') return;
    setProject({ dirty: true });
    scheduleSave();
  });
  setProject({
    projectName: project.name || '',
    adaptationName: adaptation.name || '',
    aspectRatio: adaptation.aspectRatio || '16:9',
    loaded: true,
  });
  return { project, adaptation };
}

/**
 * Flush pending changes and detach from the open adaptation.
 * @returns {Promise<void>}
 */
export async function closeAdaptation() {
  stopListening?.();
  stopListening = null;
  if (open && store.get(ProjectState).dirty) await saveNow();
  clearTimeout(saveTimer);
  open = null;
  setProject({ loaded: false });
}

/** @returns {{ projectId: string, adaptationId: string }|null} What is open */
export const currentAdaptation = () => open;
