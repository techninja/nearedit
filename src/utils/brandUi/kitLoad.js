/**
 * Reading the project's kit from the server and keeping it in step with
 * what is open in the editor. What is read is the kit of the open
 * adaptation — the project's, unless that adaptation names another. A
 * request that fails leaves the built-in kit in place: it is remembered,
 * never thrown.
 * @module utils/brandUi/kitLoad
 */

import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { chooseProjectKit, readProjectKit } from './kitApi.js';
import { acceptKit, kitState, standIn } from './kitState.js';

/**
 * Read a project's kit from the server — the kit of the open adaptation,
 * which is the project's unless the adaptation names another. A failure
 * leaves the built-in kit in place and is remembered in `error`; it is
 * never thrown.
 * @param {string} projectId
 * @param {string} [adaptationId]
 * @returns {Promise<boolean>} true when the server's kit is now in use
 */
export async function loadProjectKit(projectId, adaptationId = '') {
  if (!projectId) return false;
  const open = () => {
    const now = kitState.get();
    return now.projectId === projectId && now.adaptationId === adaptationId;
  };
  if (!open()) kitState.set({ ...standIn(projectId, 'loading'), adaptationId });
  /** @type {(error: string) => void} */
  const fall = (error) => kitState.set({ ...standIn(projectId, 'fallback', error), adaptationId });
  try {
    const answer = await readProjectKit(projectId, adaptationId);
    // The project was closed, or another opened, while the request was out.
    if (!open()) return false;
    if (acceptKit(projectId, answer)) return true;
    fall('The server answered without a kit');
  } catch (err) {
    if (!open()) return false;
    console.warn('[brand] no kit from the server, using the built-in one:', err.message);
    fall(err.message);
  }
  return false;
}

/** @returns {Promise<boolean>} Read the open project's kit again */
export function reloadKit() {
  const { projectId, adaptationId } = kitState.get();
  return loadProjectKit(projectId, adaptationId);
}

/**
 * Keep the kit in step with what is open: load it when a project (or
 * another of its adaptations) has opened, go back to the built-in kit when
 * it closes.
 * @returns {() => void} Stop watching
 */
export function watchProjectKit() {
  const follow = (/** @type {any} */ project) => {
    const id = project?.loaded ? project.projectId : '';
    const adaptation = id ? project.adaptationId || '' : '';
    const now = kitState.get();
    if (id === now.projectId && adaptation === now.adaptationId) return;
    if (id) loadProjectKit(id, adaptation);
    else kitState.set(standIn('', 'fallback'));
  };
  follow(store.get(ProjectState));
  return store.observe(ProjectState, (_id, project) => follow(project));
}

/**
 * After the project's kit was chosen or written: the answer that holds for
 * the open adaptation. An adaptation that named a kit of its own goes with
 * the project again — what was just chosen is what the open timeline uses.
 * @param {import('./kitApi.js').KitAnswer} answer - Of the project-wide request
 * @returns {Promise<import('./kitApi.js').KitAnswer>}
 */
export async function forOpenAdaptation(answer) {
  const { projectId, adaptationId } = kitState.get();
  if (!adaptationId) return answer;
  const mine = await readProjectKit(projectId, adaptationId);
  if (mine.choice === answer.choice) return mine;
  return chooseProjectKit(projectId, '', adaptationId);
}
