/**
 * The vocabularies of a motion plan — every name a scene may choose from.
 * Whatever mirrors the compositor is read from its catalog, never copied:
 * a particle preset, an effect preset, a text animation, a pattern or a
 * wipe shape added there is usable in a plan at once. The recipes that are
 * the director's own (backgrounds made of generators, accents made of
 * shapes) are listed here and built in `src/api/director/motion/`.
 * Reference: docs/app-spec/DIRECTOR-MOTION.md § Vocabularies.
 * Isomorphic and pure.
 * @module utils/director/motion/vocab
 */

import {
  EFFECTS,
  EFFECT_PRESETS,
  FONT_FAMILIES,
  GENERATORS,
  TEXT_ANIMATIONS,
  TEXT_UNITS,
} from '#utils/compose/index.js';

/** The name that switches an optional layer off. */
export const NONE = 'none';

/** @param {string} type @returns {any} */
const generator = (type) => GENERATORS.find((g) => g.type === type);
/** @param {any} module @param {string} param @returns {string[]} */
const choices = (module, param) => module?.params?.[param]?.options || [];

/**
 * Particle presets a piece without media can use: all of the catalog's but
 * those that draw a picture from the project.
 * @type {import('#utils/compose/catalog.js').Preset[]}
 */
export const PARTICLE_PRESETS = (generator('particles')?.presets || []).filter(
  (/** @type {any} */ preset) => preset.params?.sprite !== 'image',
);

/** `scene.particles`: `none` or a particle preset id. */
export const PARTICLES = [NONE, ...PARTICLE_PRESETS.map((preset) => preset.id)];

/** `scene.look`: `none` or the name of an effect preset. */
export const LOOKS = [NONE, ...EFFECT_PRESETS.map((preset) => preset.name)];

/** `scene.textAnimation`: how the title arrives. */
export const ANIMATIONS = [...TEXT_ANIMATIONS];

/** `scene.by`: the piece of text the animation is staggered over. */
export const UNITS = [...TEXT_UNITS];

/** The shapes of the wipe effect. */
export const WIPE_SHAPES = choices(
  EFFECTS.find((effect) => effect.type === 'wipe'),
  'shape',
);

/** In a plan the straight-edged wipe is simply called `wipe`. */
const LINEAR = 'linear';

/**
 * `scene.transition`: how the scene arrives — a cut, a fade, or a wipe in
 * one of the catalog's shapes.
 */
export const TRANSITIONS = [
  'cut',
  'fade',
  ...WIPE_SHAPES.map((shape) => (shape === LINEAR ? 'wipe' : shape)),
];

/**
 * The wipe shape behind a transition name.
 * @param {string} transition
 * @returns {string|null} null for `cut` and `fade`
 */
export function wipeShape(transition) {
  if (transition === 'wipe') return WIPE_SHAPES.includes(LINEAR) ? LINEAR : null;
  return WIPE_SHAPES.includes(transition) ? transition : null;
}

/** The kinds of the pattern generator; each is a background of its own. */
export const PATTERNS = choices(generator('pattern'), 'pattern');

/**
 * `scene.background`: a recipe. `solid` is one slowly changing colour,
 * `gradient` a turning linear gradient, `spotlight` a wandering pool of
 * light, `noise` slow clouds; the rest are drifting patterns.
 */
export const BACKGROUNDS = ['solid', 'gradient', 'spotlight', 'noise', ...PATTERNS];

/**
 * `scene.accent`: one shape that supports the words. `rule` is a line drawn
 * under the title, `frame` an outline inside the edges of the picture,
 * `ring` a slowly growing circle behind the text, `burst` a turning star.
 */
export const ACCENTS = [NONE, 'rule', 'frame', 'ring', 'burst'];

/** Bundled font families a theme may pair. */
export const FONTS = FONT_FAMILIES.map((family) => family.id);

/** `params.pacing`. */
export const PACINGS = ['slow', 'medium', 'fast'];

/**
 * The scene fields that hold a name, with the names each accepts.
 * @returns {Record<'background'|'particles'|'accent'|'look'|'textAnimation'|'by'|'transition',
 *   string[]>}
 */
export function vocabulary() {
  return {
    background: BACKGROUNDS,
    particles: PARTICLES,
    accent: ACCENTS,
    look: LOOKS,
    textAnimation: ANIMATIONS,
    by: UNITS,
    transition: TRANSITIONS,
  };
}

/**
 * A particle preset by id.
 * @param {unknown} id
 * @returns {import('#utils/compose/catalog.js').Preset|undefined}
 */
export const particlePreset = (id) => PARTICLE_PRESETS.find((preset) => preset.id === id);

/**
 * An effect preset by name.
 * @param {unknown} name
 * @returns {{ name: string, effects: { type: string, params: Record<string, any> }[] }|undefined}
 */
export const lookPreset = (name) => EFFECT_PRESETS.find((preset) => preset.name === name);
