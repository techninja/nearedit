/**
 * Transport loop settings. Looping lives in ViewState
 * (`loopEnabled`, `loopStart`, `loopEnd`) and is read by the transport on
 * every frame, so changes take effect immediately, also mid-play.
 * Re-exported by transport.js — import from there.
 * @module utils/playback/transportLoop
 */

import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { commit } from '#utils/playback/transportView.js';

/**
 * Turn looping on or off.
 * @param {boolean} [enabled] - Omit to toggle
 */
export function setLoop(enabled = !store.get(ViewState).loopEnabled) {
  commit({ loopEnabled: Boolean(enabled) });
}

/**
 * Set the loop region. An empty region loops the whole timeline.
 * @param {number} start - Seconds
 * @param {number} end - Seconds
 */
export function setLoopRange(start, end) {
  const from = Math.max(0, Math.min(start, end));
  commit({ loopStart: from, loopEnd: Math.max(from, start, end) });
}
