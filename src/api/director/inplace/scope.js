/**
 * Scope of an in-place action: which clips of the timeline it works on.
 * @module api/director/inplace/scope
 */

/** @typedef {import('./doc.js').DocTrack} DocTrack */

/**
 * The clips an in-place action works on: the selection when there is one,
 * else the clips inside `context.range` in range mode, else every clip.
 * @param {DocTrack[]} tracks
 * @param {import('#utils/director/directive.js').Directive} directive
 * @returns {{ clip: any, track: DocTrack, chosen: boolean }[]} `chosen` is true when the
 *   user picked the clip explicitly
 */
export function scopedClips(tracks, directive) {
  const { selection, range } = directive.context;
  const all = tracks
    .filter((t) => !t.locked)
    .flatMap((track) => track.clips.map((clip) => ({ clip, track, chosen: false })));
  if (selection.length) {
    return all
      .filter((e) => selection.includes(e.clip.clipId))
      .map((e) => ({ ...e, chosen: true }));
  }
  if (directive.mode === 'range' && range)
    return all.filter((e) => e.clip.timelineEnd > range.start && e.clip.timelineStart < range.end);
  return all;
}
