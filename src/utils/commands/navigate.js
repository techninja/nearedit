/**
 * Transport and navigation commands: the keyboard table of the spec (play
 * / pause, J K L, frame steps, start / end) and jumps between edit points
 * and markers.
 * @module utils/commands/navigate
 */

import { getDoc } from '#utils/editor/session.js';
import * as transport from '#utils/playback/transport.js';
import { editTime } from './context.js';
import { editPoints, markerTimes, neighbourPoint } from './editPoints.js';

/** Seconds J and L jump. */
const JOG_SECONDS = 2;

/** Space: play, or stop and return to the edit cursor. */
export const playPause = () => transport.toggle({ returnToCursor: true });

/** Enter: play, or pause in place (the cursor moves to the playhead). */
export const playPauseInPlace = () => transport.toggle({ returnToCursor: false });

/** K: stop and return to the edit cursor. */
export const stop = () => transport.stop();

/** J: jump back two seconds. */
export const rewind = () => transport.jog(-JOG_SECONDS);

/** L: jump forward two seconds. */
export const forward = () => transport.jog(JOG_SECONDS);

export const goToStart = () => transport.goToStart();
export const goToEnd = () => transport.goToEnd();

/**
 * Step by frames (negative = back); pauses playback.
 * @param {number} frames
 */
export const stepFrames = (frames) => transport.stepFrames(frames);

/** Turn loop playback on or off. */
export const toggleLoop = () => transport.setLoop();

/**
 * Seek to the neighbour of the current time in a list of points.
 * @param {number[]} points - Ascending
 * @param {1|-1} direction
 * @returns {boolean} false when there is no such point
 */
function jump(points, direction) {
  const to = neighbourPoint(points, editTime(), direction);
  if (to === null) return false;
  transport.seek(to);
  return true;
}

/** @returns {boolean} */
export const goToPreviousEdit = () => jump(editPoints(getDoc()), -1);

/** @returns {boolean} */
export const goToNextEdit = () => jump(editPoints(getDoc()), 1);

/** @returns {boolean} */
export const goToPreviousMarker = () => jump(markerTimes(getDoc()), -1);

/** @returns {boolean} */
export const goToNextMarker = () => jump(markerTimes(getDoc()), 1);
