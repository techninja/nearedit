/**
 * What the effect stack's buttons do to the document. A stack belongs to
 * one or more clips or to a track; adding goes to every clip named, the
 * actions on one effect to the stack that has it. Isomorphic and pure.
 * @module utils/inspector/effectActions
 */

import {
  addEffect,
  effectsOf,
  moveEffect,
  removeEffect,
  setEffectEnabled,
  updateEffect,
} from '#utils/edl/effects.js';
import { clearKeyframes } from '#utils/edl/keyframes.js';
import { findClip } from '#utils/edl/query.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/** @typedef {{ clipIds: string[] } | { trackId: string }} StackTarget */

/**
 * @typedef {Object} EffectAction
 * @property {'add'|'chain'|'remove'|'toggle'|'move'|'reset'|'bypass'} action
 * @property {string} [type] - add: catalog type
 * @property {Record<string, any>} [params] - add: starting parameters
 * @property {{ type: string, params?: Record<string, any> }[]} [effects] -
 *   chain: several effects to add in order (a preset)
 * @property {string} [effectId] - remove, toggle, move, reset
 * @property {number} [toIndex] - move
 */

/**
 * The single stacks a target stands for.
 * @param {StackTarget} target
 * @returns {({ clipId: string } | { trackId: string })[]}
 */
function stacksOf(target) {
  if ('trackId' in target) return target.trackId ? [{ trackId: target.trackId }] : [];
  return (target.clipIds || []).map((clipId) => ({ clipId }));
}

/**
 * Put an effect's parameters back to their defaults; on a clip the
 * keyframes of those parameters go too.
 * @param {Edl} edl
 * @param {any} stack
 * @param {string} effectId
 * @returns {Edl}
 */
function resetEffect(edl, stack, effectId) {
  const effect = effectsOf(edl, stack).find((fx) => fx.effectId === effectId);
  if (!effect) return edl;
  const wipe = Object.fromEntries(Object.keys(effect.params).map((key) => [key, null]));
  const keyed = stack.clipId ? Object.keys(findClip(edl, stack.clipId)?.clip.keyframes || {}) : [];
  const cleared = keyed
    .filter((path) => path.startsWith(`effects.${effectId}.`))
    .reduce((doc, path) => clearKeyframes(doc, stack.clipId, path), edl);
  return updateEffect(cleared, stack, effectId, { params: wipe });
}

/**
 * Switch a whole stack off, or back on when nothing in it is on.
 * @param {Edl} edl
 * @param {any} stack
 * @param {boolean} enabled
 * @returns {Edl}
 */
function setAll(edl, stack, enabled) {
  return effectsOf(edl, stack).reduce(
    (doc, fx) => setEffectEnabled(doc, stack, fx.effectId, enabled),
    edl,
  );
}

/**
 * @param {Edl} edl
 * @param {StackTarget} target
 * @returns {boolean} True when any effect of the target is switched on
 */
export function anyEnabled(edl, target) {
  return stacksOf(target).some((stack) => effectsOf(edl, stack).some((fx) => fx.enabled));
}

/**
 * Apply one effect-stack action.
 * @param {Edl} edl
 * @param {StackTarget} target
 * @param {EffectAction} action
 * @returns {Edl} The same document when the action changes nothing
 */
export function applyEffectAction(edl, target, action) {
  const stacks = stacksOf(target);
  const { effectId } = action;
  const on = action.action === 'bypass' && !anyEnabled(edl, target);
  return stacks.reduce((doc, stack) => {
    switch (action.action) {
      case 'add':
        return addEffect(doc, stack, action.type, { params: action.params });
      case 'chain':
        return (action.effects || []).reduce(
          (next, fx) => addEffect(next, stack, fx.type, { params: fx.params }),
          doc,
        );
      case 'remove':
        return removeEffect(doc, stack, effectId);
      case 'toggle':
        return setEffectEnabled(doc, stack, effectId);
      case 'move':
        return moveEffect(doc, stack, effectId, action.toIndex);
      case 'reset':
        return resetEffect(doc, stack, effectId);
      case 'bypass':
        return setAll(doc, stack, on);
      default:
        return doc;
    }
  }, edl);
}
