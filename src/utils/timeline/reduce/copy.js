/**
 * Ctrl-drag: the dragged clips stay where they are and copies travel with
 * the pointer — in time, and to another track of the same kind. Pure.
 * @module utils/timeline/reduce/copy
 */

import {
  copyClips,
  expandSelection,
  findClip,
  pasteClips,
  snapMove,
  tracksOfType,
} from '#utils/edl/index.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * The document a copy drag shows at this moment. Every call makes the
 * copies anew (with new ids) from the document the drag started from.
 * @param {Edl} base
 * @param {import('./move.js').MoveDrag} drag
 * @param {import('./move.js').EditModes} modes
 * @param {import('./move.js').SnapContext} [snap]
 * @returns {{ doc: Edl, guide: number|null }}
 */
export function copyPreview(base, drag, modes, snap) {
  const ids = expandSelection(base, drag.clipIds);
  const anchor = findClip(base, drag.anchorId);
  const payload = copyClips(base, ids);
  if (!anchor || !payload) return { doc: base, guide: null };
  const hit =
    modes.snapping && snap
      ? snapMove(base, ids, drag.delta, { ...snap, anchorId: drag.anchorId })
      : null;
  const delta = Math.max(hit?.snapped ? hit.delta : drag.delta, -payload.start);
  // The copies keep their rows relative to the anchor, which follows the pointer.
  const lane = tracksOfType(base, anchor.track.type);
  const rows = payload.items.filter((item) => item.type === anchor.track.type).map((i) => i.row);
  const [top, bottom] = [Math.min(...rows), Math.max(...rows)];
  const home = lane.indexOf(anchor.track);
  const pointed = lane.findIndex((track) => track.trackId === drag.toTrackId);
  const shift = (pointed < 0 ? home : pointed) - home;
  const fits = (by) => top + by >= 0 && bottom + by < lane.length;
  const open = (by) => rows.every((row) => !lane[row + by].locked);
  const by = fits(shift) && open(shift) ? shift : 0;
  const doc = pasteClips(base, payload, {
    time: payload.start + delta,
    trackId: lane[top + by].trackId,
    autoCrossfade: modes.autoCrossfade,
  });
  const guide = hit?.snapped && delta === hit.delta ? hit.target.time : null;
  return { doc, guide };
}
