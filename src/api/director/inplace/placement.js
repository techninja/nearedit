/**
 * Placing new material into an existing timeline:
 * - as a cutaway laid over it without moving anything — picture on a free
 *   track in front of whatever is showing, sound on a free track of its own;
 * - as a ripple insert — on the track of the picture it interrupts.
 * @module api/director/inplace/placement
 */

import { LAYOUT } from '#utils/director/layout.js';
import { clipKind } from '#utils/edl/factory.js';
import { docTracks, insertTrack, isFree } from './doc.js';

/** @typedef {import('./doc.js').DocTrack} DocTrack */

const hasTitles = (/** @type {DocTrack} */ t) => t.clips.some((c) => clipKind(c, t) === 'title');

/**
 * The video track a cutaway over [start, end) belongs on: the nearest free
 * track in front of the picture showing there (never a titles track), else
 * a new track inserted right in front of that picture.
 * @param {DocTrack[]} tracks
 * @param {number} start - Seconds
 * @param {number} end
 * @returns {DocTrack}
 */
export function cutawayTrack(tracks, start, end) {
  const video = tracks.filter((t) => t.type === 'video').sort((a, b) => a.index - b.index);
  const showing = video.find((t) =>
    t.clips.some(
      (c) =>
        clipKind(c, t) !== 'title' && c.timelineEnd > start + 1e-6 && c.timelineStart < end - 1e-6,
    ),
  );
  const usable = (/** @type {DocTrack} */ t) => !t.locked && !hasTitles(t) && isFree(t, start, end);
  if (!showing) return video.find(usable) || insertTrack(tracks, 'video', video.length, 'B-roll');
  const inFront = video.filter((t) => t.index < showing.index && usable(t)).at(-1);
  return inFront || insertTrack(tracks, 'video', showing.index, 'B-roll');
}

/**
 * The audio track for a cutaway's natural sound: an "Ambience" track when
 * it is free, else any free track but the first, else a new one.
 * @param {DocTrack[]} tracks
 * @param {number} start
 * @param {number} end
 * @returns {DocTrack}
 */
export function ambienceTrack(tracks, start, end) {
  const audio = tracks.filter((t) => t.type === 'audio').sort((a, b) => a.index - b.index);
  const usable = (/** @type {DocTrack} */ t) => !t.locked && isFree(t, start, end);
  return (
    audio.find((t) => /ambien/i.test(t.name) && usable(t)) ||
    audio.find((t) => t.index > 0 && usable(t)) ||
    insertTrack(tracks, 'audio', audio.length, 'Ambience')
  );
}

/**
 * Lay a fragment's picture and sound over the document at `at`.
 * @param {DocTrack[]} tracks - Document tracks (modified)
 * @param {{ type: string, clips: any[] }[]} fragment - Tracks with fragment-relative times
 * @param {number} at - Seconds
 * @returns {{ video: DocTrack|null, audio: DocTrack|null }} Where things went
 */
export function overlayFragment(tracks, fragment, at) {
  const shifted = (/** @type {string} */ type) =>
    fragment
      .filter((t) => t.type === type)
      .flatMap((t) => t.clips)
      .map((c) => ({ ...c, timelineStart: c.timelineStart + at, timelineEnd: c.timelineEnd + at }));
  const span = (/** @type {any[]} */ clips) => [
    Math.min(...clips.map((c) => c.timelineStart)),
    Math.max(...clips.map((c) => c.timelineEnd)),
  ];
  const placed = { video: null, audio: null };
  for (const type of /** @type {const} */ (['video', 'audio'])) {
    const clips = shifted(type);
    if (!clips.length) continue;
    const [start, end] = span(clips);
    const track =
      type === 'video' ? cutawayTrack(tracks, start, end) : ambienceTrack(tracks, start, end);
    track.clips.push(...clips);
    placed[type] = track;
  }
  return placed;
}

/**
 * Where a ripple-inserted clip goes in the existing document: the track of
 * the picture under the playhead (else the busiest picture track), and an
 * ambience track for its sound.
 * @param {any} edl
 * @param {number} at
 * @returns {{ video: { index: number, name: string }, audio: { index: number, name: string } }}
 */
export function insertTargets(edl, at) {
  const tracks = docTracks(edl);
  const video = tracks.filter((t) => t.type === 'video');
  const pictures = (/** @type {any} */ t) => t.clips.filter((c) => clipKind(c, t) !== 'title');
  const under = video.find((t) =>
    pictures(t).some((c) => at >= c.timelineStart && at < c.timelineEnd),
  );
  const busiest = [...video].sort((a, b) => pictures(b).length - pictures(a).length)[0];
  const picture = under || (busiest && pictures(busiest).length ? busiest : null);
  const ambience = tracks.find((t) => t.type === 'audio' && /ambien/i.test(t.name));
  return {
    video: picture ? { index: picture.index, name: picture.name } : LAYOUT.main,
    audio: ambience ? { index: ambience.index, name: ambience.name } : LAYOUT.ambience,
  };
}
