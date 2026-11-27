/**
 * From a parameter schema to inspector controls. A generator or an effect
 * describes its parameters (docs/app-spec/COMPOSITOR.md § Module
 * contracts); this turns that description, plus the values in force, into
 * the list of controls to show: which kind, with what label, range and
 * step, which are hidden by a `when` hint, and which paths a keyframe
 * button drives. Nothing here knows any particular generator or effect.
 * Pure and isomorphic.
 * @module utils/inspector/paramControls
 */

import { resolveParams } from '#utils/compose/params.js';
import { humanize } from '#utils/keyframes/labels.js';

/** @typedef {import('#utils/compose/params.js').ParamSpec} ParamSpec */
/** @typedef {import('./numberField.js').NumberSpec} NumberSpec */

/**
 * @typedef {Object} ParamControl
 * @property {string} name - Parameter name in the schema
 * @property {string} path - Field path the control edits, `<prefix>.<name>`
 * @property {'number'|'color'|'boolean'|'select'|'text'|'image'|'point'} type
 * @property {string} label
 * @property {any} value - The value in force (stored, animated or default)
 * @property {boolean} animatable
 * @property {string[]} keyPaths - Paths a keyframe button drives; a point has two
 * @property {NumberSpec} [spec] - number, and each half of a point
 * @property {boolean} [slider] - number: the range is small enough for a slider
 * @property {[string, string][]} [options] - select: `[value, label]`
 */

/** A slider with more positions than this is too coarse to be of use. */
const MAX_SLIDER_STEPS = 2000;

/** Points are fractions of the frame, shown as percentages. */
const POINT_SPEC = { step: 0.005, scale: 100, decimals: 1, unit: '%' };

/**
 * @param {number} step
 * @returns {number} Decimals needed to show a multiple of the step
 */
function decimalsOf(step) {
  const text = String(step);
  if (text.includes('e-')) return Number(text.split('e-')[1]);
  return text.includes('.') ? text.split('.')[1].length : 0;
}

/**
 * The value box spec of a number parameter. Without a step one is chosen
 * from the range, so that a 0..1 amount moves in hundredths and a pixel
 * length in whole pixels.
 * @param {ParamSpec} param
 * @returns {NumberSpec}
 */
export function numberSpec(param) {
  const span = Number.isFinite(param.min) && Number.isFinite(param.max) ? param.max - param.min : 0;
  const fallback = span > 0 && span <= 4 ? 0.01 : span > 0 && span <= 20 ? 0.1 : 1;
  const step = param.step > 0 ? param.step : fallback;
  /** @type {NumberSpec} */
  const spec = { step, decimals: Math.min(4, decimalsOf(step) + 1) };
  if (Number.isFinite(param.min)) spec.min = param.min;
  if (Number.isFinite(param.max)) spec.max = param.max;
  if (param.unit) spec.unit = param.unit;
  return spec;
}

/**
 * @param {NumberSpec} spec
 * @returns {boolean} True when a slider covers the range usefully
 */
export function wantsSlider(spec) {
  if (!Number.isFinite(spec.min) || !Number.isFinite(spec.max)) return false;
  return (spec.max - spec.min) / (spec.step || 1) <= MAX_SLIDER_STEPS;
}

/**
 * Whether a `when` hint lets a control show: every parameter it names must
 * have one of the listed values.
 * @param {Record<string, any>|undefined} when - `{ otherParam: [values] }`
 * @param {Record<string, any>} values - Values in force
 * @returns {boolean}
 */
export function isShown(when, values) {
  if (!when || typeof when !== 'object') return true;
  return Object.entries(when).every(([name, allowed]) =>
    [allowed].flat().some((want) => want === values[name] || String(want) === String(values[name])),
  );
}

/**
 * The controls of a schema, in schema order, without those a `when` hides.
 * @param {Record<string, ParamSpec>|undefined} schema
 * @param {Record<string, any>|undefined} stored - Parameters as the clip
 *   holds them at this moment (keyframes applied); missing ones take their
 *   defaults
 * @param {string} prefix - Path of the parameter bag: `generator.params`,
 *   `effects.<effectId>`
 * @returns {ParamControl[]}
 */
export function paramControls(schema, stored, prefix) {
  const values = resolveParams(schema, stored);
  /** @type {ParamControl[]} */
  const controls = [];
  for (const [name, param] of Object.entries(schema || {})) {
    if (!isShown(param.when, values)) continue;
    const path = `${prefix}.${name}`;
    const animatable =
      Boolean(param.animatable) && ['number', 'color', 'point'].includes(param.type);
    /** @type {ParamControl} */
    const control = {
      name,
      path,
      type: param.type,
      label: param.label || humanize(name),
      value: values[name],
      animatable,
      keyPaths: !animatable ? [] : param.type === 'point' ? [`${path}.x`, `${path}.y`] : [path],
    };
    if (param.type === 'number') {
      control.spec = numberSpec(param);
      control.slider = wantsSlider(control.spec);
    }
    if (param.type === 'point') control.spec = POINT_SPEC;
    if (param.type === 'select') {
      control.options = (param.options || []).map((option) => [option, humanize(option)]);
    }
    controls.push(control);
  }
  return controls;
}
