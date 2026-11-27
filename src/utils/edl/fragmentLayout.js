/**
 * Track layout for a `replace` DirectorResult. Replacing the whole timeline
 * means the result also decides what the tracks are: which existing track
 * each fragment row lands on, what the rows are called, and which tracks
 * have to be created. Isomorphic and pure.
 * @module utils/edl/fragmentLayout
 */

import { createTrack } from './factory.js';
import { isObject, toNumber } from './sanitize.js';

/** @typedef {import('./types.js').Edl} Edl */

/**
 * Lay out the tracks of one type so that row N of the result is the Nth
 * track. A row keeps the existing track it names by `trackId` (so mute,
 * solo, volume and lock travel with it); other rows take the remaining
 * tracks in order, and any still missing are created. Tracks the result
 * does not mention stay, after the rows it does.
 * @param {any[]} existing - Document tracks of this type, in order
 * @param {{ row: number, trackId: string, name: string }[]} parts - Result rows of this type
 * @param {'video'|'audio'} type
 * @returns {any[]}
 */
function layoutType(existing, parts, type) {
  if (!parts.length) return existing;
  const rows = Math.max(...parts.map((part) => part.row)) + 1;
  /** @type {any[]} */
  const slots = new Array(rows).fill(null);
  const used = new Set();
  for (const part of parts) {
    const match = existing.find((t) => t.trackId === part.trackId && !used.has(t.trackId));
    if (!match || slots[part.row]) continue;
    slots[part.row] = match;
    used.add(match.trackId);
  }
  for (let row = 0; row < rows; row++) {
    if (slots[row]) continue;
    const spare = existing.find((t) => !used.has(t.trackId));
    const label = `${type === 'audio' ? 'Audio' : 'Video'} ${row + 1}`;
    slots[row] = spare || createTrack(type, { name: label });
    used.add(slots[row].trackId);
  }
  for (const part of parts) {
    const track = slots[part.row];
    if (part.name && !track.locked && track.name !== part.name) {
      slots[part.row] = { ...track, name: part.name };
    }
  }
  return [...slots, ...existing.filter((t) => !used.has(t.trackId))];
}

/**
 * Arrange the document's tracks to match a `replace` result.
 * @param {Edl} edl
 * @param {any} result - DirectorResult
 * @returns {Edl}
 */
export function adoptLayout(edl, result) {
  const counts = { video: 0, audio: 0 };
  /** @type {Record<'video'|'audio', { row: number, trackId: string, name: string }[]>} */
  const parts = { video: [], audio: [] };
  for (const raw of Array.isArray(result?.tracks) ? result.tracks.filter(isObject) : []) {
    /** @type {'video'|'audio'} */
    const type = raw.type === 'audio' ? 'audio' : 'video';
    const row = Math.max(0, Math.floor(toNumber(raw.index, counts[type])));
    counts[type]++;
    parts[type].push({
      row,
      trackId: typeof raw.trackId === 'string' ? raw.trackId : '',
      name: typeof raw.name === 'string' ? raw.name : '',
    });
  }
  const video = layoutType(
    edl.tracks.filter((t) => t.type !== 'audio'),
    parts.video,
    'video',
  );
  const audio = layoutType(
    edl.tracks.filter((t) => t.type === 'audio'),
    parts.audio,
    'audio',
  );
  const tracks = [...video, ...audio];
  const same = tracks.length === edl.tracks.length && tracks.every((t, i) => t === edl.tracks[i]);
  return same ? edl : { ...edl, tracks };
}
