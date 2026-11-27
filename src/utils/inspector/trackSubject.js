/**
 * The inspector's view of a track — shown when no clip is selected and a
 * track has the focus — and the edits its fields make: opacity, blend
 * mode and effect parameters for a video track, volume for an audio
 * track. Track settings are not keyframed. Isomorphic and pure.
 * @module utils/inspector/trackSubject
 */

import { effectsOf, updateEffect } from '#utils/edl/effects.js';
import {
  renameTrack,
  setTrackBlendMode,
  setTrackOpacity,
  setTrackVolume,
} from '#utils/edl/trackOps.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * @typedef {Object} TrackModel
 * @property {any} track
 * @property {string} trackId
 * @property {'video'|'audio'} type
 * @property {string} heading - The track's name
 * @property {string} detail - e.g. `video track · 3 clips · locked`
 * @property {number} fps
 */

/**
 * @param {Edl} edl
 * @param {string} trackId - `ViewState.activeTrackId`
 * @returns {TrackModel|null} null when there is no such track
 */
export function trackModel(edl, trackId) {
  const track = (edl?.tracks || []).find((t) => t.trackId === trackId);
  if (!track) return null;
  const count = track.clips.length;
  const facts = [`${track.type} track`, `${count} ${count === 1 ? 'clip' : 'clips'}`];
  if (track.locked) facts.push('locked');
  if (track.muted) facts.push(track.type === 'audio' ? 'muted' : 'hidden');
  return {
    track,
    trackId,
    type: track.type === 'audio' ? 'audio' : 'video',
    heading: track.name || trackId,
    detail: facts.join(' · '),
    fps: edl.fps > 0 ? edl.fps : 30,
  };
}

/**
 * The parameter patch for `effects.<effectId>.<param>[.<sub>]`: a value
 * inside a structured parameter (a point's `x`) keeps its siblings.
 * @param {Record<string, any>} params - The effect's stored parameters
 * @param {string[]} keys - `[param, sub…]`
 * @param {any} value
 * @returns {Record<string, any>}
 */
function paramPatch(params, keys, value) {
  /** @type {(node: any, depth: number) => any} */
  const assign = (node, depth) => {
    if (depth === keys.length) return value;
    const base = node && typeof node === 'object' ? node : {};
    return { ...base, [keys[depth]]: assign(base[keys[depth]], depth + 1) };
  };
  return { [keys[0]]: assign(params, 0)[keys[0]] };
}

/**
 * Apply one field change to a track.
 * @param {Edl} edl
 * @param {string} trackId
 * @param {{ name: string, value?: any }} change - `track.opacity`,
 *   `track.blendMode`, `track.volume`, `track.name` or
 *   `effects.<effectId>.<param>`
 * @returns {Edl}
 */
export function applyTrackChange(edl, trackId, { name, value }) {
  if (name === 'track.opacity') return setTrackOpacity(edl, trackId, value);
  if (name === 'track.blendMode') return setTrackBlendMode(edl, trackId, value);
  if (name === 'track.volume') return setTrackVolume(edl, trackId, value);
  if (name === 'track.name')
    return String(value ?? '').trim() ? renameTrack(edl, trackId, value) : edl;
  const parts = name.split('.');
  if (parts[0] !== 'effects' || parts.length < 3) return edl;
  const effect = effectsOf(edl, { trackId }).find((fx) => fx.effectId === parts[1]);
  if (!effect) return edl;
  const params = paramPatch(effect.params, parts.slice(2), value);
  return updateEffect(edl, { trackId }, parts[1], { params });
}
