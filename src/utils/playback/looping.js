/**
 * Loop and end-of-timeline rules for the transport. Pure and isomorphic.
 * @module utils/playback/looping
 */

/**
 * @typedef {{ start: number, end: number }} LoopRange
 */

/**
 * The region playback repeats, or null when looping is off. A loop region
 * with no length (the default 0..0) means "loop the whole timeline".
 * @param {{ loopEnabled?: boolean, loopStart?: number, loopEnd?: number }} view
 * @param {number} duration - Timeline duration, seconds
 * @returns {LoopRange|null}
 */
export function loopRange(view, duration) {
  if (!view?.loopEnabled) return null;
  const start = Math.max(0, view.loopStart || 0);
  const end = view.loopEnd || 0;
  if (end > start) return { start, end };
  return duration > 0 ? { start: 0, end: duration } : null;
}

/**
 * Where playback should begin when Play is pressed at `position`. With
 * nothing left to play there (the playhead sits at the end), it starts over:
 * from the loop start when looping, else from the edit cursor if that is
 * still inside the timeline (replay what was just reviewed), else the top.
 * @param {number} position - Playhead, seconds
 * @param {number} duration - Timeline duration, seconds
 * @param {LoopRange|null} loop
 * @param {number} [cursor=0] - Edit cursor, seconds
 * @returns {number}
 */
export function playStart(position, duration, loop, cursor = 0) {
  const from = Math.max(0, position);
  const stopAt = loop && from < loop.end ? loop.end : duration;
  if (from < stopAt) return from;
  if (loop) return loop.start;
  return cursor >= 0 && cursor < duration ? cursor : 0;
}

/**
 * Apply looping and the end of the timeline to one clock step.
 * Playback wraps when it crosses the loop end from inside the loop; when it
 * starts beyond the loop it runs on to the end of the timeline and stops.
 * @param {number} previous - Position at the last step
 * @param {number} next - Position the clock reports now
 * @param {number} duration - Timeline duration, seconds
 * @param {LoopRange|null} loop
 * @returns {{ position: number, wrapped: boolean, ended: boolean }}
 */
export function advance(previous, next, duration, loop) {
  if (loop && previous < loop.end) {
    if (next < loop.end) return { position: next, wrapped: false, ended: false };
    const length = loop.end - loop.start;
    const position = loop.start + ((next - loop.end) % length);
    return { position, wrapped: true, ended: false };
  }
  if (next >= duration) return { position: duration, wrapped: false, ended: true };
  return { position: next, wrapped: false, ended: false };
}
