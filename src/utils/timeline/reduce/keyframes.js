/**
 * Dragging a keyframe mark on a clip: every key the clip has at that time
 * moves with it. Pure: document in, document out.
 * @module utils/timeline/reduce/keyframes
 */

import { moveKeyframesAt } from '#utils/edl/keyframes.js';
import { findClip } from '#utils/edl/query.js';
import { snap } from '#utils/edl/time.js';

/**
 * @param {import('#utils/edl/types.js').Edl} base - Document the drag started from
 * @param {string} clipId
 * @param {number} from - Timeline time of the mark that was grabbed
 * @param {number} to - Where the pointer wants it
 * @returns {{ doc: import('#utils/edl/types.js').Edl, time: number }} The
 *   document with the keys moved, and where they landed: on the frame
 *   grid, inside the clip
 */
export function keyframePreview(base, clipId, from, to) {
  const clip = findClip(base, clipId)?.clip;
  if (!clip || !Number.isFinite(to)) return { doc: base, time: from };
  const time = snap(base, Math.min(clip.timelineEnd, Math.max(clip.timelineStart, to)));
  return { doc: moveKeyframesAt(base, clipId, from, time), time };
}
