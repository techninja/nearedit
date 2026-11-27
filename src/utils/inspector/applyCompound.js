/**
 * Inspector changes that are several fields at once: uniform scale, the
 * reset buttons, Ken Burns presets, and a generator's type, preset and
 * reset. A reset also removes the keyframes of what it resets, so the
 * values it writes are the ones that show. Isomorphic and pure.
 * @module utils/inspector/applyCompound
 */

import { setValueAt } from '#utils/edl/autoKey.js';
import { updateClip } from '#utils/edl/clipEdit.js';
import { defaultKenBurns, defaultText } from '#utils/edl/factory.js';
import { updateGenerator } from '#utils/edl/generator.js';
import { clearKeyframes } from '#utils/edl/keyframes.js';
import { findClip } from '#utils/edl/query.js';
import { kenBurnsPreset } from './kenBurns.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

const RESET_TRANSFORM = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };
const RESET_CROP = { cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0 };

/**
 * @typedef {Object} Compound
 * @property {string} probe - The field that decides which clips it applies to
 * @property {(edl: Edl, clipId: string, time: number) => Edl} apply
 */

/**
 * Write a patch and drop the keyframes of everything under `prefix`.
 * @param {string} prefix - e.g. `transform.` or `text.`
 * @param {Record<string, any>} patch
 * @param {(path: string) => boolean} [only] - Limit which keyframed paths go
 * @returns {Compound['apply']}
 */
function reset(prefix, patch, only = () => true) {
  return (edl, clipId) => {
    const keyed = Object.keys(findClip(edl, clipId)?.clip.keyframes || {});
    const cleared = keyed
      .filter((path) => path.startsWith(prefix) && only(path))
      .reduce((doc, path) => clearKeyframes(doc, clipId, path), edl);
    return updateClip(cleared, clipId, patch);
  };
}

/**
 * Replace a generator's parameters: everything stored goes back to its
 * default, then `preset` is applied. Parameter keyframes go too.
 * @param {{ params?: Record<string, any>, seed?: number }} preset
 * @returns {Compound['apply']}
 */
function generatorLook(preset) {
  return (edl, clipId) => {
    const clip = findClip(edl, clipId)?.clip;
    if (!clip) return edl;
    const wipe = Object.fromEntries(Object.keys(clip.generator.params).map((key) => [key, null]));
    const cleared = Object.keys(clip.keyframes)
      .filter((path) => path.startsWith('generator.params.'))
      .reduce((doc, path) => clearKeyframes(doc, clipId, path), edl);
    const patch = { params: { ...wipe, ...(preset?.params || {}) }, seed: preset?.seed };
    return updateGenerator(cleared, clipId, patch);
  };
}

/**
 * The compound a change name stands for.
 * @param {{ name: string, value?: any }} change
 * @param {Edl} edl
 * @returns {Compound|null} null for an ordinary single-field change
 */
export function compound({ name, value }, edl) {
  if (name === 'transform.scale') {
    return {
      probe: 'transform.x',
      apply: (doc, id, time) =>
        setValueAt(
          setValueAt(doc, id, 'transform.scaleX', value, time),
          id,
          'transform.scaleY',
          value,
          time,
        ),
    };
  }
  const main = (/** @type {string} */ path) => !/crop|kenBurns/.test(path);
  if (name === 'reset.transform')
    return {
      probe: 'transform.x',
      apply: reset('transform.', { transform: RESET_TRANSFORM }, main),
    };
  if (name === 'reset.crop') {
    const crops = (/** @type {string} */ path) => /^transform\.crop/.test(path);
    return {
      probe: 'transform.fit',
      apply: reset('transform.', { transform: RESET_CROP }, crops),
    };
  }
  if (name === 'reset.kenBurns') {
    const patch = { transform: { kenBurns: defaultKenBurns() } };
    return { probe: 'transform.fit', apply: reset('transform.kenBurns.', patch) };
  }
  if (name === 'kenBurns.preset') {
    const kenBurns = kenBurnsPreset(value, edl.resolution);
    const patch = { transform: { kenBurns } };
    return kenBurns
      ? { probe: 'transform.fit', apply: (doc, id) => updateClip(doc, id, patch) }
      : null;
  }
  if (name === 'reset.text') {
    const style = { ...defaultText() };
    delete style.content;
    return { probe: 'text.content', apply: reset('text.', { text: style }) };
  }
  if (name === 'generator.type') {
    const apply = (/** @type {Edl} */ doc, /** @type {string} */ id) =>
      updateGenerator(doc, id, { type: String(value || '') || undefined });
    return { probe: 'generator.seed', apply };
  }
  if (name === 'generator.preset' || name === 'reset.generator') {
    return {
      probe: 'generator.seed',
      apply: generatorLook(name === 'reset.generator' ? {} : value),
    };
  }
  return null;
}
