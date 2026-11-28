/**
 * Changes to a song as a whole, as pure functions from a song to a song:
 * its tempo and length, its key, and the mix bus. Results need not be
 * normalised — `updateSong` normalises what it stores.
 * @module utils/musicUi/songEdit
 */

import { SONG_LIMITS } from '#utils/music/limits.js';

/** @typedef {import('#utils/music/types.js').Song} Song */

/** The fields of a song the editor's top bar sets, by the name a control reports. */
export const SONG_FIELDS = Object.freeze({
  bpm: { path: ['bpm'], range: SONG_LIMITS.bpm },
  swing: { path: ['swing'], range: SONG_LIMITS.swing },
  bars: { path: ['bars'], range: SONG_LIMITS.bars, whole: true },
  beatsPerBar: { path: ['beatsPerBar'], range: SONG_LIMITS.beatsPerBar, whole: true },
  tail: { path: ['tail'], range: SONG_LIMITS.tail },
  key: { path: ['key'] },
  scale: { path: ['scale'] },
  'master.volume': { path: ['master', 'volume'], range: SONG_LIMITS.volume },
  'master.reverb.size': { path: ['master', 'reverb', 'size'], range: [0, 1] },
  'master.reverb.decay': { path: ['master', 'reverb', 'decay'], range: [0, 1] },
  'master.delay.beats': { path: ['master', 'delay', 'beats'], range: SONG_LIMITS.delayBeats },
  'master.delay.feedback': { path: ['master', 'delay', 'feedback'], range: SONG_LIMITS.feedback },
});

/**
 * @param {any} target - A plain object
 * @param {string[]} path
 * @param {any} value
 * @returns {any} A copy with the value at the path; the objects on the way are copies too
 */
export function setIn(target, path, value) {
  const [head, ...rest] = path;
  const inner = rest.length ? setIn(target?.[head] ?? {}, rest, value) : value;
  return { ...target, [head]: inner };
}

/**
 * @param {any} target
 * @param {string[]} path
 * @returns {any} The value at the path, undefined when the way there is missing
 */
export function getIn(target, path) {
  return path.reduce((at, key) => (at === null || at === undefined ? undefined : at[key]), target);
}

/**
 * Set one named field of a song (`SONG_FIELDS`). Numbers are brought
 * inside their range; anything that is not a number leaves the song as it is.
 * @param {Song} song
 * @param {string} name
 * @param {any} value
 * @returns {Song} The same song for an unknown field or an unusable value
 */
export function setSongField(song, name, value) {
  const field = Object.hasOwn(SONG_FIELDS, name) ? SONG_FIELDS[name] : null;
  if (!field) return song;
  if (!field.range) return typeof value === 'string' ? setIn(song, field.path, value) : song;
  const number = typeof value === 'string' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return song;
  const inside = Math.min(field.range[1], Math.max(field.range[0], number));
  return setIn(song, field.path, field.whole ? Math.round(inside) : inside);
}

/**
 * @param {Song} song
 * @param {string} name - A name of `SONG_FIELDS`
 * @returns {any} Its value in the song
 */
export function songField(song, name) {
  return Object.hasOwn(SONG_FIELDS, name) ? getIn(song, SONG_FIELDS[name].path) : undefined;
}

/**
 * Replace one part of a song.
 * @param {Song} song
 * @param {string} partId
 * @param {(part: any) => any} change - Returns the same part to change nothing
 * @returns {Song} The same song when the part is unknown or unchanged
 */
export function changePart(song, partId, change) {
  const index = song.parts.findIndex((part) => part.id === partId);
  if (index < 0) return song;
  const next = change(song.parts[index]);
  if (next === song.parts[index]) return song;
  return { ...song, parts: song.parts.map((part, i) => (i === index ? next : part)) };
}

/**
 * @param {Song} song
 * @param {string} partId
 * @returns {any|null} The part with that id
 */
export function partOf(song, partId) {
  return song.parts.find((part) => part.id === partId) || null;
}
