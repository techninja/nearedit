/**
 * Checks behind `validateEdl` for the free-form parts of schema v3:
 * parameter bags, effect stacks, generators and keyframes. They accept
 * exactly what the normaliser produces. Isomorphic and pure.
 * @module utils/edl/validateExtras
 */

import { describePath, keyValue } from './clipPaths.js';
import { EASINGS } from './easing.js';
import { EFFECT_ID, MAX_EFFECTS, isTypeName } from './effectList.js';
import { MAX_DEPTH, MAX_NODES, MAX_STRING, isPlainObject, isSafeKey } from './jsonBag.js';
import { MAX_KEYS, MAX_PATHS, SAME_T } from './keyList.js';
import { RANGES } from './sanitize.js';

/** @typedef {(path: string, message: string) => void} Report */

/**
 * @param {any} value
 * @param {number} depth
 * @param {{ left: number }} budget
 * @returns {boolean} True when `cleanBag` would keep the value as it is
 */
function sound(value, depth, budget) {
  if (--budget.left < 0) return false;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= MAX_STRING;
  if (depth >= MAX_DEPTH) return false;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) if (!sound(value[i], depth + 1, budget)) return false;
    return true;
  }
  if (!isPlainObject(value)) return false;
  return Object.keys(value).every((key) => isSafeKey(key) && sound(value[key], depth + 1, budget));
}

/**
 * A parameter bag must be bounded, JSON-safe data (jsonBag.js).
 * @param {any} bag
 * @param {string} path
 * @param {Report} report
 */
export function checkBag(bag, path, report) {
  if (!isPlainObject(bag)) return report(path, 'must be an object');
  if (!sound(bag, 0, { left: MAX_NODES + 1 })) {
    report(path, 'must hold only finite numbers, strings, booleans, objects and arrays');
  }
}

/**
 * @param {any} effects
 * @param {string} path
 * @param {Report} report
 */
export function checkEffects(effects, path, report) {
  if (!Array.isArray(effects)) return report(path, 'must be an array');
  if (effects.length > MAX_EFFECTS) report(path, `holds more than ${MAX_EFFECTS} effects`);
  const ids = new Set();
  effects.slice(0, MAX_EFFECTS).forEach((fx, i) => {
    const at = `${path}[${i}]`;
    if (!isPlainObject(fx)) return report(at, 'must be an object');
    if (typeof fx.effectId !== 'string' || !EFFECT_ID.test(fx.effectId)) {
      report(`${at}.effectId`, 'must be letters, digits, _ or -');
    } else if (ids.has(fx.effectId)) report(`${at}.effectId`, 'is not unique in its stack');
    ids.add(fx.effectId);
    if (!isTypeName(fx.type)) report(`${at}.type`, 'is required');
    if (typeof fx.enabled !== 'boolean') report(`${at}.enabled`, 'must be a boolean');
    checkBag(fx.params, `${at}.params`, report);
  });
}

/**
 * @param {any} generator
 * @param {string} path
 * @param {Report} report
 */
export function checkGenerator(generator, path, report) {
  if (!isPlainObject(generator)) return report(path, 'must be an object');
  if (generator.type !== '' && !isTypeName(generator.type)) {
    report(`${path}.type`, 'must be a string');
  }
  const [min, max] = RANGES.seed;
  if (!(generator.seed >= min && generator.seed <= max)) {
    report(`${path}.seed`, `must be a number ${min}..${max}`);
  }
  checkBag(generator.params, `${path}.params`, report);
}

/**
 * Keyframes: every path addresses an animatable property of the clip, and
 * its keys are complete, suit the property and are strictly ordered by `t`.
 * @param {any} clip
 * @param {string} path - Path of the clip
 * @param {Report} report
 */
export function checkKeyframes(clip, path, report) {
  const map = clip.keyframes;
  if (!isPlainObject(map)) return report(`${path}.keyframes`, 'must be an object');
  const paths = Object.keys(map);
  if (paths.length > MAX_PATHS) report(`${path}.keyframes`, `animates more than ${MAX_PATHS}`);
  for (const name of paths.slice(0, MAX_PATHS)) {
    const at = `${path}.keyframes[${name}]`;
    const keys = map[name];
    const info = describePath(clip, name);
    if (!info) report(at, 'addresses nothing that can be animated');
    if (!Array.isArray(keys) || !keys.length || keys.length > MAX_KEYS) {
      report(at, `must be a list of 1..${MAX_KEYS} keys`);
      continue;
    }
    keys.forEach((key, i) => {
      if (!isPlainObject(key) || !Number.isFinite(key.t)) return report(`${at}[${i}].t`, 'no time');
      if (info && keyValue(info, key.v) !== key.v) report(`${at}[${i}].v`, 'unusable value');
      if (!EASINGS.includes(key.ease)) report(`${at}[${i}].ease`, 'unknown easing');
      if (i && !(key.t - keys[i - 1]?.t > SAME_T)) report(`${at}[${i}].t`, 'keys must be sorted');
    });
  }
}
