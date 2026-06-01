/**
 * Clip interactions — hit testing, selection, drag, trim, split.
 * Operates on the timeline state immutably.
 * @module utils/clipInteractions
 */

import { store } from 'hybrids';
import TimelineState from '#store/TimelineState.js';
import { pushState } from '#utils/undoHistory.js';
import { timeToPx, pxToTime, snapToFrame } from '#utils/timelineMath.js';

const TRACK_HEIGHT = 56;
const TRACK_GAP = 2;
const HEADER_HEIGHT = 24;
const TRACK_LABEL_W = 100;
const EDGE_THRESHOLD = 8; // px from edge to trigger trim

/** @type {{ trackId: string, clipId: string }|null} */
let selectedClip = null;

/** @returns {{ trackId: string, clipId: string }|null} */
export function getSelection() { return selectedClip; }

/** @param {{ trackId: string, clipId: string }|null} sel */
export function setSelection(sel) { selectedClip = sel; }

/**
 * Sort tracks same as the canvas renderer.
 * @param {object[]} tracks
 */
function sortTracks(tracks) {
  return [...tracks].sort((a, b) => {
    if (a.type === 'audio' && b.type !== 'audio') return 1;
    if (a.type !== 'audio' && b.type === 'audio') return -1;
    return 0;
  });
}

/**
 * Hit test — find which clip (and edge) is at a given canvas position.
 * @param {number} x - Canvas x
 * @param {number} y - Canvas y
 * @param {object} state - Timeline state
 * @returns {{ track: object, clip: object, edge: 'left'|'right'|'body'|null, trackIndex: number }|null}
 */
export function hitTest(x, y, state) {
  if (x < TRACK_LABEL_W || y < HEADER_HEIGHT) return null;
  const sorted = sortTracks(state.tracks);
  const ti = Math.floor((y - HEADER_HEIGHT) / (TRACK_HEIGHT + TRACK_GAP));
  const track = sorted[ti];
  if (!track) return null;

  for (const clip of track.clips) {
    if (!clip.sourceFile && !clip.placeholder) continue;
    const cx = TRACK_LABEL_W + timeToPx(clip.timelineStart, state.zoom) - state.scrollX;
    const cw = timeToPx(clip.timelineEnd - clip.timelineStart, state.zoom);
    if (x >= cx && x <= cx + cw) {
      let edge = 'body';
      if (x - cx < EDGE_THRESHOLD) edge = 'left';
      else if (cx + cw - x < EDGE_THRESHOLD) edge = 'right';
      return { track, clip, edge, trackIndex: ti };
    }
  }
  return null;
}

/**
 * Move a clip (and its linked partner) by a time delta.
 * @param {object} state
 * @param {string} trackId
 * @param {string} clipId
 * @param {number} timeDelta
 * @returns {object} new state
 */
export function moveClip(state, trackId, clipId, timeDelta) {
  let linkedId = '';
  const tracks = state.tracks.map((t) => {
    const clips = t.clips.map((c) => {
      if (c.clipId === clipId) {
        linkedId = c.linkedClipId;
        const start = Math.max(0, c.timelineStart + timeDelta);
        const dur = c.timelineEnd - c.timelineStart;
        return { ...c, timelineStart: start, timelineEnd: start + dur };
      }
      return c;
    });
    return { ...t, clips };
  });
  // Move linked clip too
  if (linkedId) {
    return { ...state, tracks: tracks.map((t) => ({
      ...t, clips: t.clips.map((c) => {
        if (c.clipId === linkedId) {
          const start = Math.max(0, c.timelineStart + timeDelta);
          const dur = c.timelineEnd - c.timelineStart;
          return { ...c, timelineStart: start, timelineEnd: start + dur };
        }
        return c;
      }),
    })) };
  }
  return { ...state, tracks };
}

/**
 * Trim a clip edge.
 * @param {object} state
 * @param {string} clipId
 * @param {'left'|'right'} edge
 * @param {number} timeDelta
 * @returns {object} new state
 */
export function trimClip(state, clipId, edge, timeDelta) {
  const tracks = state.tracks.map((t) => ({
    ...t, clips: t.clips.map((c) => {
      if (c.clipId !== clipId) return c;
      if (edge === 'left') {
        const newStart = Math.max(0, c.timelineStart + timeDelta);
        const newSourceIn = c.sourceIn + (newStart - c.timelineStart);
        if (newStart >= c.timelineEnd - 0.1) return c;
        return { ...c, timelineStart: newStart, sourceIn: Math.max(0, newSourceIn) };
      } else {
        const newEnd = Math.max(c.timelineStart + 0.1, c.timelineEnd + timeDelta);
        const newSourceOut = c.sourceOut + (newEnd - c.timelineEnd);
        return { ...c, timelineEnd: newEnd, sourceOut: newSourceOut };
      }
    }),
  }));
  return { ...state, tracks };
}

/**
 * Slip edit — shift sourceIn/sourceOut without moving timeline position.
 * @param {object} state
 * @param {string} clipId
 * @param {number} timeDelta
 * @returns {object} new state
 */
export function slipClip(state, clipId, timeDelta) {
  const tracks = state.tracks.map((t) => ({
    ...t, clips: t.clips.map((c) => {
      if (c.clipId !== clipId) return c;
      const newIn = Math.max(0, c.sourceIn + timeDelta);
      const duration = c.sourceOut - c.sourceIn;
      return { ...c, sourceIn: newIn, sourceOut: newIn + duration };
    }),
  }));
  return { ...state, tracks };
}

/**
 * Split a clip at the playhead position.
 * @param {object} state
 * @returns {object} new state
 */
export function splitAtPlayhead(state) {
  const time = state.playheadPosition;
  const tracks = state.tracks.map((t) => {
    const newClips = [];
    for (const c of t.clips) {
      if (time > c.timelineStart && time < c.timelineEnd) {
        const offset = time - c.timelineStart;
        const left = { ...c, clipId: c.clipId + '_L', timelineEnd: time, sourceOut: c.sourceIn + offset, fadeOut: 0 };
        const right = { ...c, clipId: c.clipId + '_R', timelineStart: time, sourceIn: c.sourceIn + offset, fadeIn: 0 };
        newClips.push(left, right);
      } else {
        newClips.push(c);
      }
    }
    return { ...t, clips: newClips };
  });
  return { ...state, tracks };
}

/**
 * Delete selected clip (and its linked partner).
 * @param {object} state
 * @returns {object} new state
 */
export function deleteSelected(state) {
  if (!selectedClip) return state;
  const { clipId } = selectedClip;
  let linkedId = '';
  // Find linked
  for (const t of state.tracks) {
    const c = t.clips.find((cl) => cl.clipId === clipId);
    if (c) { linkedId = c.linkedClipId; break; }
  }
  const tracks = state.tracks.map((t) => ({
    ...t, clips: t.clips.filter((c) => c.clipId !== clipId && c.clipId !== linkedId),
  }));
  selectedClip = null;
  return { ...state, tracks };
}
