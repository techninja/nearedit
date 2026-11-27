/**
 * Transport engine — the clock, the mixer and the per-frame loop behind
 * transport.js. Internal: UI code calls transport.js, never this module.
 *
 * Each animation frame while playing: read the master clock, apply loop
 * and end-of-timeline rules, bring the mixer in line with the session's
 * *current* document (so edits made during playback, live drag previews
 * included, take effect on the next frame), write the playhead to ViewState
 * and hand the frame to the compositor.
 * @module utils/playback/transportEngine
 */

import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { timelineDuration } from '#utils/edl/query.js';
import { getDoc } from '#utils/editor/session.js';
import { audioClockTime, resumeAudio, suspendAudio } from '#utils/playback/audioGraph.js';
import { createMixer } from '#utils/playback/audioMixer.js';
import { createClock } from '#utils/playback/clock.js';
import { advance, loopRange } from '#utils/playback/looping.js';
import { commit } from '#utils/playback/transportView.js';

/** A background tab gets no animation frames; keep audio moving anyway. */
const WATCHDOG_MS = 250;

/** Quiet time after the last seek before audio voices are parked. */
const PARK_DELAY_MS = 120;

/** @typedef {(position: number) => void} FrameListener */

export const mixer = createMixer();
export const clock = createClock({
  audioNow: audioClockTime,
  wallNow: () => performance.now() / 1000,
});

/** @type {Set<FrameListener>} */
const listeners = new Set();
let playing = false;
let position = 0;
let rafId = 0;
let timerId = 0;
let lastTick = 0;
let parkTimer = 0;

/** @returns {boolean} */
export const isRunning = () => playing;

/** @returns {number} Position of the frame last produced while playing */
export const playPosition = () => position;

/** Stop the loop and silence the mixer. */
export function halt() {
  playing = false;
  cancelAnimationFrame(rafId);
  clearInterval(timerId);
  position = clock.stop();
  mixer.pause();
}

/**
 * Stopped at a new position: once things settle, park the audio voices
 * there so the next Play starts on the beat (debounced, scrubbing is fast).
 * @param {number} at - Timeline seconds
 */
export function parkAudio(at) {
  clearTimeout(parkTimer);
  parkTimer = window.setTimeout(() => {
    if (!playing) mixer.park(getDoc().tracks, at);
  }, PARK_DELAY_MS);
}

/** One step of playback. */
function tick() {
  if (!playing) return;
  lastTick = performance.now();
  const { tracks } = getDoc();
  const duration = timelineDuration(tracks);
  const step = advance(position, clock.now(), duration, loopRange(store.get(ViewState), duration));
  position = step.position;
  if (step.ended) {
    halt();
    commit({ playing: false, playheadPosition: duration });
    return;
  }
  // Book the next frame first: a failure below must not strand playback.
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);
  if (step.wrapped) jump(position);
  mixer.update(tracks, position);
  commit({ playheadPosition: position });
  for (const listener of listeners) listener(position);
}

/**
 * Start the loop from a timeline position. Call from a user gesture so the
 * audio clock is allowed to start; until it does the wall clock stands in.
 * @param {number} from
 */
export function run(from) {
  position = from;
  playing = true;
  resumeAudio();
  jump(from);
  timerId = window.setInterval(() => {
    if (performance.now() - lastTick > WATCHDOG_MS) tick();
  }, WATCHDOG_MS);
  // First frame now, not a frame later: sound and picture start with the clock.
  tick();
}

/**
 * Move a running clock to a new position (seek, loop wrap).
 * @param {number} to
 */
export function jump(to) {
  position = to;
  clock.start(to);
  mixer.resync();
}

/**
 * Subscribe to frames produced while playing.
 * @param {FrameListener} listener
 * @returns {() => void} Unsubscribe
 */
export function onFrame(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Free every audio element and node, and let the audio device go. */
export function releaseAudio() {
  clearTimeout(parkTimer);
  mixer.release();
  suspendAudio();
}
