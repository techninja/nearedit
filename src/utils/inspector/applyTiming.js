/**
 * Inspector changes that go through their own EDL operations rather than
 * a field write: where a clip sits (move, trim, slip), and the link and
 * group buttons. Isomorphic and pure.
 * @module utils/inspector/applyTiming
 */

import { slipClip } from '#utils/edl/clipEdit.js';
import { moveClips } from '#utils/edl/move.js';
import { groupClips, linkClips, ungroupClips, unlinkClips } from '#utils/edl/selection.js';
import { trimClipEnd } from '#utils/edl/trim.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * Timing fields act on one clip; its linked partner follows.
 * @param {Edl} edl
 * @param {any} clip
 * @param {{ name: string, value?: any }} change
 * @param {import('./apply.js').ApplyOptions} opts
 * @returns {Edl}
 */
export function applyTiming(edl, clip, { name, value }, opts) {
  if (!Number.isFinite(value)) return edl;
  const id = clip.clipId;
  const flags = { sourceDurations: opts.sourceDurations, autoCrossfade: opts.autoCrossfade };
  if (name === 'timing.start')
    return moveClips(edl, [id], { ...flags, delta: value - clip.timelineStart });
  if (name === 'timing.end') return trimClipEnd(edl, id, value, flags);
  if (name === 'timing.duration') return trimClipEnd(edl, id, clip.timelineStart + value, flags);
  if (name === 'timing.sourceIn') return slipClip(edl, id, value - clip.sourceIn, flags);
  return edl;
}

/**
 * @param {Edl} edl
 * @param {string[]} ids
 * @param {string} action - `action.link`, `action.unlink`, `action.group`, `action.ungroup`
 * @returns {Edl}
 */
export function applyAction(edl, ids, action) {
  if (action === 'action.unlink') return unlinkClips(edl, ids);
  if (action === 'action.link') return ids.length === 2 ? linkClips(edl, ids[0], ids[1]) : edl;
  if (action === 'action.group') return groupClips(edl, ids);
  if (action === 'action.ungroup') return ungroupClips(edl, ids);
  return edl;
}
