/**
 * Links that cross a lock. A whole-timeline result leaves locked tracks out
 * — a replace never writes to them — so a clip it returns cannot bring along
 * a partner that sits on a locked track; and the merge, which keeps only the
 * links inside a fragment, lets both ends of such a link go. This puts back
 * the links the result still asks for, by the editor's own rule for locked
 * tracks (docs/app-spec/EDL-OPERATIONS.md § Editing rules): the link of a
 * clip on a locked track changes only when its partner is deleted, split or
 * cut away. Isomorphic and pure.
 * @module utils/edl/lockedLinks
 */

import { indexClips } from './immutable.js';
import { sameJson } from './jsonBag.js';
import { applyLinks } from './links.js';

/** @typedef {import('./types.js').Edl} Edl */

/**
 * The pairs of a document with one clip on a locked track.
 * @param {Edl} edl
 * @returns {Map<string, string>} The id of the clip on an unlocked track → the
 *   id of its partner on a locked one
 */
export function lockedPartners(edl) {
  const index = indexClips(edl);
  /** @type {Map<string, string>} */
  const partners = new Map();
  for (const { clip, track } of index.values()) {
    const other = index.get(clip.linkedClipId);
    if (!track.locked || !other || other.track.locked) continue;
    if (other.clip.linkedClipId === clip.clipId) partners.set(other.clip.clipId, clip.clipId);
  }
  return partners;
}

/**
 * Keep the links between the clips a `replace` result returned and their
 * partners on locked tracks. A link is kept when the result returns the
 * clip under its own id still naming that partner — wherever the clip now
 * lies. A clip the result cut into pieces, dropped or unlinked stays
 * without the link, and so does its partner.
 * @param {Edl} before - The document the result was merged into
 * @param {any} result - A DirectorResult
 * @param {Edl} next - The document after the merge
 * @returns {Edl} `next` itself when there is no such link to put back. A
 *   locked track that is then exactly as it was is the very track it was
 */
export function keepLockedLinks(before, result, next) {
  if (result?.mode !== 'replace' || !Array.isArray(result.tracks)) return next;
  const partners = lockedPartners(before);
  if (!partners.size) return next;
  const now = indexClips(next);
  /** @type {Map<string, string>} */
  const links = new Map();
  for (const track of result.tracks) {
    for (const clip of Array.isArray(track?.clips) ? track.clips : []) {
      const partnerId = partners.get(clip?.clipId);
      if (!partnerId || clip.linkedClipId !== partnerId || links.has(clip.clipId)) continue;
      const [own, partner] = [now.get(clip.clipId), now.get(partnerId)];
      // Both are still there, and the merge linked neither to anything else.
      if (!own || !partner || own.clip.linkedClipId || partner.clip.linkedClipId) continue;
      links.set(clip.clipId, partnerId);
      links.set(partnerId, clip.clipId);
    }
  }
  if (!links.size) return next;
  const linked = applyLinks(next, links);
  const was = new Map(before.tracks.map((track) => [track.trackId, track]));
  const tracks = linked.tracks.map((track) => {
    const old = track.locked ? was.get(track.trackId) : null;
    return old && old !== track && sameJson(old, track) ? old : track;
  });
  return { ...linked, tracks };
}
