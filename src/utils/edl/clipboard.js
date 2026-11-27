/**
 * Copy, paste and duplicate. The clipboard payload is plain JSON, so it can
 * also travel through the system clipboard or between adaptations.
 * Isomorphic and pure.
 * @module utils/edl/clipboard
 */

import { shiftClip } from './clipMath.js';
import { prepareFragment } from './fragment.js';
import { idList, tracksOfType } from './immutable.js';
import { addClips, ensureTrack } from './placement.js';
import { rippleInsert } from './ripple.js';
import { finite, fpsOf, snap } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */

/**
 * @typedef {Object} ClipboardItem
 * @property {'video'|'audio'} type - Type of the track the clip came from
 * @property {number} row - Index of that track among the tracks of its type
 * @property {Clip} clip - Times are relative to the payload start (0)
 */

/**
 * @typedef {Object} Clipboard
 * @property {'nearedit/clips'} kind
 * @property {number} start - Timeline time of the earliest copied clip
 * @property {number} duration - Length of the copied material
 * @property {ClipboardItem[]} items
 */

/**
 * Copy clips to a clipboard payload. Copy exactly the given ids — pass the
 * selection through `expandSelection` first to include linked partners.
 * @param {Edl} edl
 * @param {Iterable<string>} clipIds
 * @returns {Clipboard|null} null when none of the ids exist
 */
export function copyClips(edl, clipIds) {
  const ids = new Set(idList(clipIds));
  const fps = fpsOf(edl);
  /** @type {ClipboardItem[]} */
  const found = [];
  for (const type of /** @type {('video'|'audio')[]} */ (['video', 'audio'])) {
    tracksOfType(edl, type).forEach((track, row) => {
      for (const clip of track.clips) if (ids.has(clip.clipId)) found.push({ type, row, clip });
    });
  }
  if (!found.length) return null;
  const start = Math.min(...found.map((item) => item.clip.timelineStart));
  const end = Math.max(...found.map((item) => item.clip.timelineEnd));
  const items = found.map((item) => ({ ...item, clip: shiftClip(item.clip, -start, fps) }));
  return { kind: 'nearedit/clips', start, duration: snap(edl, end - start), items };
}

/**
 * Paste a clipboard payload. Pasted clips get fresh ids; links and groups
 * inside the payload are kept, and the clips keep their relative layout in
 * time and across tracks.
 * @param {Edl} edl
 * @param {Clipboard|null} clipboard
 * @param {{ time?: number, trackId?: string, ripple?: boolean,
 *   autoCrossfade?: boolean }} [opts]
 *   `time`: where the payload starts (default 0). `trackId`: the top-most
 *   copied track of that type lands here and the other tracks of that type
 *   keep their distance from it; without it clips return to the rows they
 *   were copied from. Missing tracks are created; clips aimed at a locked
 *   track are skipped. `ripple`: open a gap for the payload first
 * @returns {Edl}
 */
export function pasteClips(edl, clipboard, opts = {}) {
  // The payload may have travelled through the system clipboard: treat it
  // like a director fragment — sanitise the clips, re-identify them, and
  // keep only the links and groups that live inside it.
  const items = Array.isArray(clipboard?.items) ? clipboard.items : [];
  const parts = items.map((item) => ({ type: item?.type, index: item?.row, clips: [item?.clip] }));
  const fragment = prepareFragment({ tracks: parts }, fpsOf(edl));
  if (!(fragment.duration > 0)) return edl;
  const at = Math.max(0, snap(edl, finite(opts.time, 0)));
  const target = edl.tracks.find((track) => track.trackId === opts.trackId);
  const rows = fragment.tracks.filter((part) => part.type === target?.type).map((p) => p.row);
  const shift = rows.length
    ? tracksOfType(edl, target.type).indexOf(target) - Math.min(...rows)
    : 0;
  let doc = opts.ripple ? rippleInsert(edl, at, fragment.duration) : edl;
  const placed = [];
  for (const part of fragment.tracks.filter((p) => p.clips.length)) {
    const row = part.type === target?.type ? part.row + shift : part.row;
    const picked = ensureTrack(doc, part.type, row);
    doc = picked.edl;
    for (const clip of part.clips) {
      placed.push({ trackId: picked.track.trackId, clip: shiftClip(clip, at, fpsOf(edl)) });
    }
  }
  return addClips(doc, placed, { autoCrossfade: opts.autoCrossfade });
}

/**
 * Duplicate clips onto the same tracks, right after the selection or at a
 * given time.
 * @param {Edl} edl
 * @param {Iterable<string>} clipIds
 * @param {{ time?: number, ripple?: boolean, autoCrossfade?: boolean }} [opts]
 * @returns {Edl}
 */
export function duplicateClips(edl, clipIds, opts = {}) {
  const clipboard = copyClips(edl, clipIds);
  if (!clipboard) return edl;
  const time = finite(opts.time, clipboard.start + clipboard.duration);
  return pasteClips(edl, clipboard, { ...opts, time, trackId: undefined });
}
