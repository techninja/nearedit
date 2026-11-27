/**
 * Effect operations on the stack of a clip or of a track: add, remove,
 * reorder, enable / disable, change parameters. A target is `{ clipId }`
 * or `{ trackId }` (a bare string is a clip id). Effect types are names
 * from the catalog (src/utils/compose/catalog.js) — this library only
 * stores them. A clip on a locked track cannot be changed; a linked
 * partner is never touched (effects belong to one clip). Isomorphic and
 * pure.
 * @module utils/edl/effects
 */

import { EFFECT_ID, MAX_EFFECTS, isTypeName } from './effectList.js';
import { changeEffect, changeStack, effectsOf } from './effectStack.js';
import { newId } from './factory.js';
import { cleanBag, mergeBag } from './jsonBag.js';
import { clamp } from './time.js';

export { effectsOf };

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Effect} Effect */
/** @typedef {import('./effectStack.js').Target} Target */

/** @type {(effectId: string) => (effect: Effect) => boolean} */
const sameId = (effectId) => (effect) => effect.effectId === effectId;

/**
 * Add an effect. It gets a fresh `effectId` — pass `opts.effectId` (e.g.
 * `newId('fx')`) to know it beforehand; an id that is malformed or taken
 * in that stack is replaced.
 * @param {Edl} edl
 * @param {Target} target
 * @param {string} type - Catalog name, e.g. `blur`
 * @param {{ params?: Record<string, any>, enabled?: boolean, index?: number,
 *   effectId?: string }} [opts] - `index`: position in the stack (default: last)
 * @returns {Edl}
 */
export function addEffect(edl, target, type, opts = {}) {
  if (!isTypeName(type)) return edl;
  return changeStack(edl, target, (effects) => {
    if (effects.length >= MAX_EFFECTS) return effects;
    const free = EFFECT_ID.test(opts.effectId || '') && !effects.some(sameId(opts.effectId));
    const effectId = free ? opts.effectId : newId('fx');
    const effect = {
      effectId,
      type,
      enabled: opts.enabled !== false,
      params: cleanBag(opts.params),
    };
    const at = Number.isFinite(opts.index)
      ? clamp(Math.round(opts.index), 0, effects.length)
      : effects.length;
    return [...effects.slice(0, at), effect, ...effects.slice(at)];
  });
}

/**
 * Remove an effect. On a clip, the keyframes of its parameters go with it.
 * @param {Edl} edl
 * @param {Target} target
 * @param {string} effectId
 * @returns {Edl}
 */
export function removeEffect(edl, target, effectId) {
  return changeStack(edl, target, (effects) =>
    effects.some(sameId(effectId)) ? effects.filter((fx) => fx.effectId !== effectId) : effects,
  );
}

/**
 * Move an effect to another position in its stack (effects apply in order).
 * @param {Edl} edl
 * @param {Target} target
 * @param {string} effectId
 * @param {number} toIndex - 0 = applied first
 * @returns {Edl}
 */
export function moveEffect(edl, target, effectId, toIndex) {
  return changeStack(edl, target, (effects) => {
    const from = effects.findIndex(sameId(effectId));
    if (from < 0 || !Number.isFinite(toIndex)) return effects;
    const rest = effects.filter((_, i) => i !== from);
    const to = clamp(Math.round(toIndex), 0, rest.length);
    return to === from ? effects : [...rest.slice(0, to), effects[from], ...rest.slice(to)];
  });
}

/**
 * Change an effect: merge `params` key by key (a `null` removes a
 * parameter, so its catalog default applies again), set `enabled`, or
 * switch its `type` keeping the id.
 * @param {Edl} edl
 * @param {Target} target
 * @param {string} effectId
 * @param {{ params?: Record<string, any>, enabled?: boolean, type?: string }} patch
 * @returns {Edl}
 */
export function updateEffect(edl, target, effectId, patch) {
  return changeEffect(edl, target, effectId, (fx) => {
    const params = mergeBag(fx.params, patch?.params);
    const enabled = typeof patch?.enabled === 'boolean' ? patch.enabled : fx.enabled;
    const type = isTypeName(patch?.type) ? patch.type : fx.type;
    const same = params === fx.params && enabled === fx.enabled && type === fx.type;
    return same ? fx : { ...fx, type, enabled, params };
  });
}

/**
 * Switch an effect on or off without losing its settings.
 * @param {Edl} edl
 * @param {Target} target
 * @param {string} effectId
 * @param {boolean} [enabled] - Default: the opposite of what it is
 * @returns {Edl}
 */
export function setEffectEnabled(edl, target, effectId, enabled) {
  const now = effectsOf(edl, target).find(sameId(effectId));
  return now ? updateEffect(edl, target, effectId, { enabled: enabled ?? !now.enabled }) : edl;
}
