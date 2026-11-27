/**
 * Edit points, markers and region ends as places to jump to. Pure.
 * @module utils/commands/editPoints
 */

/** Times closer than this are the same point. */
const SAME = 1e-4;

/**
 * Every clip edge of the document, plus time 0.
 * @param {import('#utils/edl/types.js').Edl} doc
 * @returns {number[]} Ascending, without duplicates
 */
export function editPoints(doc) {
  const times = [0];
  for (const track of doc.tracks) {
    for (const clip of track.clips) times.push(clip.timelineStart, clip.timelineEnd);
  }
  times.sort((a, b) => a - b);
  return times.filter((time, i) => i === 0 || time - times[i - 1] > SAME);
}

/**
 * The places the marker keys stop at: markers, and both ends of regions.
 * @param {import('#utils/edl/types.js').Edl} doc
 * @returns {number[]} Ascending, without duplicates
 */
export function markerTimes(doc) {
  const regions = /** @type {any} */ (doc).regions || [];
  const times = [
    ...(doc.markers || []).map((marker) => marker.time),
    ...regions.flatMap((region) => [region.start, region.end]),
  ].sort((a, b) => a - b);
  return times.filter((time, i) => i === 0 || time - times[i - 1] > SAME);
}

/**
 * The nearest point strictly before or after a time.
 * @param {number[]} points - Ascending
 * @param {number} time
 * @param {1|-1} direction - 1 = next, -1 = previous
 * @returns {number|null} null when there is none in that direction
 */
export function neighbourPoint(points, time, direction) {
  if (direction > 0) return points.find((point) => point > time + SAME) ?? null;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i] < time - SAME) return points[i];
  }
  return null;
}
