/**
 * What loading changed. `normalizeEdl` turns anything into a valid document
 * without complaint — right for an editor, unhelpful for someone writing a
 * document by hand, whose typo silently becomes a default. This compares
 * what was written with what was read and says where they differ. Pure.
 * @module bin/lib/repairs
 */

/** @typedef {{ path: string, message: string, level: 'error'|'warning' }} Finding */

/**
 * Top-level keys that are not compared field by field: the tracks (paired
 * below), and what the editor saves beside the document — where its
 * playhead, cursor and view were (EDL.md § Versions, loading and saving).
 */
const APART = new Set([
  'tracks',
  'project',
  'playheadPosition',
  'cursorPosition',
  'zoom',
  'scrollX',
]);

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const show = (value) => JSON.stringify(value);
const same = (a, b) =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : a === b;

/**
 * Compare a written value with the value that was read.
 * @param {any} raw
 * @param {any} read
 * @param {string} path
 * @param {Finding[]} out
 */
function compare(raw, read, path, out) {
  const note = (message) => void out.push({ path, message, level: 'warning' });
  if (read === undefined) return note('is not a field of the document and was ignored');
  if (isObject(raw) && isObject(read)) {
    for (const key of Object.keys(raw)) compare(raw[key], read[key], `${path}.${key}`, out);
  } else if (Array.isArray(raw) && Array.isArray(read)) {
    if (raw.length !== read.length)
      return note(`has ${raw.length} entries, ${read.length} were usable`);
    raw.forEach((item, i) => compare(item, read[i], `${path}[${i}]`, out));
  } else if (!same(raw, read)) {
    note(`${show(raw)} was read as ${show(read)}`);
  }
}

/**
 * Pair written clips with the clips that were read: by id where the written
 * clip has one, otherwise by start time — first those that did not move,
 * then whatever is nearest. A clip without a usable start pairs with nothing.
 * @param {any[]} written
 * @param {any[]} read
 * @returns {Map<number, any>} Read clip by index of the written one
 */
function pairClips(written, read) {
  const free = new Set(read);
  const pairs = new Map();
  const take = (index, match) => {
    if (!match) return;
    pairs.set(index, match);
    free.delete(match);
  };
  const startOf = (clip) => (isObject(clip) ? Number(clip.timelineStart) : NaN);
  written.forEach((clip, i) => {
    if (clip?.clipId)
      take(
        i,
        [...free].find((item) => item.clipId === clip.clipId),
      );
  });
  for (const reach of [0.05, Infinity]) {
    written.forEach((clip, i) => {
      const start = startOf(clip);
      if (pairs.has(i) || !Number.isFinite(start)) return;
      const near = [...free].sort(
        (a, b) => Math.abs(a.timelineStart - start) - Math.abs(b.timelineStart - start),
      )[0];
      if (near && Math.abs(near.timelineStart - start) <= reach) take(i, near);
    });
  }
  return pairs;
}

/**
 * Where the document that was read differs from the one that was written.
 * A clip or track that could not be used at all is an error: the document
 * then does not say what its author meant.
 * @param {any} raw - The parsed file
 * @param {{ tracks: any[] }} edl - `normalizeEdl(raw)`
 * @returns {Finding[]}
 */
export function repairFindings(raw, edl) {
  /** @type {Finding[]} */
  const out = [];
  const dropped = (path, hint) =>
    void out.push({ path, level: 'error', message: `could not be used and was dropped${hint}` });
  const doc = Array.isArray(raw) ? { tracks: raw } : raw;
  for (const key of Object.keys(doc)) {
    if (!APART.has(key)) compare(doc[key], edl[key], key, out);
  }
  const taken = new Set();
  (Array.isArray(doc.tracks) ? doc.tracks : []).forEach((track, t) => {
    const path = `tracks[${t}]`;
    const wanted = (item) =>
      !taken.has(item) && (item.type === 'audio') === (track?.type === 'audio');
    const read = isObject(track)
      ? edl.tracks.find(
          (item) => wanted(item) && (!track.trackId || item.trackId === track.trackId),
        )
      : undefined;
    if (!read) return dropped(path, ' (a track is an object with a "clips" array)');
    taken.add(read);
    const { clips, ...fields } = track;
    const { clips: readClips, ...readFields } = read;
    compare(fields, readFields, path, out);
    const written = Array.isArray(clips) ? clips : [];
    const pairs = pairClips(written, readClips);
    written.forEach((clip, c) => {
      const at = `${path}.clips[${c}]`;
      if (pairs.has(c)) compare(clip, pairs.get(c), at, out);
      else dropped(at, ' (a clip needs "timelineStart" and a later "timelineEnd")');
    });
  });
  return out;
}
