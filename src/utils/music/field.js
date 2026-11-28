/**
 * The `music` field of a clip as data: reading it from a loaded document,
 * checking it, and fitting a clip's source window to its song. A clip has a
 * `music` block only when it is a music clip — every other clip has no such
 * field. Isomorphic and pure.
 * @module utils/music/field
 */

import { isPlainObject } from '#utils/edl/jsonBag.js';
import { own } from '#utils/web/coerce.js';
import { fitWindow } from '#utils/web/field.js';
import { KEY_PATTERN } from './key.js';
import { normalizeSong } from './normalize.js';

/** @typedef {import('./types.js').MusicBlock} MusicBlock */
/** @typedef {(path: string, message: string) => void} Report */

/**
 * Read a `music` block. The song is normalised — which also bounds it: only
 * known fields of plain objects are read, every list is cut to its limit —
 * and `key` is kept when it looks like one.
 * @param {any} raw
 * @returns {MusicBlock|null} null for anything without a song object
 */
export function cleanMusic(raw) {
  if (!isPlainObject(raw) || !isPlainObject(own(raw, 'song'))) return null;
  const key = own(raw, 'key');
  return {
    song: normalizeSong(own(raw, 'song')),
    key: typeof key === 'string' && KEY_PATTERN.test(key) ? key : '',
  };
}

/**
 * @param {any} a
 * @param {any} b
 * @param {string} path
 * @returns {string|null} Path of the first place two JSON values differ, or null
 */
export function firstDifference(a, b, path) {
  if (a === b) return null;
  if (Array.isArray(a) !== Array.isArray(b) || typeof a !== typeof b) return path;
  if (typeof a !== 'object' || !a || !b) return path;
  if (!Array.isArray(a) && !(isPlainObject(a) && isPlainObject(b))) return path;
  const extra = Object.keys(b).find((key) => !Object.hasOwn(a, key));
  if (extra !== undefined) return Array.isArray(b) ? `${path}[${extra}]` : `${path}.${extra}`;
  for (const key of Object.keys(a)) {
    const at = Array.isArray(a) ? `${path}[${key}]` : `${path}.${key}`;
    const found = Object.hasOwn(b, key) ? firstDifference(a[key], b[key], at) : at;
    if (found !== null) return found;
  }
  return null;
}

/**
 * Check a clip's `music` field for `validateEdl`: absent, or exactly what
 * `cleanMusic` produces — a normalised song and a key or ''. Whether the
 * song is worth hearing is not a matter of the document's validity;
 * `validateSong` says what its author got wrong.
 * @param {any} music
 * @param {string} path - Path of the field, e.g. `tracks[1].clips[0].music`
 * @param {Report} report
 */
export function checkMusic(music, path, report) {
  if (music === undefined) return;
  if (!isPlainObject(music)) return report(path, 'must be an object');
  const unknown = Object.keys(music).find((key) => !['song', 'key'].includes(key));
  if (unknown !== undefined) report(`${path}.${unknown}`, 'is not a field of a music clip');
  if (typeof music.key !== 'string' || (music.key !== '' && !KEY_PATTERN.test(music.key))) {
    report(`${path}.key`, "must be '' or the 20 hex digits of a rendering's key");
  }
  if (!isPlainObject(music.song)) return report(`${path}.song`, 'must be an object');
  const at = firstDifference(music.song, normalizeSong(music.song), `${path}.song`);
  if (at !== null) report(at, 'is not what a normalised song holds (see normalizeSong)');
}

/**
 * Give a music clip a new source length. A song's length is rarely a whole
 * number of frames, so a clip shows "all of it" when its window starts at 0
 * and ends within a frame of the song's end; such a clip follows the new
 * length. Any other clip keeps its window, only brought inside the new song.
 * @param {{ sourceIn: number, sourceOut: number, timelineStart: number,
 *   timelineEnd: number }} clip
 * @param {number} from - Length of the song the window was cut from
 * @param {number} to - Length of the new song
 * @param {number} fps
 * @returns {{ sourceIn: number, sourceOut: number, timelineEnd: number }}
 */
export function refitSong(clip, from, to, fps) {
  const frame = 1 / fps;
  const whole = Math.abs(clip.sourceIn) <= frame / 2 && clip.sourceOut >= from - frame - 1e-6;
  const length = whole ? to : clip.timelineEnd - clip.timelineStart;
  const fitted = fitWindow(whole ? 0 : clip.sourceIn, length, to, fps);
  const timelineEnd = Math.round((clip.timelineStart + fitted.length) * fps) / fps;
  return {
    sourceIn: fitted.sourceIn,
    sourceOut: fitted.sourceIn + (timelineEnd - clip.timelineStart),
    timelineEnd,
  };
}
