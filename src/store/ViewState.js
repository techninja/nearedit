/**
 * Editor view state — transient, in-memory, never part of undo history.
 *
 * Kept apart from TimelineState so that playhead ticks, scrolling and
 * selection changes never copy or persist the whole EDL document.
 * playheadPosition/cursorPosition/zoom/scrollX are merged into the saved EDL
 * on save and split back out on load (see docs/app-spec/EDL.md).
 *
 * @module store/ViewState
 */

import { store } from 'hybrids';

/**
 * @typedef {Object} ViewStateShape
 * @property {number} playheadPosition - Seconds; what the preview shows
 * @property {number} cursorPosition - Seconds; edit cursor, where Stop returns to
 * @property {boolean} playing
 * @property {number} zoom - 1 = 100 px per second
 * @property {number} scrollX - px
 * @property {number} scrollY - px
 * @property {boolean} snapping - Snap to clip edges, playhead, markers, beats
 * @property {boolean} ripple - Edits shift downstream clips
 * @property {boolean} autoCrossfade - Overlapping clips cross-fade
 * @property {boolean} loopEnabled
 * @property {number} loopStart - Seconds
 * @property {number} loopEnd - Seconds
 * @property {string[]} selection - Selected clipIds
 * @property {string} activeTrackId - Target track for paste/insert
 */

/** @type {import('hybrids').Model<ViewStateShape>} */
const ViewState = {
  playheadPosition: 0,
  cursorPosition: 0,
  playing: false,
  zoom: 1,
  scrollX: 0,
  scrollY: 0,
  snapping: true,
  ripple: false,
  autoCrossfade: true,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 0,
  selection: [String],
  activeTrackId: '',
  [store.connect]: {
    get: () => ({ selection: [] }),
    set: (_id, values) => values,
  },
};

export default ViewState;
