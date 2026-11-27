/**
 * Test helpers for code that edits EDL documents: compact fixtures,
 * deep-freezing (to prove an operation does not mutate its input) and a
 * validity assertion. Not part of the runtime API — import it from tests.
 * @module utils/edl/testkit
 */

import { createClip, createEdl, createTrack } from './factory.js';
import { snapToFrame } from './query.js';
import { validateEdl } from './validate.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Clip} Clip */

/**
 * A video/audio clip that plays `/media/<id>.mp4` from its start.
 * @param {string} clipId
 * @param {number} start - timelineStart
 * @param {number} end - timelineEnd
 * @param {Partial<Clip>} [overrides]
 * @returns {Clip}
 */
export function testClip(clipId, start, end, overrides = {}) {
  return createClip({
    clipId,
    sourceFile: `/media/${clipId}.mp4`,
    sourceIn: 0,
    sourceOut: end - start,
    timelineStart: start,
    timelineEnd: end,
    ...overrides,
  });
}

/**
 * A document from a map of track id → clips, in the order given (video
 * tracks are moved above audio tracks). Ids starting with "a" make audio
 * tracks, anything else video tracks; `v1` / `a1` are added when a type is
 * missing.
 * @param {Record<string, Clip[]>} [lanes] - e.g. `{ v1: [...], a1: [...] }`
 * @param {Partial<Edl>} [overrides]
 * @returns {Edl}
 */
export function testEdl(lanes = {}, overrides = {}) {
  const all = { ...lanes };
  if (!Object.keys(all).some((id) => !id.startsWith('a'))) all.v1 = [];
  if (!Object.keys(all).some((id) => id.startsWith('a'))) all.a1 = [];
  const tracks = Object.entries(all).map(([trackId, clips]) => {
    const type = trackId.startsWith('a') ? 'audio' : 'video';
    return createTrack(type, { trackId, name: trackId.toUpperCase(), clips });
  });
  tracks.sort((a, b) => Number(a.type === 'audio') - Number(b.type === 'audio'));
  return createEdl({ tracks, ...overrides });
}

/**
 * Freeze a value and everything it contains. An operation that tries to
 * mutate a frozen document throws (ES modules are strict).
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * Throw unless the document passes `validateEdl`.
 * @param {Edl} edl
 * @param {Parameters<typeof validateEdl>[1]} [opts]
 * @returns {Edl} The same document, for chaining
 */
export function assertValid(edl, opts) {
  const { valid, problems } = validateEdl(edl, opts);
  if (valid) return edl;
  const lines = problems.map((problem) => `  ${problem.path}: ${problem.message}`);
  throw new Error(`EDL is not valid:\n${lines.join('\n')}`);
}

/**
 * A compact picture of where the clips are: for each track the clips as
 * `id start-end`, e.g. `{ v1: ['a 0-5', 'b 4-8'] }`. Times are rounded to
 * milliseconds.
 * @param {Edl} edl
 * @returns {Record<string, string[]>}
 */
export function layout(edl) {
  const round = (time) => Math.round(time * 1000) / 1000;
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const track of edl.tracks) {
    out[track.trackId] = track.clips.map(
      (clip) => `${clip.clipId} ${round(clip.timelineStart)}-${round(clip.timelineEnd)}`,
    );
  }
  return out;
}

/**
 * @param {Edl} edl
 * @param {string} clipId
 * @returns {Clip|undefined}
 */
export function clipOf(edl, clipId) {
  for (const track of edl.tracks) {
    const clip = track.clips.find((c) => c.clipId === clipId);
    if (clip) return clip;
  }
  return undefined;
}

/**
 * @param {Edl} edl
 * @returns {boolean} True when every clip edge sits on the frame grid
 */
export function onFrameGrid(edl) {
  const off = (time) => Math.abs(snapToFrame(time, edl.fps) - time) > 1e-9;
  return !edl.tracks.some((track) =>
    track.clips.some((clip) => off(clip.timelineStart) || off(clip.timelineEnd)),
  );
}
