/**
 * The time selection — in Vegas, and here, the same thing as the loop
 * region (`loopStart` … `loopEnd` in the view state). Marking it in and
 * out, extending it with the cursor, recalling earlier ones, and using it:
 * every change goes through `setTimeSelection` so it can be recalled.
 * @module utils/commands/timeSelection
 */

import { findClip, timelineDuration } from '#utils/edl/index.js';
import { getDoc } from '#utils/editor/session.js';
import { getSelection, getView } from '#utils/editor/view.js';
import { getPosition, pause, seek, setLoopRange } from '#utils/playback/transport.js';
import { editTime, pixelSeconds } from './context.js';
import { editPoints, markerTimes, neighbourPoint } from './editPoints.js';
import { extendSpan, hasLength, recalled, remembered, spanAround } from './timeSpans.js';
import { openMusicEditor } from '#utils/musicUi/editorState.js';
import { openWebEditor } from '#utils/webUi/editorState.js';

/** @typedef {import('./timeSpans.js').Span} Span */

/** @type {Span[]} Earlier selections, oldest first */
let history = [];

/** @returns {Span|null} The time selection, or null when there is none */
export function getTimeSelection() {
  const { loopStart, loopEnd } = getView();
  return loopEnd > loopStart ? { start: loopStart, end: loopEnd } : null;
}

/** @returns {boolean} */
export const hasTimeSelection = () => getTimeSelection() !== null;

/**
 * Replace the time selection (times in either order; equal times clear it).
 * @param {number} start
 * @param {number} end
 * @param {{ remember?: boolean }} [opts] - false while a drag or a held key
 *   keeps changing one selection: only its first step is remembered
 */
export function setTimeSelection(start, end, opts = {}) {
  if (opts.remember !== false) history = remembered(history, getTimeSelection());
  setLoopRange(start, end);
}

/** Clear the time selection (it can be recalled). */
export const clearTimeSelection = () => setTimeSelection(0, 0);

/** I: the selection starts at the cursor (and keeps its end when that is later). */
export function markIn() {
  const at = editTime();
  setTimeSelection(at, Math.max(at, getView().loopEnd));
  return true;
}

/** O: the selection ends at the cursor (and keeps its start when that is earlier). */
export function markOut() {
  const at = editTime();
  setTimeSelection(Math.min(at, getView().loopStart), at);
  return true;
}

/**
 * Move the cursor to a time, the selection stretching from its anchor.
 * @param {number|null} target
 * @returns {boolean} false when there is nowhere to go
 */
function extendTo(target) {
  if (target === null) return false;
  pause();
  const to = Math.max(0, target);
  const span = extendSpan(getTimeSelection(), getPosition(), to, 0.5 / (getDoc().fps || 30));
  setTimeSelection(span.start, span.end, { remember: span.fresh });
  seek(to);
  return true;
}

/**
 * Shift+arrow: extend the selection by one pixel.
 * @param {1|-1} direction
 * @returns {boolean}
 */
export const extendByPixel = (direction) => extendTo(getPosition() + direction * pixelSeconds());

/**
 * Extend the selection to the next or previous clip edge.
 * @param {1|-1} direction
 * @returns {boolean}
 */
export function extendToEdit(direction) {
  return extendTo(neighbourPoint(editPoints(getDoc()), getPosition(), direction));
}

/**
 * Backspace: bring back the previous time selection (up to five).
 * @returns {boolean} false when none is remembered
 */
export function recallSelection() {
  const back = recalled(history, getTimeSelection());
  if (!back.span) return false;
  history = back.history;
  setLoopRange(back.span.start, back.span.end);
  return true;
}

/** @returns {boolean} True when Backspace has a selection to bring back */
export const canRecallSelection = () => history.length > 0;

/**
 * Double-click a clip: select its span — except a web clip or a music
 * clip, which opens in its editor (what Vegas does for generated media).
 * @param {string} clipId
 */
export function selectClipSpan(clipId) {
  const clip = findClip(getDoc(), clipId)?.clip;
  if (!clip || openWebEditor(clipId) || openMusicEditor(clipId)) return;
  setTimeSelection(clip.timelineStart, clip.timelineEnd);
}

/**
 * Double-click the ruler: select the stretch between the markers (and
 * region ends) on either side of that time.
 * @param {number} time
 */
export function selectBetweenMarkers(time) {
  const span = spanAround(markerTimes(getDoc()), time, timelineDuration(getDoc().tracks));
  if (hasLength(span)) setTimeSelection(span.start, span.end);
}

/** @returns {Span|null} The time the selected clips cover together */
export function selectedClipsSpan() {
  const clips = getSelection().map((id) => findClip(getDoc(), id)?.clip);
  const found = clips.filter(Boolean);
  if (!found.length) return null;
  return {
    start: Math.min(...found.map((clip) => clip.timelineStart)),
    end: Math.max(...found.map((clip) => clip.timelineEnd)),
  };
}
