/**
 * The transcript panel's non-destructive actions: add the selected words
 * to the timeline as a new clip, drop a marker on them, and move the
 * playhead to a word. Edits are one undo step each.
 * @module utils/transcript/placeActions
 */

import { newClipIds } from '#utils/edl/selection.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { getView, setSelection } from '#utils/editor/view.js';
import { getMediaItem } from '#utils/media/library.js';
import { seek } from '#utils/playback/transport.js';
import { insertSourceRange, keepSpan, markSource } from './edits.js';
import { rangeText } from './units.js';
import { sourceChain, sourceToTimeline } from './usage.js';

/** @typedef {import('./actions.js').EditContext} EditContext */

/**
 * Insert units `first..last` as a new clip at the edit cursor.
 * @param {EditContext} ctx
 * @param {number} first
 * @param {number} last
 * @returns {boolean}
 */
export function addUnits(ctx, first, last) {
  const view = getView();
  const known = getMediaItem(ctx.file);
  const { hasVideo, hasAudio, duration } = ctx.sidecar || {};
  const guess = {
    type: hasVideo === false ? 'audio' : 'video',
    hasAudio: hasAudio !== false,
    duration,
  };
  const item = known || { ...guess, filePath: ctx.file, filename: ctx.file.split(/[\\/]/).pop() };
  const opts = {
    time: view.cursorPosition || 0,
    trackId: view.activeTrackId || undefined,
    ripple: view.ripple,
    autoCrossfade: view.autoCrossfade,
  };
  const before = getDoc();
  const span = keepSpan(ctx.units, ctx.edges, first, last);
  if (!edit((doc) => insertSourceRange(doc, item, span, opts))) return false;
  const after = getDoc();
  const created = newClipIds(before, after).filter((id) =>
    after.tracks.some((t) => t.clips.some((c) => c.clipId === id && c.sourceFile === ctx.file)),
  );
  setSelection(created, { expand: false });
  return true;
}

/**
 * Put a marker at unit `first`, labelled with the selected text.
 * @param {EditContext} ctx
 * @param {number} first
 * @param {number} last
 * @returns {boolean}
 */
export function markUnits(ctx, first, last) {
  const label = rangeText(ctx.units, first, last);
  const at = ctx.units[first].start;
  return edit((doc) =>
    markSource(
      doc,
      sourceChain(doc, ctx.file, { trackId: ctx.chain.trackId }),
      at,
      label,
      ctx.focusClipId,
    ),
  );
}

/**
 * Move the playhead to a unit, when it is in the edit.
 * @param {EditContext} ctx
 * @param {number} index
 * @returns {boolean} false when the unit is not on the timeline
 */
export function seekToUnit(ctx, index) {
  const at = sourceToTimeline(ctx.chain.segments, ctx.units[index].start, ctx.focusClipId);
  if (at) seek(at.time);
  return !!at;
}
