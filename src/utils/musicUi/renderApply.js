/**
 * Rendering a song on the server, the part that needs no network: which
 * renderings a document is waiting for, and what a finished one means for
 * it. A rendering is attached to every clip whose song still asks for
 * exactly it (two clips with one song share one file); a clip on a locked
 * track is left alone, as every edit leaves it. Pure and isomorphic.
 * @module utils/musicUi/renderApply
 */

import { musicClips, setMusicRendering } from '#utils/edl/musicClip.js';
import { isStaleMusic } from '#utils/music/clip.js';
import { songKey } from '#utils/music/key.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */
/** @typedef {{ file: string, key: string, duration: number, cached?: boolean }} Rendering */

/** @type {WeakMap<object, string>} Documents are never changed in place: a song has one key */
const keys = new WeakMap();

/**
 * @param {any} song - A song as a document holds it
 * @returns {string} The key of the rendering it asks for
 */
export function keyOf(song) {
  if (!keys.has(song)) keys.set(song, songKey(song));
  return keys.get(song);
}

/**
 * The renderings a document is waiting for: one per song that some music
 * clip on an unlocked track holds without its rendering.
 * @param {Edl} doc
 * @returns {Map<string, { song: any, clipIds: string[] }>} By key
 */
export function wantedRenderings(doc) {
  /** @type {Map<string, { song: any, clipIds: string[] }>} */
  const wanted = new Map();
  for (const { clip, track } of musicClips(doc)) {
    if (track.locked || !isStaleMusic(clip)) continue;
    const key = keyOf(clip.music.song);
    const entry = wanted.get(key) || { song: clip.music.song, clipIds: [] };
    entry.clipIds.push(clip.clipId);
    wanted.set(key, entry);
  }
  return wanted;
}

/**
 * @param {any} answer - What `POST /music/render` said
 * @returns {answer is Rendering} True when it names a file, a key and a length
 */
export function isRendering(answer) {
  return (
    typeof answer?.file === 'string' &&
    answer.file !== '' &&
    typeof answer.key === 'string' &&
    Number.isFinite(answer.duration) &&
    answer.duration > 0
  );
}

/**
 * Attach a finished rendering to every clip that is waiting for it.
 * @param {Edl} doc
 * @param {Rendering} rendering
 * @param {{ autoCrossfade?: boolean }} [opts]
 * @returns {Edl} The same document when no clip took it
 */
export function attachRendering(doc, rendering, opts = {}) {
  const waiting = wantedRenderings(doc).get(rendering.key);
  let next = doc;
  for (const clipId of waiting?.clipIds || []) {
    next = setMusicRendering(next, clipId, rendering, opts);
  }
  return next;
}

/**
 * What the server said went wrong, as one sentence: its error, its detail,
 * and for a song it will not render the first thing it names (`fields`:
 * path → problem).
 * @param {any} err - An `ApiError`, or anything thrown
 * @returns {string}
 */
export function failureText(err) {
  const fields = err?.body?.fields;
  const [first] = fields && typeof fields === 'object' ? Object.entries(fields) : [];
  const where = first ? ` (${first[0]}: ${first[1]})` : '';
  const detail = typeof err?.body?.detail === 'string' ? `: ${err.body.detail}` : '';
  if (err?.status) return `${err.message}${detail}${where}`;
  return 'The server could not be reached — the song will be rendered when it can be';
}
