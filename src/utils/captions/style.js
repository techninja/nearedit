/**
 * The caption style as data — every field a style has, with its type,
 * default, range, label and the section an editor shows it under. A field's
 * name is its path in the style (`highlight.color` is `style.highlight.color`),
 * so a schema entry, a control and a stored value all share one address.
 * The defaults are the `clean` preset. Lengths are in units: hundredths of
 * the frame's shorter side.
 * Isomorphic and pure. Contract: docs/app-spec/CAPTIONS.md § Style.
 * @module utils/captions/style
 */

/**
 * One field: a parameter spec as generators and effects declare them
 * (`#utils/compose/params.js`), so the same controls can edit it.
 * @typedef {import('#utils/compose/params.js').ParamSpec & { font?: boolean, max?: number }} CaptionField
 *   `font`: the text names a font family — a bundled one or one of the
 *   document's own
 */

export const PRESET_NAMES = ['clean', 'pop', 'karaoke', 'boxed', 'minimal'];
export const CASES = ['as-is', 'upper', 'lower'];
/** How the word being said is marked. */
export const HIGHLIGHTS = ['color', 'box', 'scale', 'underline', 'none'];
/** What happens to the words of a group that have not been said yet. */
export const UNSPOKEN = ['show', 'dim', 'hide'];
export const ANCHORS = ['top', 'middle', 'bottom'];
/** How a group arrives. */
export const GROUP_MOTIONS = ['none', 'fade', 'pop', 'slide'];
/**
 * How the mark arrives at the word being said: at once; with a quick bump
 * in size; smoothly, a pill or underline travelling over from the word
 * before; or left to right through the word as long as it is spoken.
 */
export const WORD_MOTIONS = ['none', 'pop', 'glide', 'fill'];

/** @type {(group: string, label: string, value: number, min: number, max: number, step: number, unit?: string) => CaptionField} */
const num = (group, label, value, min, max, step, unit) => ({
  type: 'number',
  group,
  label,
  default: value,
  min,
  max,
  step,
  ...(unit && { unit }),
});
/** @type {(group: string, label: string, value: string) => CaptionField} */
const color = (group, label, value) => ({ type: 'color', group, label, default: value });
/** @type {(group: string, label: string, options: string[], value: string) => CaptionField} */
const pick = (group, label, options, value) => ({
  type: 'select',
  group,
  label,
  options,
  default: value,
});

const PLATED = { 'plate.on': [true] };

/**
 * Every field of a caption style, by path.
 * @type {Readonly<Record<string, CaptionField>>}
 */
export const CAPTION_STYLE = Object.freeze({
  preset: pick('Preset', 'Preset', PRESET_NAMES, 'clean'),

  'font.family': { type: 'text', group: 'Text', label: 'Font', default: 'Inter', font: true },
  'font.weight': num('Text', 'Weight', 800, 100, 900, 100),
  size: num('Text', 'Size', 5.2, 2, 20, 0.1, 'u'),
  case: pick('Text', 'Capitals', CASES, 'as-is'),
  punctuation: pick('Text', 'Punctuation', ['keep', 'strip'], 'keep'),
  color: color('Text', 'Colour', '#ffffff'),

  'stroke.color': color('Outline and shadow', 'Outline colour', '#0b0f19'),
  'stroke.width': num('Outline and shadow', 'Outline width', 0.5, 0, 2, 0.05, 'u'),
  'shadow.color': color('Outline and shadow', 'Shadow colour', '#000000'),
  'shadow.opacity': num('Outline and shadow', 'Shadow opacity', 0.5, 0, 1, 0.05),
  'shadow.blur': num('Outline and shadow', 'Shadow softness', 0.6, 0, 4, 0.05, 'u'),
  'shadow.x': num('Outline and shadow', 'Shadow right', 0, -3, 3, 0.05, 'u'),
  'shadow.y': num('Outline and shadow', 'Shadow down', 0.3, -3, 3, 0.05, 'u'),

  'plate.on': { type: 'boolean', group: 'Plate', label: 'Box behind the words', default: false },
  'plate.color': { ...color('Plate', 'Box colour', '#000000'), when: PLATED },
  'plate.opacity': { ...num('Plate', 'Box opacity', 0.72, 0, 1, 0.01), when: PLATED },
  'plate.padding': { ...num('Plate', 'Box padding', 1.2, 0, 6, 0.1, 'u'), when: PLATED },
  'plate.radius': { ...num('Plate', 'Box corners', 1.2, 0, 10, 0.1, 'u'), when: PLATED },

  'highlight.mode': pick('Word being said', 'Marked by', HIGHLIGHTS, 'color'),
  'highlight.color': color('Word being said', 'Mark colour', '#facc15'),
  'highlight.scale': {
    ...num('Word being said', 'Size while said', 1.15, 1, 1.6, 0.01),
    when: { 'highlight.mode': ['scale'] },
  },
  unspoken: pick('Word being said', 'Words not said yet', UNSPOKEN, 'show'),

  'group.words': num('Groups', 'Words at a time', 3, 1, 12, 1),
  'group.chars': num('Groups', 'Characters at a time', 18, 4, 80, 1),
  'group.lines': num('Groups', 'Lines', 1, 1, 2, 1),
  'group.pause': num('Groups', 'A pause starts a new group', 0.5, 0.1, 5, 0.05, 's'),
  hold: num('Groups', 'Stays after the last word', 0.3, 0, 5, 0.05, 's'),

  'position.anchor': pick('Position', 'Placed at the', ANCHORS, 'bottom'),
  'position.offset': num('Position', 'In from that edge', 12, 0, 90, 0.5, 'u'),
  // A group is drawn clear of a brand overlay that would be in its way (`room.js`).
  avoid: { type: 'boolean', group: 'Position', label: 'Clear of overlays', default: true },

  'motion.in': pick('Motion', 'A group arrives', GROUP_MOTIONS, 'pop'),
  'motion.word': pick('Motion', 'The mark arrives', WORD_MOTIONS, 'pop'),
  'motion.seconds': num('Motion', 'Takes', 0.12, 0, 1, 0.01, 's'),
});

/** The paths of `CAPTION_STYLE`, in editor order. */
export const STYLE_PATHS = Object.freeze(Object.keys(CAPTION_STYLE));

/**
 * Read a dotted path of a nested object, own properties only.
 * @param {any} object
 * @param {string} path - `highlight.color`
 * @returns {any} undefined when any step is missing
 */
export function readPath(object, path) {
  let at = object;
  for (const key of path.split('.')) {
    if (at === null || typeof at !== 'object' || !Object.hasOwn(at, key)) return undefined;
    at = at[key];
  }
  return at;
}

/**
 * Write a dotted path of a nested object, creating what is missing.
 * @param {Record<string, any>} object
 * @param {string} path
 * @param {any} value
 */
export function writePath(object, path, value) {
  const keys = path.split('.');
  let at = object;
  for (const key of keys.slice(0, -1)) at = at[key] ||= {};
  at[keys[keys.length - 1]] = value;
}
