/**
 * Transport ↔ ViewState — the only place playback writes to the store, and
 * only ever to ViewState (never the document).
 *
 * `store.set` lands a microtask later, and the transport acts faster than
 * that (seek then play in one handler, sixty playhead writes a second), so
 * it keeps a working copy of the two positions it owns and trusts the store
 * again as soon as its own writes have landed.
 * @module utils/playback/transportView
 */

import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';

const local = { playheadPosition: 0, cursorPosition: 0 };
let pendingWrites = 0;

/**
 * Playhead and cursor as they will be once pending writes land.
 * @returns {{ playheadPosition: number, cursorPosition: number }}
 */
export function viewNow() {
  if (!pendingWrites) {
    const view = store.get(ViewState);
    local.playheadPosition = view.playheadPosition;
    local.cursorPosition = view.cursorPosition;
  }
  return local;
}

/**
 * Write transport fields to ViewState.
 * @param {Partial<import('#store/ViewState.js').ViewStateShape>} values
 */
export function commit(values) {
  viewNow();
  if ('playheadPosition' in values) local.playheadPosition = values.playheadPosition;
  if ('cursorPosition' in values) local.cursorPosition = values.cursorPosition;
  pendingWrites++;
  store
    .set(ViewState, values)
    .catch((err) => console.error('[transport] could not update view state:', err))
    .finally(() => pendingWrites--);
}
