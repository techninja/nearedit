/**
 * Changing the document without it being an edit. A finished rendering is
 * a fact about a song, not something its author did: attaching it must add
 * no undo step and must leave redo alone (`commit(next, { record: false })`
 * of the edit session). A drag or a field being typed into works from the
 * document it started with and would throw the change away, so the change
 * waits until that is over.
 * @module utils/musicUi/amend
 */

import { commit, getDoc, inGesture } from '#utils/editor/session.js';

/** How often a waiting change looks whether the gesture is over (ms). */
const RETRY_MS = 120;

/**
 * Apply a pure operation to the current document outside history.
 * @param {(doc: any) => any} operation
 * @returns {boolean} false when nothing changed, and while a gesture is
 *   under way (nothing is applied then)
 */
export function amend(operation) {
  if (inGesture()) return false;
  return commit(operation(getDoc()), { record: false });
}

/**
 * Apply a pure operation outside history as soon as no gesture is under
 * way. The operation sees the document as it is then.
 * @param {(doc: any) => any} operation
 * @returns {Promise<boolean>} Whether the document changed
 */
export function amendWhenIdle(operation) {
  return new Promise((resolve) => {
    const attempt = () => {
      if (inGesture()) return void setTimeout(attempt, RETRY_MS);
      resolve(amend(operation));
    };
    attempt();
  });
}
