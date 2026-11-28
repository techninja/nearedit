/**
 * What a clip's `music` block says about the clip: whether it is a music
 * clip, how long its song is, whether the rendering it points at is still
 * the one its song asks for. Documents are never changed in place, so keys
 * are remembered per song object. Isomorphic and pure.
 * @module utils/music/clip
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { songKey } from './key.js';
import { songSeconds } from './timing.js';

/** @typedef {import('./types.js').MusicBlock} MusicBlock */
/** @typedef {{ music?: Partial<MusicBlock> } | null | undefined} MusicHolder - A clip, for what this module reads */

/** @type {WeakMap<object, string>} */
const keys = new WeakMap();

/**
 * @param {MusicHolder} clip
 * @returns {boolean} True for a clip that carries a song — `{}` is a song
 */
export function isMusicClip(clip) {
  return isPlainObject(clip?.music?.song);
}

/**
 * How long a music clip's source is: its song, tail included — which is
 * also the length of the rendering that song makes. A music clip's source
 * window lies inside `0 … musicDuration`.
 * @param {MusicHolder} clip
 * @returns {number|undefined} Seconds; undefined when the clip is not a music clip
 */
export function musicDuration(clip) {
  return isMusicClip(clip) ? songSeconds(clip.music.song) : undefined;
}

/**
 * Whether a music clip needs rendering: its `music.key` is not the key of
 * its song. That is so for a clip that was never rendered (`key: ''`) and
 * for one whose song has changed since. The old rendering keeps playing
 * until the new one is set.
 * @param {MusicHolder} clip
 * @returns {boolean} False for a clip that is not a music clip
 */
export function isStaleMusic(clip) {
  if (!isMusicClip(clip)) return false;
  const { song, key } = clip.music;
  if (!keys.has(song)) keys.set(song, songKey(song));
  return key !== keys.get(song);
}
