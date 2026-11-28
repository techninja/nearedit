/**
 * Changes to how a synth part sounds: its preset, and the parameters that
 * differ from it. A part stores only what differs, so resetting a
 * parameter is forgetting it. Also what the Sound panel shows: the presets
 * by category and the controls of `SYNTH_PARAMS` in their groups. Pure.
 * @module utils/musicUi/soundEdit
 */

import { PRESETS, PRESET_CATEGORIES } from '#utils/music/catalog/presets.js';
import { SYNTH_PARAMS } from '#utils/music/catalog/synthParams.js';
import { paramValue, partParams, presetParams } from '#utils/music/params.js';
import { paramControls } from '#utils/inspector/paramControls.js';
import { paramSections } from '#utils/inspector/paramSections.js';

const CATEGORY_LABELS = { bass: 'Bass', keys: 'Keys', pad: 'Pads', lead: 'Leads' };

/**
 * @returns {{ label: string, presets: { name: string, label: string, description: string }[] }[]}
 *   The presets, grouped as a menu shows them
 */
export function presetGroups() {
  return PRESET_CATEGORIES.map((category) => ({
    label: CATEGORY_LABELS[category] || category,
    presets: Object.values(PRESETS)
      .filter((preset) => preset.category === category)
      .map(({ name, label, description }) => ({ name, label, description })),
  }));
}

/**
 * Choose another preset. The part's own parameter changes are dropped:
 * they were changes to the old preset.
 * @param {any} part - A synth part
 * @param {string} preset
 * @returns {any}
 */
export function setPreset(part, preset) {
  if (!Object.hasOwn(PRESETS, preset) || (preset === part.preset && !hasOwnParams(part)))
    return part;
  return { ...part, preset, params: {} };
}

/**
 * @param {any} part
 * @returns {boolean} True when the part changes a parameter of its preset
 */
export function hasOwnParams(part) {
  return Object.keys(part?.params || {}).length > 0;
}

/**
 * Set one parameter of a synth part. A value that is what the preset has
 * is not stored.
 * @param {any} part
 * @param {string} name - A parameter of `SYNTH_PARAMS`
 * @param {any} value
 * @returns {any} The same part for an unknown parameter
 */
export function setParam(part, name, value) {
  if (!Object.hasOwn(SYNTH_PARAMS, name)) return part;
  const base = presetParams(part.preset)[name];
  const next = paramValue(name, value, base);
  const params = { ...part.params };
  if (next === base) delete params[name];
  else params[name] = next;
  return { ...part, params };
}

/**
 * Forget the part's own value of one parameter, or of all of them.
 * @param {any} part
 * @param {string} [name] - Left out: every parameter
 * @returns {any}
 */
export function resetParams(part, name) {
  if (!hasOwnParams(part)) return part;
  if (name === undefined) return { ...part, params: {} };
  if (!Object.hasOwn(part.params, name)) return part;
  const params = { ...part.params };
  delete params[name];
  return { ...part, params };
}

/**
 * The controls of a synth part, in the groups the schema names, each with
 * the value the engine plays.
 * @param {any} part
 * @returns {import('#utils/inspector/paramSections.js').ParamSection[]} A
 *   section's `changed` counts the parameters the part sets itself
 */
export function soundSections(part) {
  const controls = paramControls(SYNTH_PARAMS, partParams(part), 'params');
  return paramSections(controls, part.params || {}, SYNTH_PARAMS);
}
