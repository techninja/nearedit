/**
 * Mirroring the session's document into `TimelineState` for rendering.
 *
 * `store.set` rebuilds the store model for every clip, which is cheap once
 * but not at pointer-move rate on a large timeline. Live previews during a
 * drag are therefore coalesced to one mirror per animation frame; anything
 * that is not a preview is mirrored at once.
 * @module utils/editor/mirror
 */

import { store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';

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
 * Write a document to the store now, dropping any queued preview.
 * @param {any} doc
 */
export function mirrorNow(doc) {
  if (handle) unschedule(handle);
  handle = 0;
  pending = null;
  const { version, fps, resolution, tracks, markers } = doc;
  store
    .set(TimelineState, { version, fps, resolution, tracks, markers })
    .catch((err) => console.error('[session] could not update the timeline store:', err));
}

/**
 * Write a document to the store on the next animation frame. Calls made
 * before that frame replace one another, so only the latest is written.
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
