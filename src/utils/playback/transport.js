/**
 * Transport — the single owner of the playback clock. The keyboard handler,
 * the timeline and the transport buttons all call these functions; nothing
 * else starts, stops or moves playback.
 *
 * Positions live in ViewState: `playheadPosition` is what the preview
 * shows, `cursorPosition` is the edit cursor. While stopped they move
 * together; while playing only the playhead runs. Stopping either returns
 * the playhead to the cursor (`stop`, Space) or brings the cursor to the
 * playhead (`pause`, Enter). The document is read from the edit session and
 * never written.
 * @module utils/playback/transport
 */

import { store } from 'hybrids';
import ViewState from '#store/ViewState.js';
import { snapToFrame, timelineDuration } from '#utils/edl/query.js';
import { getDoc } from '#utils/editor/session.js';
import { loopRange, playStart } from '#utils/playback/looping.js';
import { frameAt } from '#utils/playback/timecode.js';
import * as engine from '#utils/playback/transportEngine.js';
import { commit, viewNow } from '#utils/playback/transportView.js';

export { onFrame } from '#utils/playback/transportEngine.js';
export { setLoop, setLoopRange } from '#utils/playback/transportLoop.js';

/** @returns {number} Frame rate of the document */
const fps = () => getDoc().fps || 30;

/** @returns {number} Timeline duration, seconds */
export const getDuration = () => timelineDuration(getDoc().tracks);

/** @returns {boolean} */
export const isPlaying = () => engine.isRunning();

/** @returns {number} Current playhead position, seconds */
export function getPosition() {
  return engine.isRunning() ? engine.playPosition() : viewNow().playheadPosition;
}

/**
 * Start playback at the playhead. If it sits at the end, start over from
 * the edit cursor (or the top). The cursor is left at the starting point.
 * Call from a user gesture, so the browser lets audio start.
 * @returns {boolean} False when there is nothing to play
 */
export function play() {
  if (engine.isRunning()) return true;
  const duration = getDuration();
  const loop = loopRange(store.get(ViewState), duration);
  if (duration <= 0 && !loop) return false;
  const { playheadPosition, cursorPosition } = viewNow();
  const from = playStart(playheadPosition, duration, loop, cursorPosition);
  commit({ playing: true, playheadPosition: from, cursorPosition: from });
  engine.run(from);
  return true;
}

/**
 * Stop where playback is; the edit cursor follows the playhead (Enter).
 * The playhead lands on the frame that was showing.
 */
export function pause() {
  if (!engine.isRunning()) return;
  engine.halt();
  const at = frameAt(engine.playPosition(), fps()) / fps();
  commit({ playing: false, playheadPosition: at, cursorPosition: at });
  engine.parkAudio(at);
}

/** Stop and return the playhead to the edit cursor (Space, K, Stop button). */
export function stop() {
  if (engine.isRunning()) engine.halt();
  const at = viewNow().cursorPosition;
  commit({ playing: false, playheadPosition: at });
  engine.parkAudio(at);
}

/**
 * Play/stop toggle.
 * @param {{ returnToCursor?: boolean }} [options] - On stop: true (Space)
 *   returns the playhead to the edit cursor, false (Enter) leaves it where
 *   it stopped and moves the cursor there
 * @returns {boolean} True when now playing
 */
export function toggle({ returnToCursor = true } = {}) {
  if (!engine.isRunning()) return play();
  if (returnToCursor) stop();
  else pause();
  return false;
}

/**
 * Move the playhead to a time, snapped to a frame. While stopped this is a
 * scrub (the preview shows the frame; rapid calls are fine, the latest
 * wins). While playing, playback carries on from the new position.
 * @param {number} time - Timeline seconds
 * @param {{ moveCursor?: boolean }} [options] - false keeps the edit cursor in place
 */
export function seek(time, { moveCursor = true } = {}) {
  const at = Math.max(0, snapToFrame(Number(time) || 0, fps()));
  if (engine.isRunning()) engine.jump(at);
  else engine.parkAudio(at);
  commit(moveCursor ? { playheadPosition: at, cursorPosition: at } : { playheadPosition: at });
}

/**
 * Step by whole frames (negative = back). Stepping pauses playback.
 * @param {number} frames
 */
export function stepFrames(frames) {
  pause();
  seek((Math.round(getPosition() * fps()) + frames) / fps());
}

/**
 * Jump by a number of seconds (negative = back); works during playback.
 * @param {number} seconds
 */
export function jog(seconds) {
  seek(getPosition() + seconds);
}

/** Move to the start of the timeline. */
export function goToStart() {
  seek(0);
}

/** Move to the end of the last clip. */
export function goToEnd() {
  seek(getDuration());
}

/** Stop playback and release every audio element and node (leaving the editor). */
export function shutdown() {
  pause();
  engine.releaseAudio();
}
