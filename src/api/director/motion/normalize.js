/**
 * Motion plan normalisation — forgives the harmless ways a language model
 * strays from the plan's shape (synonymous keys, a bare list, names written
 * with capitals or spaces, "4s" for 4) before the plan is validated. What
 * it cannot make sense of is left for validation to report. Names are only
 * tidied here, never judged: an unknown one is handled by `completePlan`.
 * @module api/director/motion/normalize
 */

import { MAX_SUBTITLE, MAX_TITLE, NAME_FIELDS } from '#utils/director/motion/planSchema.js';
import { toSeconds } from '../plan/coerce.js';
import { tidyText } from './brief.js';

const SCENES_KEYS = ['scenes', 'slides', 'cards', 'sections', 'shots', 'frames', 'sequence'];
const SCENE_KEYS = {
  title: ['title', 'text', 'heading', 'headline', 'line'],
  subtitle: ['subtitle', 'sub', 'subheading', 'caption', 'tagline', 'body'],
  background: ['background', 'bg', 'backdrop'],
  particles: ['particles', 'particle'],
  accent: ['accent', 'shape', 'decoration'],
  look: ['look', 'effect', 'grade', 'filter'],
  textAnimation: ['textAnimation', 'text_animation', 'animation', 'animateIn'],
  by: ['by', 'unit', 'per'],
  transition: ['transition', 'transitionIn'],
  duration: ['duration', 'seconds', 'length'],
  kind: ['kind', 'type', 'role', 'card'],
};
/** Other words for names of the director's own vocabularies. */
const WORDS = {
  background: {
    'gradient-drift': 'gradient',
    'linear-gradient': 'gradient',
    radial: 'spotlight',
    'radial-gradient': 'spotlight',
    plain: 'solid',
    color: 'solid',
    colour: 'solid',
    clouds: 'noise',
  },
  accent: { line: 'rule', underline: 'rule', border: 'frame', circle: 'ring', star: 'burst' },
  transition: { crossfade: 'fade', dissolve: 'fade', linear: 'wipe', circle: 'radial' },
  by: { character: 'char', letter: 'char', chars: 'char', words: 'word', lines: 'line' },
};
const OFF = ['off', 'no', 'false', 'nothing'];

/**
 * A name as the vocabularies write it: lower case, hyphens for spaces.
 * @param {unknown} value
 * @param {string} [field] - Scene field, for its other words
 * @returns {unknown} A string when the value was text or a switch
 */
export function tidyName(value, field = '') {
  if (value === false) return 'none';
  if (typeof value !== 'string') return value;
  const name = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  if (OFF.includes(name)) return field === 'transition' ? 'cut' : 'none';
  return WORDS[field]?.[name] || name;
}

/**
 * @param {any} raw - A scene, or just its title
 * @returns {any}
 */
function normalizeScene(raw) {
  if (typeof raw === 'string') return { title: tidyText(raw, MAX_TITLE) };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  /** @type {Record<string, any>} */
  const scene = {};
  for (const [name, aliases] of Object.entries(SCENE_KEYS)) {
    const alias = aliases.find((a) => raw[a] !== undefined && raw[a] !== null && raw[a] !== '');
    if (alias) scene[name] = raw[alias];
  }
  if (typeof scene.title === 'string') scene.title = tidyText(scene.title, MAX_TITLE);
  if (typeof scene.subtitle === 'string') scene.subtitle = tidyText(scene.subtitle, MAX_SUBTITLE);
  if (scene.subtitle === '') delete scene.subtitle;
  for (const field of NAME_FIELDS) {
    if (field in scene) scene[field] = tidyName(scene[field], field);
  }
  if ('duration' in scene) scene.duration = toSeconds(scene.duration);
  // A kind is a name too: `completePlan` reads it and reports what it does not know.
  if (typeof scene.kind === 'string') scene.kind = scene.kind.trim().toLowerCase().slice(0, 40);
  else delete scene.kind;
  if (scene.kind === '') delete scene.kind;
  return scene;
}

/**
 * Bring a parsed reply into motion-plan shape.
 * @param {any} parsed - JSON value from the model
 * @returns {any}
 */
export function normalizeMotionPlan(parsed) {
  let raw = Array.isArray(parsed) ? { scenes: parsed } : parsed;
  if (!raw || typeof raw !== 'object') return raw;
  const hasScenes = (/** @type {any} */ o) => SCENES_KEYS.some((k) => Array.isArray(o?.[k]));
  if (!hasScenes(raw)) raw = Object.values(raw).find(hasScenes) || raw; // {"plan": {…}} wrappers
  /** @type {Record<string, any>} */
  const plan = {};
  const scenesKey = SCENES_KEYS.find((k) => Array.isArray(raw[k]));
  if (scenesKey) plan.scenes = raw[scenesKey].map(normalizeScene);
  // One scene written without its list is still a scene; anything else is for validation.
  else if (raw.scenes && typeof raw.scenes === 'object') plan.scenes = [normalizeScene(raw.scenes)];
  else if (raw.scenes !== undefined) plan.scenes = raw.scenes;
  for (const key of ['theme', 'align']) {
    if (typeof raw[key] === 'string' && raw[key].trim()) plan[key] = tidyName(raw[key]);
  }
  if (plan.align === 'centre' || plan.align === 'centered') plan.align = 'center';
  return plan;
}
