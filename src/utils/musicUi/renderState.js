/**
 * Where the music clips that wait for a rendering stand: being rendered,
 * or failed with the sentence the server gave. Kept apart from the
 * requests (`rendering.js`) so that the timeline and the inspector can
 * read it without anything of the network.
 * @module utils/musicUi/renderState
 */

import { createObservable } from '#utils/ui/observable.js';

/** @typedef {{ status: 'rendering'|'failed', key: string, message: string }} RenderStatus */

/** @type {import('#utils/ui/observable.js').Observable<{ byClip: Record<string, RenderStatus> }>} */
export const renderState = createObservable({ byClip: {} });

/**
 * @param {string} clipId
 * @returns {RenderStatus|null} null for a clip that waits for nothing
 */
export const renderStatusOf = (clipId) => renderState.get().byClip[clipId] || null;

/**
 * Say where every waiting clip stands. Nothing is announced when nothing changed.
 * @param {Map<string, { clipIds: string[] }>} wanted - `wantedRenderings` of the document
 * @param {Map<string, string>} failed - Why a key could not be rendered
 */
export function publishRenderings(wanted, failed) {
  /** @type {Record<string, RenderStatus>} */
  const byClip = {};
  for (const [key, { clipIds }] of wanted) {
    const message = failed.get(key) || '';
    for (const clipId of clipIds) {
      byClip[clipId] = { status: message ? 'failed' : 'rendering', key, message };
    }
  }
  if (JSON.stringify(byClip) !== JSON.stringify(renderState.get().byClip)) {
    renderState.set({ byClip });
  }
}
