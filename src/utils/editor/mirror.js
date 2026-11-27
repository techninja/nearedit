/**
 * Telling the UI that the session's document changed, by writing its
 * summary to `TimelineState`. The document itself never enters the store:
 * whatever the write wakes reads it from the session (`getDoc()`).
 *
 * Every write re-renders the components that follow the document, which is
 * cheap once but not at pointer-move rate. Live previews during a drag are
 * therefore coalesced to one write per animation frame; anything that is
 * not a preview is written at once.
 * @module utils/editor/mirror
 */

import { store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import { summarize } from '#utils/editor/summary.js';

/** Summaries written so far: the store's `revision` */
let revision = 0;
/** @type {any|null} Document waiting for the next frame */
let pending = null;
let handle = 0;

const hasFrames = typeof globalThis.requestAnimationFrame === 'function';
/** @param {() => void} callback @returns {number} */
const schedule = (callback) =>
  hasFrames ? globalThis.requestAnimationFrame(callback) : Number(setTimeout(callback, 16));
/** @param {number} id */
const unschedule = (id) => (hasFrames ? globalThis.cancelAnimationFrame(id) : clearTimeout(id));

/**
 * Write a document's summary to the store now, as the next revision,
 * dropping any queued preview.
 * @param {any} doc
 */
export function mirrorNow(doc) {
  if (handle) unschedule(handle);
  handle = 0;
  pending = null;
  revision += 1;
  store
    .set(TimelineState, summarize(doc, revision))
    .catch((err) => console.error('[session] could not update the timeline store:', err));
}

/**
 * Write a document's summary on the next animation frame. Calls made before
 * that frame replace one another, so only the latest is written and the
 * revision moves on once.
 * @param {any} doc
 */
export function mirrorSoon(doc) {
  pending = doc;
  if (handle) return;
  handle = schedule(() => {
    handle = 0;
    const latest = pending;
    pending = null;
    if (latest) mirrorNow(latest);
  });
}

/**
 * Write a queued preview immediately, if there is one.
 * @returns {boolean} true when something was written
 */
export function flushMirror() {
  if (!pending) return false;
  mirrorNow(pending);
  return true;
}
