/**
 * The project's brand kit for the editing session: the effective kit the
 * Create tab adds elements from, the inspector compares element clips with
 * and the timeline marks out-of-date clips by. It is read from the server
 * with the project and again after every change (another kit chosen, a
 * customised one saved). Until it has arrived — and whenever the server
 * cannot give one (no kit routes, a failed request, an answer that is not
 * a kit) — the built-in `clean` kit stands in, so the editor never lacks a
 * kit.
 * @module utils/brandUi/kitState
 */

import { store } from 'hybrids';
import ProjectState from '#store/ProjectState.js';
import { BUILTIN_PREFIX, DEFAULT_KIT, builtinKit, kitKey, resolveKit } from '#utils/brand/index.js';
import { isPlainObject } from '#utils/edl/jsonBag.js';
import { createObservable } from '#utils/ui/observable.js';
import { readProjectKit } from './kitApi.js';

/** @typedef {import('#utils/brand/types.js').Kit} Kit */

/**
 * @typedef {Object} KitState
 * @property {string} projectId - The project the kit belongs to; '' before one is open
 * @property {string} adaptationId - The open adaptation: its kit is the one in force
 * @property {string} choice - A library id, `builtin:<name>`, or `project`
 * @property {any} kit - The project's own kit as stored, or the chosen kit as stored; null when unknown
 * @property {Kit} effective - Complete: what `insertElement` and `restyle` take
 * @property {string} key - Its revision (`kitKey`)
 * @property {string[]} chain - Ids of the kits it was made from, child first
 * @property {{ name: string, size: number }[]} files - Files of the project's own kit
 * @property {{ path: string, message: string, level?: string }[]} problems
 * @property {'fallback'|'loading'|'ready'} status - `fallback`: the server gave
 *   no kit and the built-in one stands in
 * @property {string} error - Why the server's kit could not be used, in its words
 */

/** The kit that stands in: the same object every time. */
export const FALLBACK_KIT = resolveKit(builtinKit(DEFAULT_KIT));
/** The choice a project without one has. */
export const DEFAULT_CHOICE = `${BUILTIN_PREFIX}${DEFAULT_KIT}`;

/** @type {(projectId: string, status: KitState['status'], error?: string) => KitState} */
const standIn = (projectId, status, error = '') => ({
  ...{ projectId, adaptationId: '', choice: DEFAULT_CHOICE, kit: null, effective: FALLBACK_KIT },
  ...{ key: kitKey(FALLBACK_KIT), chain: [DEFAULT_KIT], files: [], problems: [], status, error },
});

/** @type {import('#utils/ui/observable.js').Observable<KitState>} */
export const kitState = createObservable(standIn('', 'fallback'));

/** @returns {Kit} The effective kit of the open project */
export const currentKit = () => kitState.get().effective;

/**
 * @returns {boolean} True once it is known which kit the open project uses
 *   (the server's, or — when it gave none — the built-in one). Until then
 *   nothing can be said to be out of date with it.
 */
export function kitSettled() {
  const { projectId, status } = kitState.get();
  return Boolean(projectId) && status !== 'loading';
}

/**
 * @param {any} answer - What a kit route answered
 * @returns {boolean} True when it holds a kit elements can be made from
 */
export function isKitAnswer(answer) {
  const kit = answer?.effective;
  return isPlainObject(kit) && isPlainObject(kit.tokens) && isPlainObject(kit.elements);
}

/**
 * Make an answer of `GET` or `PUT /projects/:id/kit` the session's kit.
 * @param {string} projectId
 * @param {any} answer
 * @returns {boolean} false when the answer holds no usable kit (the kit stays as it was)
 */
export function acceptKit(projectId, answer) {
  if (!isKitAnswer(answer)) return false;
  const { effective } = answer;
  const key = kitKey(effective);
  if (answer.key && answer.key !== key) {
    console.warn(`[brand] the server calls this kit ${answer.key}, the editor ${key}`);
  }
  kitState.set({
    projectId,
    adaptationId: kitState.get().projectId === projectId ? kitState.get().adaptationId : '',
    choice: typeof answer.choice === 'string' && answer.choice ? answer.choice : DEFAULT_CHOICE,
    kit: isPlainObject(answer.kit) ? answer.kit : null,
    effective,
    key,
    chain: Array.isArray(answer.chain) ? answer.chain : [],
    files: Array.isArray(answer.files) ? answer.files : [],
    problems: Array.isArray(answer.problems) ? answer.problems : [],
    status: 'ready',
    error: '',
  });
  return true;
}

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
