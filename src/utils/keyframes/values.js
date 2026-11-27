/**
 * The value a property has at a moment, as a keyframe needs it: the
 * animated value when it is keyframed, the stored value otherwise, and for
 * a generator or effect parameter that is not stored the default of its
 * catalog schema. Pure and isomorphic.
 * @module utils/keyframes/values
 */

import { effectModule, generatorModule } from '#utils/compose/catalog.js';
import { getPath, resolveClip } from '#utils/edl/animate.js';

/**
 * The catalog default behind a parameter path, e.g.
 * `generator.params.center.x` → the `x` of the default of `center`.
 * @param {any} clip
 * @param {string} path
 * @returns {any} undefined when the path is not a catalog parameter
 */
export function defaultValue(clip, path) {
  const parts = path.split('.');
  /** @type {Record<string, any>|undefined} */
  let schema;
  if (parts[0] === 'generator' && parts[1] === 'params') {
    schema = generatorModule(clip.generator?.type)?.params;
  } else if (parts[0] === 'effects') {
    const effect = (clip.effects || []).find((fx) => fx.effectId === parts[1]);
    schema = effectModule(effect?.type)?.params;
  }
  const [name, ...inner] = parts.slice(2);
  if (!schema || !name || !Object.hasOwn(schema, name)) return undefined;
  return inner.reduce((value, key) => value?.[key], schema[name].default);
}

/**
 * @param {any} clip - As stored
 * @param {string} path
 * @param {number} time - Timeline seconds
 * @returns {any} undefined when the property has no value at all
 */
export function currentValue(clip, path, time) {
  const value = getPath(resolveClip(clip, time), path);
  return value === undefined || value === null ? defaultValue(clip, path) : value;
}
