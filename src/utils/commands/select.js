/**
 * Selection commands: select all / none, group / ungroup, link / unlink.
 * @module utils/commands/select
 */

import { findClip, groupClips, linkClips, ungroupClips, unlinkClips } from '#utils/edl/index.js';
import { edit, getDoc } from '#utils/editor/session.js';
import { clearSelection, getSelection, selectAll } from '#utils/editor/view.js';

/** Select every clip on an unlocked track. */
export function selectAllClips() {
  selectAll();
  return true;
}

/** @returns {boolean} false when nothing was selected */
export function selectNone() {
  if (!getSelection().length) return false;
  clearSelection();
  return true;
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
