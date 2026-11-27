/**
 * Timeline change signal — tells components that the open document changed.
 *
 * The document itself (tracks, clips, markers and whatever they carry:
 * effect stacks, generator parameters, keyframe maps) is held by the edit
 * session and read with `getDoc()` from `#utils/editor/session.js`. It is
 * deliberately not stored here: a hybrids model silently drops every
 * property it does not declare, and rebuilding a model of every clip on
 * every edit costs milliseconds.
 *
 * What is stored is a summary small enough to write on every change.
 * `#utils/editor/mirror.js` is its only writer, and `revision` goes up by
 * one with each write. A component that draws from the document depends on
 * this model so that it re-renders when the summary is replaced — directly
 * (`timeline: store(TimelineState)`) when the summary is all it shows, or
 * through `doc: liveDoc()` (`#utils/editor/liveDoc.js`) when it needs the
 * document.
 *
 * @module store/TimelineState
 */

import { store } from 'hybrids';
import { createEdl } from '#utils/edl/factory.js';
import { summarize } from '#utils/editor/summary.js';

/**
 * @typedef {Object} TimelineStateShape
 * @property {number} revision - Document changes written so far; never goes down
 * @property {number} fps - Frame rate of the document
 * @property {string} resolution - Output size, "WxH"
 * @property {number} duration - End of the last clip, seconds
 * @property {number} trackCount
 * @property {number} clipCount - Clips on all tracks together
 */

/** @type {import('hybrids').Model<TimelineStateShape>} */
const TimelineState = {
  revision: 0,
  fps: 30,
  resolution: '1920x1080',
  duration: 0,
  trackCount: 0,
  clipCount: 0,
  [store.connect]: {
    // Before the first change the summary must describe the empty document
    // the session starts with (its default tracks), not the blanks above.
    get: () => summarize(createEdl()),
    set: (_id, values) => values,
  },
};

export default TimelineState;
