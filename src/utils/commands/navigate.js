/**
 * Transport and navigation commands: the keyboard table of the spec (play
 * / pause, J K L, frame steps, start / end) and jumps between edit points
 * and markers.
 * @module utils/commands/navigate
 */

import { getDoc } from '#utils/editor/session.js';
import { PX_PER_SECOND, getView } from '#utils/editor/view.js';
import * as transport from '#utils/playback/transport.js';
import { currentViewport } from '#utils/timeline/scroll.js';
import { pickSteps } from '#utils/timeline/ticks.js';
import { visibleTimes } from '#utils/timeline/viewport.js';
import { editTime, pixelSeconds } from './context.js';
import { editPoints, markerTimes, neighbourPoint } from './editPoints.js';
import { stopShuttle } from './shuttleRun.js';
import { parseTimeEntry } from './timeSpans.js';

/** Seconds J and L jump. */
const JOG_SECONDS = 2;

/** Space: play, or stop (a shuttle too) and return to the edit cursor. */
export const playPause = () =>
  stopShuttle() ? transport.stop() : transport.toggle({ returnToCursor: true });

/** Enter: play, or pause in place (the cursor moves to the playhead). */
export const playPauseInPlace = () =>
  stopShuttle()
    ? transport.seek(transport.getPosition())
    : transport.toggle({ returnToCursor: false });

/** K: stop and return to the edit cursor. */
export function stop() {
  stopShuttle();
  transport.stop();
}

/** Shift+Space: play from the top of the timeline. */
export function playFromStart() {
  stopShuttle();
  transport.seek(0);
  return transport.play();
}

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

/**
 * Home / End the Vegas way: to that end of the time selection, or of what
 * is on screen when nothing is selected.
 * @param {'start'|'end'} edge
 */
export function goToSelectionEdge(edge) {
  const { loopStart, loopEnd } = getView();
  const span =
    loopEnd > loopStart ? { start: loopStart, end: loopEnd } : visibleTimes(currentViewport());
  transport.seek(span[edge]);
}

/**
 * Move the cursor by one screen pixel (at least a frame); pauses playback.
 * @param {1|-1} direction
 */
export function stepPixel(direction) {
  transport.pause();
  transport.seek(transport.getPosition() + direction * pixelSeconds());
}

/**
 * Move the cursor to the next or previous labelled mark of the ruler.
 * @param {1|-1} direction
 */
export function stepGrid(direction) {
  const fps = getDoc().fps || 30;
  const grid = pickSteps(PX_PER_SECOND * getView().zoom, fps).major / fps;
  const at = transport.getPosition() / grid;
  transport.pause();
  transport.seek((direction > 0 ? Math.floor(at + 1e-6) + 1 : Math.ceil(at - 1e-6) - 1) * grid);
}

/**
 * @param {number} number - 1 = the first marker in time order
 * @returns {number|undefined} Its time
 */
export const markerTime = (number) => (getDoc().markers || [])[number - 1]?.time;

/**
 * Jump to a marker by its number.
 * @param {number} number
 * @returns {boolean} false when there is no such marker
 */
export function goToMarker(number) {
  const time = markerTime(number);
  if (time === undefined) return false;
  transport.seek(time);
  return true;
}

/**
 * Ctrl+G: go to a time as it was typed (see `parseTimeEntry`).
 * @param {string} text
 * @returns {boolean} false when the text is not a time
 */
export function goToTypedTime(text) {
  const time = parseTimeEntry(text, getDoc().fps || 30, transport.getPosition());
  if (!Number.isFinite(time)) return false;
  transport.seek(time);
  return true;
}
