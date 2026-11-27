/**
 * Selection commands: select all / none, group / ungroup, link / unlink.
 * @module utils/commands/select
 */

import {
  expandSelection,
  findClip,
  groupClips,
  linkClips,
  ungroupClips,
  unlinkClips,
} from '#utils/edl/index.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { clearSelection, getSelection, selectAll, setSelection } from '#utils/editor/view.js';
import { getEdgeTrim, setEdgeTrim } from '#utils/timeline/edgeTrim.js';

/** Select every clip on an unlocked track. */
export function selectAllClips() {
  selectAll();
  return true;
}

/**
 * Escape: leave edge-trim mode when it is on; otherwise clear the selection.
 * @returns {boolean} false when there was nothing to do
 */
export function selectNone() {
  if (getEdgeTrim()) return (setEdgeTrim(null), true);
  if (!getSelection().length) return false;
  clearSelection();
  return true;
}

/** @returns {boolean} True when Escape has something to do */
export const canSelectNone = () => !!getEdgeTrim() || getSelection().length > 0;

/**
 * Shift+G: grow the selection to every clip grouped (or linked) with it.
 * @returns {boolean} false when it already was
 */
export function selectWholeGroups() {
  const ids = getSelection();
  const all = expandSelection(getDoc(), ids);
  if (all.length === ids.length) return false;
  setSelection(all, { expand: false });
  return true;
}

/**
 * U the Vegas way: take the selected clips out of their groups. The other
 * members stay grouped — unless only one would be left.
 * @returns {boolean}
 */
export function removeFromGroup() {
  const leaving = new Set(getSelection());
  return edit((doc) => {
    const clips = doc.tracks.flatMap((track) => track.clips);
    const groups = new Set(clips.filter((c) => leaving.has(c.clipId)).map((c) => c.groupId));
    let next = ungroupClips(doc, [...leaving]);
    for (const groupId of groups) {
      const staying = clips.filter((c) => c.groupId === groupId && !leaving.has(c.clipId));
      if (groupId)
        next = groupClips(
          next,
          staying.map((c) => c.clipId),
        );
    }
    return next;
  });
}

/**
 * Put the selected clips in one group so they move together.
 * @returns {boolean}
 */
export function groupSelection() {
  const ids = getSelection();
  return edit((doc) => groupClips(doc, ids));
}

/**
 * Dissolve every group a selected clip belongs to.
 * @returns {boolean}
 */
export function ungroupSelection() {
  const ids = getSelection();
  return edit((doc) => ungroupClips(doc, ids));
}

/** @returns {boolean} True when a selected clip is in a group */
export function selectionIsGrouped() {
  const doc = getDoc();
  return getSelection().some((id) => !!findClip(doc, id)?.clip.groupId);
}

/** @returns {boolean} True when a selected clip has a linked partner */
export function selectionIsLinked() {
  const doc = getDoc();
  return getSelection().some((id) => !!findClip(doc, id)?.clip.linkedClipId);
}

/**
 * The two clips "Link" would join: exactly two selected clips that are not
 * already each other's partner.
 * @returns {[string, string]|null}
 */
export function linkablePair() {
  const ids = getSelection();
  if (ids.length !== 2) return null;
  const first = findClip(getDoc(), ids[0])?.clip;
  if (!first || first.linkedClipId === ids[1]) return null;
  return [ids[0], ids[1]];
}

/**
 * Link the two selected clips as picture and sound partners.
 * @returns {boolean}
 */
export function linkSelection() {
  const pair = linkablePair();
  return !!pair && edit((doc) => linkClips(doc, pair[0], pair[1]));
}

/**
 * Break the links of the selected clips (for J- and L-cuts).
 * @returns {boolean}
 */
export function unlinkSelection() {
  const ids = getSelection();
  return edit((doc) => unlinkClips(doc, ids));
}
