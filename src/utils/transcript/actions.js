/**
 * The transcript panel's edits, performed: each is one undo step through
 * the edit session, after which the selection and the playhead are put
 * where the user will want them.
 * @module utils/transcript/actions
 */

import { edit, getDoc } from '#utils/editor/session.js';
import { getSelection, getView, setSelection } from '#utils/editor/view.js';
import { sourceDurations } from '#utils/media/library.js';
import { seek } from '#utils/playback/transport.js';
import { cutSource, cutSpan, keepSource, keepSpan } from './edits.js';
import { planSilenceRemoval, removeSilences } from './silences.js';
import { sourceChain } from './usage.js';

/**
 * @typedef {Object} EditContext
 * @property {string} file - Source file the transcript belongs to
 * @property {import('./units.js').Unit[]} units
 * @property {number[]} edges
 * @property {import('./usage.js').Chain} chain - As currently shown
 * @property {string} focusClipId
 * @property {Record<string, any>} [sidecar]
 */

/**
 * After an edit that may have replaced the selected clip: keep the
 * selection if it survived, otherwise select the chain's piece at `time`.
 * @param {EditContext} ctx
 * @param {number} time - Timeline seconds
 */
function reselect(ctx, time) {
  if (getSelection().length) return;
  const { segments } = sourceChain(getDoc(), ctx.file, { trackId: ctx.chain.trackId });
  const piece =
    segments.find((s) => time >= s.timelineStart - 1e-6 && time < s.timelineEnd) || segments[0];
  if (piece) setSelection([piece.clipId]);
}

/**
 * Where a source range first plays on the timeline.
 * @param {EditContext} ctx
 * @param {number} from - Source seconds
 * @param {number} to
 * @returns {number|null}
 */
function firstTimelineTime(ctx, from, to) {
  for (const seg of ctx.chain.segments) {
    const start = Math.max(from, seg.sourceIn);
    if (Math.min(to, seg.sourceOut) - start > 1e-6)
      return seg.timelineStart + (start - seg.sourceIn);
  }
  return null;
}

/**
 * Cut units `first..last` out of the timeline, rippling.
 * @param {EditContext} ctx
 * @param {number} first
 * @param {number} last
 * @returns {boolean} true when the document changed
 */
export function cutUnits(ctx, first, last) {
  const span = cutSpan(ctx.units, ctx.edges, first, last);
  const at = firstTimelineTime(ctx, span.start, span.end);
  const opts = { autoCrossfade: getView().autoCrossfade };
  const prefer = { trackId: ctx.chain.trackId };
  if (!edit((doc) => cutSource(doc, sourceChain(doc, ctx.file, prefer), span, opts))) return false;
  if (at !== null) {
    reselect(ctx, at);
    seek(at);
  }
  return true;
}

/**
 * Trim the chain to units `first..last`.
 * @param {EditContext} ctx
 * @param {number} first
 * @param {number} last
 * @returns {boolean}
 */
export function keepUnits(ctx, first, last) {
  const span = keepSpan(ctx.units, ctx.edges, first, last);
  const opts = { autoCrossfade: getView().autoCrossfade, sourceDurations: sourceDurations() };
  const prefer = { trackId: ctx.chain.trackId };
  if (!edit((doc) => keepSource(doc, sourceChain(doc, ctx.file, prefer), span, opts))) return false;
  const [piece] = sourceChain(getDoc(), ctx.file, prefer).segments;
  if (piece) {
    reselect(ctx, piece.timelineStart);
    seek(piece.timelineStart);
  }
  return true;
}

/**
 * Remove the pauses of the chain.
 * @param {EditContext} ctx
 * @param {{ threshold: number, padding: number }} settings
 * @param {{ words?: any[], silences?: any[] }} source
 * @returns {boolean}
 */
export function tighten(ctx, settings, source) {
  const opts = { autoCrossfade: getView().autoCrossfade };
  const prefer = { trackId: ctx.chain.trackId };
  return edit((doc) => {
    const chain = sourceChain(doc, ctx.file, prefer);
    return removeSilences(
      doc,
      planSilenceRemoval(chain, source, { ...settings, fps: doc.fps }),
      opts,
    );
  });
}
