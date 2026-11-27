/**
 * Video slot — one pooled `<video>` element and the bookkeeping that lets
 * the compositor trust the frame it holds. Elements are never attached to
 * the document; they are only drawn onto the canvas.
 * @module utils/playback/videoSlot
 */

import { VIDEO_DRIFT } from '#utils/playback/drift.js';
import { driveElement, freshSync } from '#utils/playback/mediaSync.js';

/** A paused element this close to its target is showing the right frame. */
const SEEK_EPSILON = 0.0005;

/**
 * @typedef {Object} VideoSlot
 * @property {HTMLVideoElement} el
 * @property {string} clipId - Clip being shown, '' when idle
 * @property {string} url - Media loaded in the element
 * @property {number} target - Source time wanted while paused
 * @property {boolean} stale - The decoded frame belongs to an earlier clip
 * @property {boolean} failed - The media could not be loaded
 * @property {import('#utils/playback/mediaSync.js').SyncState} sync - Drift bookkeeping
 */

/**
 * A seek or load finished. While paused, chase the newest target first:
 * under fast scrubbing only the latest request is ever seeked to.
 * @param {VideoSlot} slot
 * @param {() => void} onFrame
 */
function settle(slot, onFrame) {
  const { el } = slot;
  if (!slot.clipId || el.seeking || el.readyState < 2) return;
  slot.stale = false;
  if (el.paused && Math.abs(el.currentTime - slot.target) > SEEK_EPSILON) {
    el.currentTime = slot.target;
  }
  onFrame();
}

/**
 * Create a slot.
 * @param {() => void} onFrame - Called when the slot has a new frame, or failed
 * @returns {VideoSlot}
 */
export function createSlot(onFrame) {
  const el = document.createElement('video');
  el.muted = true;
  el.playsInline = true;
  el.preload = 'auto';
  /** @type {VideoSlot} */
  const slot = {
    el,
    clipId: '',
    url: '',
    target: 0,
    stale: true,
    failed: false,
    sync: freshSync(),
  };
  el.addEventListener('seeked', () => settle(slot, onFrame));
  el.addEventListener('loadeddata', () => settle(slot, onFrame));
  el.addEventListener('error', () => {
    if (!el.getAttribute('src')) return; // unloading, not a failure
    console.warn('[playback] could not load video:', slot.url);
    slot.failed = true;
    onFrame();
  });
  return slot;
}

/**
 * Point a slot, paused, at a source time. Call as often as needed: while a
 * seek is in flight only the target moves, and settle() re-aims on landing.
 * @param {VideoSlot} slot
 * @param {number} time - Source seconds
 */
export function aimSlot(slot, time) {
  const { el } = slot;
  slot.target = time;
  if (!el.paused) el.pause();
  if (el.playbackRate !== 1) el.playbackRate = 1;
  if (el.seeking) return;
  if (Math.abs(el.currentTime - time) > SEEK_EPSILON) el.currentTime = time;
  else if (el.readyState >= 2) slot.stale = false;
}

/**
 * Keep a slot playing on the master clock.
 * @param {VideoSlot} slot
 * @param {number} expected - Source seconds the clock points at
 * @param {number} nowMs - performance.now()
 */
export function driveSlot(slot, expected, nowMs) {
  driveElement(slot.el, slot.sync, expected, VIDEO_DRIFT, nowMs);
  // Already in place and decoded (no seek was needed): its frame is good.
  if (slot.stale && !slot.el.seeking && slot.el.readyState >= 2) slot.stale = false;
}

/**
 * True when the slot holds a frame of its own clip that may be drawn.
 * @param {VideoSlot} slot
 * @returns {boolean}
 */
export function hasFrame(slot) {
  return !slot.failed && !slot.stale && slot.el.readyState >= 2;
}

/**
 * True when a paused slot shows exactly the frame it was aimed at (or never will).
 * @param {VideoSlot} slot
 * @returns {boolean}
 */
export function isSettled(slot) {
  if (slot.failed) return true;
  if (!hasFrame(slot) || slot.el.seeking) return false;
  return Math.abs(slot.el.currentTime - slot.target) <= SEEK_EPSILON;
}
