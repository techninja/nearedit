/**
 * The catalog — every generator and effect the compositor knows, with its
 * parameter schema, plus the blend modes, easings, text animations and
 * fonts a document may name. The inspector builds its controls from this,
 * the director is told what exists from this, and `nearedit catalog` prints
 * it. Modules are registered in `generators/index.js` and
 * `effects/index.js`; this file only reads those lists.
 * Isomorphic. Reference: docs/app-spec/COMPOSITOR.md § Module contracts.
 * @module utils/compose/catalog
 */

import { EASINGS } from '#utils/edl/easing.js';
import { BLEND_MODES } from './blend.js';
import effects from './effects/index.js';
import { FONT_FAMILIES } from './fonts.js';
import generators from './generators/index.js';
import { TEXT_ANIMATIONS, TEXT_UNITS } from './text/animation.js';

/**
 * @typedef {import('./params.js').ParamSchema} ParamSchema
 * @typedef {import('./frame.js').Frame} Frame
 * @typedef {import('./frame.js').Time} Time
 * @typedef {import('./host.js').ComposeEnv} ComposeEnv
 */

/**
 * A generator: paints a frame-sized, initially transparent canvas.
 * `params` are resolved (stored values over defaults) and always carry
 * `seed`, the clip's `generator.seed`.
 * @typedef {Object} GeneratorModule
 * @property {string} type - Stored in `clip.generator.type`
 * @property {string} label
 * @property {'background'|'shape'|'text'|'particles'|'pattern'} category
 * @property {string} [description]
 * @property {ParamSchema} params
 * @property {(ctx: any, params: Record<string, any>, time: Time, frame: Frame,
 *   env: ComposeEnv) => void} draw
 */

/**
 * An effect: a CSS-style `filter` string, or an `apply` pass that redraws
 * `surface.canvas` in place. A filter that samples beyond each pixel (a
 * blur) also says how far, in canvas pixels, with `reach`.
 * @typedef {Object} EffectModule
 * @property {string} type - Stored in an effect's `type`
 * @property {string} label
 * @property {'color'|'blur'|'stylize'|'light'|'key'|'distort'} category
 * @property {string} [description]
 * @property {ParamSchema} params
 * @property {(params: Record<string, any>, frame: Frame, time: Time) => string} [filter]
 * @property {(params: Record<string, any>, frame: Frame) => number} [reach]
 * @property {(surface: import('./pool.js').Surface, params: Record<string, any>,
 *   time: Time, frame: Frame, env: ComposeEnv) => void} [apply]
 */

/** @type {Map<string, GeneratorModule>} */
const generatorsByType = new Map(generators.map((module) => [module.type, module]));
/** @type {Map<string, EffectModule>} */
const effectsByType = new Map(effects.map((module) => [module.type, module]));

/**
 * @param {unknown} type
 * @returns {GeneratorModule|undefined}
 */
export const generatorModule = (type) => generatorsByType.get(/** @type {string} */ (type));

/**
 * @param {unknown} type
 * @returns {EffectModule|undefined}
 */
export const effectModule = (type) => effectsByType.get(/** @type {string} */ (type));

/**
 * The data of a module, without its code.
 * @param {GeneratorModule|EffectModule} module
 * @returns {{ type: string, label: string, category: string, description: string,
 *   params: ParamSchema }}
 */
const describe = ({ type, label, category, description = '', params }) => ({
  type,
  label,
  category,
  description,
  params,
});

/** Generators as data: `{ type, label, category, description, params }`. */
export const GENERATORS = generators.map(describe);

/** Effects as data, with `kind`: `filter` or `apply`. */
export const EFFECTS = effects.map((module) => ({
  ...describe(module),
  kind: module.filter ? 'filter' : 'apply',
}));

export { BLEND_MODES, EASINGS, FONT_FAMILIES, TEXT_ANIMATIONS, TEXT_UNITS };

/**
 * Everything above as one JSON-safe object.
 * @returns {object}
 */
export function catalog() {
  return {
    generators: GENERATORS,
    effects: EFFECTS,
    blendModes: BLEND_MODES.map(({ id, label }) => ({ id, label })),
    easings: EASINGS,
    textAnimations: TEXT_ANIMATIONS,
    textUnits: TEXT_UNITS,
    fonts: FONT_FAMILIES.map(({ id, label, generic, weights, italics }) => ({
      id,
      label,
      generic,
      weights,
      italics,
    })),
  };
}
