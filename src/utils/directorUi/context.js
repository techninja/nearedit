/**
 * What the director is told about the editor: where the cursor is, which
 * range "range" mode means, what is selected. Pure — the panel passes in
 * the view state and the document.
 * Shape: `directive.context` in docs/app-spec/API.md § Director.
 * @module utils/directorUi/context
 */

/**
 * @typedef {Object} EditorView
 * @property {number} playheadPosition
 * @property {number} cursorPosition
 * @property {number} loopStart
 * @property {number} loopEnd
 * @property {string[]} selection
 * @typedef {{ start: number, end: number, source: 'loop'|'selection' }} DirectorRange
 */

const MIN_RANGE = 0.04;

/**
 * The range that "range" mode works on: the loop region when one is set,
 * otherwise the span from the first to the last selected clip.
 * @param {Partial<EditorView>} view
 * @param {any} doc - The timeline document
 * @returns {DirectorRange|null} null when neither exists
 */
export function directorRange(view, doc) {
  const loopStart = Math.max(0, Number(view.loopStart) || 0);
  const loopEnd = Number(view.loopEnd) || 0;
  if (loopEnd - loopStart >= MIN_RANGE) return { start: loopStart, end: loopEnd, source: 'loop' };
  const selected = new Set(view.selection || []);
  if (!selected.size) return null;
  let start = Infinity;
  let end = -Infinity;
  for (const track of doc?.tracks || []) {
    for (const clip of track.clips || []) {
      if (!selected.has(clip.clipId)) continue;
      start = Math.min(start, clip.timelineStart);
      end = Math.max(end, clip.timelineEnd);
    }
  }
  return end - start >= MIN_RANGE ? { start, end, source: 'selection' } : null;
}

/**
 * Where "insert at the cursor" inserts: the playhead while paused; while
 * playing the playhead is on the move, so the edit cursor is used.
 * @param {Partial<EditorView>} view
 * @param {boolean} playing
 * @returns {number} Seconds
 */
export function insertTime(view, playing) {
  const time = playing ? view.cursorPosition : view.playheadPosition;
  return Math.max(0, Number(time) || 0);
}

/**
 * @param {Partial<EditorView>} view
 * @param {any} doc
 * @param {boolean} playing
 * @returns {{ playheadPosition: number, selection: string[], range?: { start: number, end: number } }}
 */
export function directorContext(view, doc, playing) {
  const range = directorRange(view, doc);
  return {
    playheadPosition: insertTime(view, playing),
    selection: [...(view.selection || [])],
    ...(range && { range: { start: range.start, end: range.end } }),
  };
}

/**
 * @param {any} doc
 * @returns {boolean} True when no track holds a clip
 */
export function isEmptyTimeline(doc) {
  return !(doc?.tracks || []).some((track) => (track.clips || []).length > 0);
}

/**
 * How many clips lie (even partly) inside a range on unlocked tracks.
 * @param {any} doc
 * @param {{ start: number, end: number }} range
 * @returns {number}
 */
export function clipsInside(doc, range) {
  let count = 0;
  for (const track of doc?.tracks || []) {
    if (track.locked) continue;
    for (const clip of track.clips || []) {
      if (clip.timelineStart < range.end && clip.timelineEnd > range.start) count++;
    }
  }
  return count;
}
