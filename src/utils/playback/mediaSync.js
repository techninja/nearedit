/**
 * Media element control — cue, start and keep an `<audio>`/`<video>`
 * element on the master clock. Shared by the audio mixer and the picture
 * compositor so sound and picture are corrected by the same rules.
 * @module utils/playback/mediaSync
 */

import { correctDrift } from '#utils/playback/drift.js';

/** Ignore position errors smaller than this when parking an element. */
const CUE_EPSILON = 0.002;

/** Minimum gap between corrective seeks, so a slow seek cannot loop. */
const SEEK_COOLDOWN_MS = 400;

/** A change of expected position this far off real time is a clock jump. */
const JUMP_SECONDS = 0.25;

/**
 * Per-element bookkeeping.
 * @typedef {Object} SyncState
 * @property {number} seekAt - performance.now() of the last corrective seek
 * @property {number} expected - Source time asked for on the last call
 * @property {number} expectedAt - performance.now() of the last call
 */

/**
 * Fresh bookkeeping for an element that has just been (re)assigned.
 * @returns {SyncState}
 */
export function freshSync() {
  return { seekAt: -Infinity, expected: NaN, expectedAt: 0 };
}

/**
 * Start an element, reporting real failures (an interrupted play() is not one).
 * @param {HTMLMediaElement} el
 */
export function startElement(el) {
  el.play()?.catch((err) => {
    if (err.name !== 'AbortError') console.warn('[playback] could not play media:', err.message);
  });
}

/**
 * Park an element, paused, at a source time so it can start instantly.
 * Safe to call every frame: it seeks only when the element is elsewhere.
 * @param {HTMLMediaElement} el
 * @param {number} time - Source seconds
 */
export function cueElement(el, time) {
  if (!el.paused) el.pause();
  if (el.playbackRate !== 1) el.playbackRate = 1;
  if (!el.seeking && Math.abs(el.currentTime - time) > CUE_EPSILON) el.currentTime = time;
}

/**
 * Keep a playing element where the clock says it should be: start it if it
 * is parked, nudge its rate for small errors, re-seek for large ones.
 * @param {HTMLMediaElement} el
 * @param {SyncState} state
 * @param {number} expected - Source seconds the clock points at
 * @param {import('#utils/playback/drift.js').DriftLimits} limits
 * @param {number} nowMs - performance.now()
 */
export function driveElement(el, state, expected, limits, nowMs) {
  // The clock jumped (seek, loop wrap): follow at once, cooldown or not.
  const predicted = state.expected + (nowMs - state.expectedAt) / 1000;
  if (Math.abs(expected - predicted) > JUMP_SECONDS) state.seekAt = -Infinity;
  state.expected = expected;
  state.expectedAt = nowMs;
  if (Number.isFinite(el.duration) && expected >= el.duration) {
    // The clip asks for more than the file holds: nothing left to play.
    if (!el.paused) el.pause();
    return;
  }
  if (el.paused) {
    if (!el.seeking && Math.abs(el.currentTime - expected) > limits.soft) el.currentTime = expected;
    el.playbackRate = 1;
    state.seekAt = nowMs;
    startElement(el);
    return;
  }
  if (el.seeking || el.readyState < 3) return; // settling or buffering
  const fix = correctDrift(el.currentTime - expected, limits, el.playbackRate !== 1);
  if (fix.seek) {
    if (nowMs - state.seekAt < SEEK_COOLDOWN_MS) return;
    el.currentTime = expected;
    state.seekAt = nowMs;
    el.playbackRate = 1;
  } else if (el.playbackRate !== fix.rate) {
    el.playbackRate = fix.rate;
  }
}

/**
 * Stop an element and drop its media so the browser frees the decoder.
 * @param {HTMLMediaElement} el
 */
export function unloadElement(el) {
  el.pause();
  el.removeAttribute('src');
  el.load();
}
