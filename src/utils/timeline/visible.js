/**
 * Finding the clips that matter for a time range without walking the whole
 * track. A track's clips are sorted by start and, because no clip lies
 * inside another (EDL invariant 4), by end as well — so a binary search
 * finds the first clip that reaches into the range. Pure.
 * @module utils/timeline/visible
 */

/** @typedef {import('#utils/edl/types.js').Clip} Clip */

/**
 * Index of the first clip that ends after `time`.
 * @param {Clip[]} clips - One track's clips, sorted
 * @param {number} time
 * @returns {number} `clips.length` when every clip ends at or before `time`
 */
export function firstEndingAfter(clips, time) {
  let low = 0;
  let high = clips.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (clips[mid].timelineEnd > time) high = mid;
    else low = mid + 1;
  }
  return low;
}

/**
 * The slice of a track that intersects a time range.
 * @param {Clip[]} clips - One track's clips, sorted
 * @param {number} start
 * @param {number} end
 * @returns {{ from: number, to: number }} Indices; `to` is exclusive
 */
export function visibleSlice(clips, start, end) {
  const from = firstEndingAfter(clips, start);
  let to = from;
  while (to < clips.length && clips[to].timelineStart < end) to++;
  return { from, to };
}

/**
 * Clips covering one moment, with their indices (two during a cross-fade).
 * @param {Clip[]} clips - One track's clips, sorted
 * @param {number} time
 * @returns {{ clip: Clip, index: number }[]} In track order
 */
export function clipsAtTime(clips, time) {
  const out = [];
  for (let index = firstEndingAfter(clips, time); index < clips.length; index++) {
    const clip = clips[index];
    if (clip.timelineStart > time) break;
    out.push({ clip, index });
  }
  return out;
}

/**
 * Whether a clip's edges cross-fade with its neighbours.
 * @param {Clip[]} clips - One track's clips, sorted
 * @param {number} index
 * @returns {{ in: number, out: number }} Overlap lengths in seconds, 0 when free
 */
export function edgeOverlaps(clips, index) {
  const clip = clips[index];
  const prev = clips[index - 1];
  const next = clips[index + 1];
  return {
    in: prev ? Math.max(0, Math.min(prev.timelineEnd, clip.timelineEnd) - clip.timelineStart) : 0,
    out: next
      ? Math.max(0, clip.timelineEnd - Math.max(next.timelineStart, clip.timelineStart))
      : 0,
  };
}
