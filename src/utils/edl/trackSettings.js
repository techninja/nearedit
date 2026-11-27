/**
 * Track header settings: name, mute / solo / lock, volume, and for video
 * tracks the opacity and blend mode the whole track is composited with.
 * A locked track protects its clips, not its header — these all work on a
 * locked track. Isomorphic and pure.
 * @module utils/edl/trackSettings
 */

import { BLEND_MODES } from './defaults.js';
import { mergeEffects } from './effectList.js';
import { mapTracks } from './immutable.js';
import { clamp } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */

/**
 * @typedef {Object} TrackPatch
 * @property {string} [name]
 * @property {boolean} [muted]
 * @property {boolean} [solo]
 * @property {boolean} [locked]
 * @property {number} [volume] - Linear gain, clamped to 0..2
 * @property {number} [opacity] - Clamped to 0..1
 * @property {string} [blendMode] - One of `BLEND_MODES`
 * @property {any[]} [effects] - Replaces the track's effect stack (cleaned
 *   like any stack; for single changes use the operations in effects.js)
 */

/**
 * Change track header fields. Type, id and clips cannot be changed here;
 * values of the wrong type and unknown blend modes are ignored.
 * @param {Edl} edl
 * @param {string} trackId
 * @param {TrackPatch} patch
 * @returns {Edl}
 */
export function updateTrack(edl, trackId, patch) {
  return mapTracks(edl, (track) => {
    if (track.trackId !== trackId || !patch) return track;
    const next = { ...track };
    if (typeof patch.name === 'string') next.name = patch.name;
    for (const flag of ['muted', 'solo', 'locked']) {
      if (typeof patch[flag] === 'boolean') next[flag] = patch[flag];
    }
    if (Number.isFinite(patch.volume)) next.volume = clamp(patch.volume, 0, 2);
    if (Number.isFinite(patch.opacity)) next.opacity = clamp(patch.opacity, 0, 1);
    if (BLEND_MODES.includes(patch.blendMode)) next.blendMode = patch.blendMode;
    if (patch.effects) next.effects = mergeEffects(track.effects, patch.effects);
    return Object.keys(next).every((key) => next[key] === track[key]) ? track : next;
  });
}

/**
 * @param {Edl} edl
 * @param {string} trackId
 * @param {'muted'|'solo'|'locked'} flag
 * @returns {Edl}
 */
function toggle(edl, trackId, flag) {
  const track = edl.tracks.find((t) => t.trackId === trackId);
  return track ? updateTrack(edl, trackId, { [flag]: !track[flag] }) : edl;
}

/**
 * @param {Edl} edl
 * @param {string} trackId
 * @param {string} name
 * @returns {Edl}
 */
export const renameTrack = (edl, trackId, name) => updateTrack(edl, trackId, { name });

/**
 * @param {Edl} edl
 * @param {string} trackId
 * @param {number} volume - Linear gain, clamped to 0..2
 * @returns {Edl}
 */
export const setTrackVolume = (edl, trackId, volume) => updateTrack(edl, trackId, { volume });

/**
 * Opacity the whole track is composited with (video tracks).
 * @param {Edl} edl
 * @param {string} trackId
 * @param {number} opacity - Clamped to 0..1
 * @returns {Edl}
 */
export const setTrackOpacity = (edl, trackId, opacity) => updateTrack(edl, trackId, { opacity });

/**
 * How the whole track combines with the tracks under it (video tracks).
 * @param {Edl} edl
 * @param {string} trackId
 * @param {string} blendMode - One of `BLEND_MODES`
 * @returns {Edl}
 */
export const setTrackBlendMode = (edl, trackId, blendMode) =>
  updateTrack(edl, trackId, { blendMode });

/**
 * @param {Edl} edl
 * @param {string} trackId
 * @returns {Edl}
 */
export const toggleTrackMute = (edl, trackId) => toggle(edl, trackId, 'muted');

/**
 * @param {Edl} edl
 * @param {string} trackId
 * @returns {Edl}
 */
export const toggleTrackSolo = (edl, trackId) => toggle(edl, trackId, 'solo');

/**
 * @param {Edl} edl
 * @param {string} trackId
 * @returns {Edl}
 */
export const toggleTrackLock = (edl, trackId) => toggle(edl, trackId, 'locked');
