/**
 * Working state of one overlap-resolution pass (see crossfade.js): which
 * tracks are being rewritten, how their clips overlapped before the edit,
 * and which clips were cut into which pieces. Internal to the library.
 * @module utils/edl/session
 */

import { neighbourOverlaps } from './fades.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */
/** @typedef {import('./types.js').Track} Track */
/** @typedef {{ track: Track, clips: Clip[] }} Work */

/**
 * @typedef {Object} Session
 * @property {Edl} after - The raw document being settled
 * @property {Map<string, Track>} prev - Tracks of the document before the edit
 * @property {Map<string, Work>} work - Tracks being rewritten, by trackId
 * @property {Map<string, import('./fades.js').EdgeOverlap>} was - Overlaps
 *   before the edit, by clipId
 * @property {Map<string, string>} origin - Piece id → id of the clip it was cut from
 * @property {Map<string, { link: string, spans: number[][] }>} cuts - Clips
 *   that were overwritten: their link and the spans removed from them
 * @property {Set<string>} incoming - Ids of the clips the operation moved
 * @property {boolean} auto - Auto-crossfade is on
 */

/**
 * @param {Edl} before
 * @param {Edl} after
 * @param {{ incoming?: Iterable<string>, autoCrossfade?: boolean }} opts
 * @returns {Session}
 */
export function createSession(before, after, opts) {
  return {
    after,
    prev: new Map(before.tracks.map((track) => [track.trackId, track])),
    work: new Map(),
    was: new Map(),
    origin: new Map(),
    cuts: new Map(),
    incoming: new Set(opts.incoming || []),
    auto: opts.autoCrossfade !== false,
  };
}

/**
 * Id of the clip a piece came from (its own id when it was never cut).
 * @param {Session} s
 * @param {string} clipId
 * @returns {string}
 */
export function rootId(s, clipId) {
  return s.origin.get(clipId) || clipId;
}

/**
 * Start rewriting a track and remember how its clips overlapped before.
 * @param {Session} s
 * @param {Track} track
 * @returns {Work}
 */
export function load(s, track) {
  const loaded = s.work.get(track.trackId);
  if (loaded) return loaded;
  const work = { track, clips: track.clips };
  s.work.set(track.trackId, work);
  const old = s.prev.get(track.trackId);
  if (old) for (const [id, overlap] of neighbourOverlaps(old.clips)) s.was.set(id, overlap);
  return work;
}

/**
 * Record that a clip was overwritten, so its linked partner can follow.
 * @param {Session} s
 * @param {Clip} under - The clip that was cut
 * @param {Clip[]} pieces - What is left of it
 * @param {number[]} span - [start, end] that was removed
 */
export function noteCut(s, under, pieces, span) {
  const root = rootId(s, under.clipId);
  for (const piece of pieces) if (piece.clipId !== root) s.origin.set(piece.clipId, root);
  const cut = s.cuts.get(root) || { link: under.linkedClipId, spans: [] };
  cut.spans.push(span);
  s.cuts.set(root, cut);
}
