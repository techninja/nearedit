/**
 * The project's brand kit for the editing session: the effective kit the
 * Create tab adds elements from, the inspector compares element clips with
 * and the timeline marks out-of-date clips by. It is read from the server
 * with the project (`kitLoad.js`) and again after every change (another
 * kit chosen, a customised one saved). Until it has arrived — and whenever
 * the server cannot give one (no kit routes, a failed request, an answer
 * that is not a kit) — the built-in `clean` kit stands in, so the editor
 * never lacks a kit.
 * @module utils/brandUi/kitState
 */

import { BUILTIN_PREFIX, DEFAULT_KIT, builtinKit, kitKey, resolveKit } from '#utils/brand/index.js';
import { isPlainObject } from '#utils/edl/jsonBag.js';
import { createObservable } from '#utils/ui/observable.js';
import { rememberOwnKit } from './ownKit.js';

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

/**
 * The built-in kit standing in for a project's.
 * @type {(projectId: string, status: KitState['status'], error?: string) => KitState}
 */
export const standIn = (projectId, status, error = '') => ({
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
  if (answer.choice === 'project') rememberOwnKit(projectId, effective);
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
