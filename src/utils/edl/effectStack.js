/**
 * Finding and rewriting the effect stack of a clip or a track — the
 * plumbing under the operations in effects.js. Isomorphic and pure.
 * @module utils/edl/effectStack
 */

import { tidyKeyframes } from './clipPaths.js';
import { changeClip, mapTracks } from './immutable.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Effect} Effect */
/** @typedef {import('./types.js').EffectTarget | string} Target */

/** @type {(target: any) => string} */
const clipIdOf = (target) => (typeof target === 'string' ? target : target?.clipId || '');

/**
 * The effect stack of a target.
 * @param {Edl} edl
 * @param {Target} target
 * @returns {Effect[]} Empty when the target does not exist
 */
export function effectsOf(edl, target) {
  const clipId = clipIdOf(target);
  for (const track of edl.tracks) {
    if (!clipId && track.trackId === /** @type {any} */ (target)?.trackId) return track.effects;
    const clip = clipId && track.clips.find((c) => c.clipId === clipId);
    if (clip) return clip.effects;
  }
  return [];
}

/**
 * Rewrite a target's stack. Keyframes of a clip that no longer address an
 * effect are dropped with it.
 * @param {Edl} edl
 * @param {Target} target
 * @param {(effects: Effect[]) => Effect[]} change - Returns the same array to change nothing
 * @returns {Edl}
 */
export function changeStack(edl, target, change) {
  /** @type {(holder: any) => any} */
  const edit = (holder) => {
    const effects = change(holder.effects);
    return effects === holder.effects ? holder : { ...holder, effects };
  };
  const clipId = clipIdOf(target);
  if (clipId) return changeClip(edl, clipId, (clip) => tidyKeyframes(edit(clip)));
  const trackId = /** @type {any} */ (target)?.trackId;
  return mapTracks(edl, (track) => (track.trackId === trackId ? edit(track) : track));
}

/**
 * Rewrite one effect of a stack.
 * @param {Edl} edl
 * @param {Target} target
 * @param {string} effectId
 * @param {(effect: Effect) => Effect} change
 * @returns {Edl}
 */
export function changeEffect(edl, target, effectId, change) {
  return changeStack(edl, target, (effects) => {
    const next = effects.map((fx) => (fx.effectId === effectId ? change(fx) : fx));
    return next.every((fx, i) => fx === effects[i]) ? effects : next;
  });
}
