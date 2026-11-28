/**
 * Changes to the list of a song's parts and to what every part has —
 * name, mix, the length of its loop, where it plays — as pure functions
 * from a song to a song. Making a part's loop longer repeats what it
 * plays, so nothing is heard to change until it is edited.
 * @module utils/musicUi/partEdit
 */

import { DEFAULT_KIT } from '#utils/music/catalog/kits.js';
import { DEFAULT_PRESET } from '#utils/music/catalog/presets.js';
import { partLabel } from '#utils/music/label.js';
import { SONG_LIMITS } from '#utils/music/limits.js';

/** @typedef {import('#utils/music/types.js').Song} Song */

/** Numbers of a part the mixer rows set, with their ranges. */
const MIX = {
  volume: SONG_LIMITS.volume,
  pan: SONG_LIMITS.pan,
  reverb: SONG_LIMITS.send,
  delay: SONG_LIMITS.send,
  transpose: SONG_LIMITS.transpose,
};

/**
 * @param {Song} song
 * @returns {string} An id no part of the song has: `p1`, `p2`…
 */
export function freePartId(song) {
  const taken = new Set(song.parts.map((part) => part.id));
  for (let n = 1; ; n++) if (!taken.has(`p${n}`)) return `p${n}`;
}

/**
 * Add a part at the end: an empty one-bar drum grid on the kit the song
 * already uses, or an empty synth line as long as the song (four bars at most).
 * @param {Song} song
 * @param {'drums'|'synth'} kind
 * @returns {{ song: Song, partId: string }} `partId` is '' when the song is full
 */
export function addPart(song, kind) {
  if (song.parts.length >= SONG_LIMITS.parts) return { song, partId: '' };
  const id = freePartId(song);
  const kit = song.parts.find((part) => part.kind === 'drums')?.kit || DEFAULT_KIT;
  /** @type {any} A part as written; `updateSong` fills in the rest */
  const part =
    kind === 'drums'
      ? { id, kind, kit, steps: 16, bars: 1, lanes: {} }
      : { id, kind: 'synth', preset: DEFAULT_PRESET, bars: Math.min(4, song.bars), notes: [] };
  return { song: { ...song, parts: [...song.parts, part] }, partId: id };
}

/**
 * @param {Song} song
 * @param {string} partId
 * @returns {Song}
 */
export function removePart(song, partId) {
  const parts = song.parts.filter((part) => part.id !== partId);
  return parts.length === song.parts.length ? song : { ...song, parts };
}

/**
 * Copy a part; the copy follows the original and says what it is.
 * @param {Song} song
 * @param {string} partId
 * @returns {{ song: Song, partId: string }} `partId` of the copy, '' when
 *   there is no such part or the song is full
 */
export function duplicatePart(song, partId) {
  const index = song.parts.findIndex((part) => part.id === partId);
  if (index < 0 || song.parts.length >= SONG_LIMITS.parts) return { song, partId: '' };
  const id = freePartId(song);
  const copy = structuredClone(song.parts[index]);
  const named = { ...copy, id, name: `${partLabel(copy)} copy`.slice(0, SONG_LIMITS.name) };
  const parts = [...song.parts.slice(0, index + 1), named, ...song.parts.slice(index + 1)];
  return { song: { ...song, parts }, partId: id };
}

/**
 * Move a part up or down the list.
 * @param {Song} song
 * @param {string} partId
 * @param {number} by - Places: −1 is one up
 * @returns {Song}
 */
export function movePart(song, partId, by) {
  const from = song.parts.findIndex((part) => part.id === partId);
  const to = Math.max(0, Math.min(song.parts.length - 1, from + Math.round(by)));
  if (from < 0 || to === from) return song;
  const parts = [...song.parts];
  parts.splice(to, 0, ...parts.splice(from, 1));
  return { ...song, parts };
}

/**
 * Give a part's loop another length. A longer loop repeats what the part
 * played; a shorter one keeps the start.
 * @param {Song} song
 * @param {any} part
 * @param {number} bars
 * @returns {any} The part
 */
export function resizeLoop(song, part, bars) {
  const length = Math.max(1, Math.min(SONG_LIMITS.bars[1], Math.round(bars) || 1));
  if (length === part.bars) return part;
  if (part.kind === 'drums') {
    const lanes = Object.fromEntries(
      Object.entries(part.lanes).map(([drum, lane]) => {
        const times = Math.ceil((length * part.steps) / Math.max(1, lane.length));
        return [drum, lane.repeat(Math.max(1, times)).slice(0, length * part.steps)];
      }),
    );
    return { ...part, bars: length, lanes };
  }
  const loop = part.bars * song.beatsPerBar;
  const notes = [];
  for (let at = 0; at < length * song.beatsPerBar; at += loop) {
    for (const [beat, ...rest] of part.notes) notes.push([beat + at, ...rest]);
  }
  return { ...part, bars: length, notes };
}

/**
 * A part with one of the fields every part has set: `name`, `mute`,
 * `volume`, `pan`, `reverb`, `delay`, `transpose`, `bars`.
 * @param {Song} song
 * @param {any} part
 * @param {string} name
 * @param {any} value
 * @returns {any} The same part for an unknown field or an unusable value
 */
export function withPartField(song, part, name, value) {
  if (name === 'name') return { ...part, name: String(value ?? '').slice(0, SONG_LIMITS.name) };
  if (name === 'mute') return { ...part, mute: value === true };
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) return part;
  if (name === 'bars') return resizeLoop(song, part, number);
  if (!Object.hasOwn(MIX, name)) return part;
  const inside = Math.min(MIX[name][1], Math.max(MIX[name][0], number));
  return { ...part, [name]: name === 'transpose' ? Math.round(inside) : inside };
}
