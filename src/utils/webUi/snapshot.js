/**
 * The page as it stands before a step, for the web editor's page view:
 * asks `POST /api/web/snapshot` to play the first `until` steps of a
 * recipe. Requests wait a moment for the recipe to stop changing, a newer
 * request replaces one that is under way, and answers are remembered, so
 * going back and forth between steps asks nothing twice.
 * @module utils/webUi/snapshot
 */

import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { api } from '#utils/api/http.js';
import { createObservable } from '#utils/ui/observable.js';
import { recipeKey } from '#utils/web/index.js';
import { forgetSaid, rememberSaid } from './saidMemory.js';
import { recipeProblems } from './stepForm.js';

/** @typedef {import('./pageMap.js').Snapshot} Snapshot */

/**
 * @typedef {Object} SnapshotState
 * @property {boolean} busy - A snapshot is on its way
 * @property {string} error - Why the page cannot be shown; '' when it can
 * @property {Snapshot|null} snapshot - The last one that arrived; while
 *   `busy` or after an error it may be of an earlier state of the page
 * @property {string} key - What `snapshot` is a picture of
 * @property {string} wanted - What was asked for last
 */

/** Milliseconds a changing recipe is given to settle before the browser is asked. */
export const SNAPSHOT_DELAY = 450;
const REMEMBERED = 16;

/** @type {SnapshotState} */
const EMPTY = { busy: false, error: '', snapshot: null, key: '', wanted: '' };

/** @type {import('#utils/ui/observable.js').Observable<SnapshotState>} */
export const snapshotState = createObservable({ ...EMPTY });

/** @type {Map<string, Snapshot>} */
const remembered = new Map();
let timer = 0;
/** @type {AbortController|null} */
let asking = null;

/**
 * The recipe a snapshot plays: its first steps only.
 * @param {any} recipe
 * @param {number} until
 * @returns {any}
 */
export const playedPart = (recipe, until) => ({ ...recipe, steps: recipe.steps.slice(0, until) });

/**
 * @param {any} recipe
 * @param {number} until
 * @returns {string} Equal for two requests that show the same page
 */
export const snapshotKey = (recipe, until) => recipeKey(playedPart(recipe, until), 30);

/**
 * @param {any} err - From `api()`
 * @returns {string} What went wrong, with the server's detail
 */
export function errorText(err) {
  const fields = Object.entries(err?.body?.fields || {}).map(([path, text]) => `${path}: ${text}`);
  return [err?.message || 'The page could not be loaded', err?.body?.detail, ...fields]
    .filter(Boolean)
    .join(' — ');
}

/** Stop whatever is waiting or under way. */
function halt() {
  clearTimeout(timer);
  asking?.abort();
  asking = null;
}

/**
 * @param {string} key
 * @param {any} recipe - The played part
 * @param {number} until
 */
async function ask(key, recipe, until) {
  const controller = new AbortController();
  asking = controller;
  const { projectId } = store.get(ProjectState);
  try {
    const body = { recipe, until, ...(projectId && { projectId }) };
    const snapshot = await api('/web/snapshot', { body, signal: controller.signal });
    if (remembered.size >= REMEMBERED) remembered.delete(remembered.keys().next().value);
    remembered.set(key, snapshot);
    if (asking === controller) snapshotState.set({ busy: false, error: '', snapshot, key });
  } catch (err) {
    if (controller.signal.aborted) return;
    rememberSaid(recipe, errorText(err));
    if (asking === controller) snapshotState.set({ busy: false, error: errorText(err) });
  } finally {
    if (asking === controller) asking = null;
  }
}

/**
 * Show the page as it is after the first `until` steps of a recipe.
 * @param {any} recipe - Normalised
 * @param {number} until - Steps to play first
 * @param {{ delay?: number, fresh?: boolean }} [opts] - `fresh`: ask the
 *   browser again even when the answer is remembered ("Refresh view")
 */
export function showSnapshot(recipe, until, { delay = SNAPSHOT_DELAY, fresh = false } = {}) {
  const part = playedPart(recipe, until);
  const key = snapshotKey(recipe, until);
  if (!fresh && key === snapshotState.get().wanted) return;
  halt();
  const known = fresh ? undefined : remembered.get(key);
  if (known)
    return void snapshotState.set({ busy: false, error: '', snapshot: known, key, wanted: key });
  const problems = recipeProblems(part);
  const [step] = Object.keys(problems.steps);
  const problem =
    problems.recipe.url ||
    (step !== undefined && `Step ${Number(step) + 1}: ${Object.values(problems.steps[step])[0]}`);
  if (problem) return void snapshotState.set({ busy: false, error: problem, wanted: key });
  snapshotState.set({ busy: true, error: '', wanted: key });
  timer = /** @type {any} */ (setTimeout(() => ask(key, part, until), delay));
}

/** Forget everything (the dialog closed). */
export function resetSnapshots() {
  halt();
  remembered.clear();
  forgetSaid();
  snapshotState.set({ ...EMPTY });
}
