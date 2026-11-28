/**
 * Music clips — clips whose sound is written, not recorded
 * (docs/app-spec/MUSIC.md). A music clip carries `music: { song, key }`:
 * the song is the source of truth, `key` names the rendering `sourceFile`
 * points at. Until it is rendered it is a placeholder as long as its song;
 * rendered, it is an audio clip like any other. Its source is its song, so
 * its window always lies inside `0 … musicDuration`. Isomorphic and pure.
 * @module utils/edl/musicClip
 */

import { isMusicClip, isStaleMusic, musicDuration } from '#utils/music/clip.js';
import { refitSong } from '#utils/music/field.js';
import { KEY_PATTERN } from '#utils/music/key.js';
import { songLabel } from '#utils/music/label.js';
import { normalizeSong } from '#utils/music/normalize.js';
import { intersects, reuseClip } from './clipMath.js';
import { settle } from './crossfade.js';
import { createClip } from './factory.js';
import { indexClips, mapClips, tracksOfType } from './immutable.js';
import { sameJson } from './jsonBag.js';
import { addClips, pickTrack } from './placement.js';
import { allClips } from './query.js';
import { finite, floorToFrame, fpsOf, frameDuration, snap } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */
/** @typedef {import('./types.js').ClipRef} ClipRef */

/**
 * Add a music clip: a placeholder as long as the song, carrying the song,
 * not rendered yet. It goes on an audio track: the first unlocked one that
 * is free in its time span, otherwise a new audio track at the bottom; with
 * an explicit `trackId` it goes there under the normal overlap rules. Find
 * it with `newClipIds(before, after)`.
 * @param {Edl} edl
 * @param {any} song - Normalised here; anything that is not an object is
 *   the empty song
 * @param {{ time?: number, trackId?: string, autoCrossfade?: boolean, label?: string }} [opts] -
 *   `time` default 0; `label` default: the names of the song's parts
 * @returns {Edl}
 */
export function insertMusicClip(edl, song, opts = {}) {
  const music = { song: normalizeSong(song), key: '' };
  const start = Math.max(0, snap(edl, finite(opts.time, 0)));
  // Whole frames of the song: a clip never shows more than there is.
  const length = Math.max(frameDuration(edl), floorToFrame(edl, musicDuration({ music })));
  const span = { timelineStart: start, timelineEnd: snap(edl, start + length), sourceIn: 0 };
  const label = typeof opts.label === 'string' ? opts.label : songLabel(music.song);
  const clip = createClip({ ...span, label, intent: 'music', placeholder: true, music });
  // The audio tracks that have room there, in order; `pickTrack` adds one when none has.
  const free = tracksOfType(edl, 'audio').filter((candidate) => {
    return !candidate.clips.some((other) => intersects(other, clip));
  });
  const { edl: doc, track } = pickTrack(edl, 'audio', opts.trackId, free);
  return addClips(doc, [{ trackId: track.trackId, clip }], { autoCrossfade: opts.autoCrossfade });
}

/**
 * Rewrite one clip that has a `music` block, then settle its track: a clip
 * that grew over its neighbour cross-fades with it or overwrites it, as a
 * trimmed one would.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {{ autoCrossfade?: boolean }} opts
 * @param {(clip: Clip) => Clip} change - Returns a clip that is the same
 *   in every field to change nothing
 * @returns {Edl} Unchanged for an unknown clip, a clip on a locked track
 *   and a clip that is not a music clip
 */
function changeMusicClip(edl, clipId, opts, change) {
  const ref = indexClips(edl).get(clipId);
  if (!ref || ref.track.locked || !isMusicClip(ref.clip)) return edl;
  const next = reuseClip(ref.clip, change(ref.clip));
  if (next === ref.clip) return edl;
  const raw = mapClips(edl, (clip) => (clip === ref.clip ? next : clip));
  return settle(edl, raw, { incoming: [clipId], autoCrossfade: opts?.autoCrossfade });
}

/**
 * Replace a music clip's song. A clip that showed the whole of its old song
 * shows the whole of the new one: its length follows. One that was trimmed
 * keeps its window, brought inside the new song. `sourceFile` and
 * `music.key` stay as they are — the old rendering keeps playing and the
 * clip is stale (`isStaleMusic`) until `setMusicRendering` brings the new one.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {any} song - The whole new song, or a function from the current
 *   song to the new one; normalised here
 * @param {{ autoCrossfade?: boolean }} [opts]
 * @returns {Edl} Unchanged when the song says what the old one said
 */
export function updateSong(edl, clipId, song, opts = {}) {
  const fps = fpsOf(edl);
  return changeMusicClip(edl, clipId, opts, (clip) => {
    const given = typeof song === 'function' ? song(clip.music.song) : song;
    const music = { ...clip.music, song: normalizeSong(given) };
    if (sameJson(music.song, clip.music.song)) return clip;
    const window = refitSong(clip, musicDuration(clip), musicDuration({ music }), fps);
    return { ...clip, music, ...window };
  });
}

/**
 * Point a music clip at a finished rendering: sets `sourceFile` and
 * `music.key`, and the clip stops being a placeholder. When the rendering
 * is the one the clip's song asks for, the window is fitted to its
 * `duration` as `updateSong` fits it to a song. A rendering of an earlier
 * song (the song changed while it was being made) is played as it is: the
 * clip keeps the length of its current song and stays stale.
 * @param {Edl} edl
 * @param {string} clipId
 * @param {{ file: string, key: string, duration: number }} rendering - The
 *   answer of `POST /music/render`
 * @param {{ autoCrossfade?: boolean }} [opts]
 * @returns {Edl} Unchanged without a file, a key and a duration, and for a
 *   clip that is not a music clip
 */
export function setMusicRendering(edl, clipId, rendering, opts = {}) {
  const { file, key, duration } = rendering || {};
  const named = typeof file === 'string' && file !== '' && KEY_PATTERN.test(key);
  if (!named || !Number.isFinite(duration) || !(duration > 0)) return edl;
  const fps = fpsOf(edl);
  return changeMusicClip(edl, clipId, opts, (clip) => {
    const music = key === clip.music.key ? clip.music : { ...clip.music, key };
    const whole = musicDuration(clip);
    const fresh = !isStaleMusic({ music });
    const window = fresh ? refitSong(clip, whole, Math.min(duration, whole), fps) : {};
    return { ...clip, sourceFile: file, placeholder: false, music, ...window };
  });
}

/**
 * @param {Edl} edl
 * @returns {ClipRef[]} Every music clip with its track, in track then time order
 */
export function musicClips(edl) {
  return allClips(edl).filter(({ clip }) => isMusicClip(clip));
}

/**
 * @param {Edl} edl
 * @returns {ClipRef[]} The music clips that need rendering: never rendered,
 *   or rendered from another song
 */
export function staleMusicClips(edl) {
  return musicClips(edl).filter(({ clip }) => isStaleMusic(clip));
}
