/**
 * Tokens — the values a brand kit sets once and every design refers to:
 * colours with roles, two fonts, logos, the shape language, spacing, motion
 * and sound. `TOKEN_SCHEMA` describes every one of them (type, label,
 * default, range), so an editor can be generated from it and a kit can be
 * checked against it; its defaults are the tokens of the built-in `clean`
 * kit. Lengths are in units: hundredths of the frame's shorter side.
 * Isomorphic and pure. Contract: docs/app-spec/BRAND.md § A kit.
 * @module utils/brand/tokens
 */

import { EASINGS } from '#utils/edl/easing.js';
import { TEXT_UNITS } from '#utils/edl/defaults.js';
import { KEY_NAMES } from '#utils/music/theory/names.js';
import { SCALES } from '#utils/music/theory/scales.js';
import { MOTIONS } from './element/vocabulary.js';

/**
 * One token, or one field of a font token.
 * @typedef {Object} TokenSpec
 * @property {'color'|'font'|'image'|'number'|'select'|'text'|'boolean'} type
 * @property {string} label
 * @property {any} default
 * @property {string} [description]
 * @property {number} [min] - number
 * @property {number} [max] - number; text: longest value, characters
 * @property {number} [step] - number
 * @property {string} [unit] - number: `u` = units of the frame
 * @property {readonly string[]} [options] - select
 * @property {string} [derived] - color: left out of a kit, it is black or
 *   white, whichever reads on the colour named here
 */

/** @type {(label: string, value: string, description: string) => TokenSpec} */
const color = (label, value, description) => ({
  type: 'color',
  label,
  default: value,
  description,
});
/** @type {(label: string, ground: string) => TokenSpec} */
const on = (label, ground) => ({ type: 'color', label, default: '', derived: ground });
/** @type {(label: string, value: number, min: number, max: number, step?: number) => TokenSpec} */
const units = (label, value, min, max, step = 0.1) => ({
  type: 'number',
  label,
  default: value,
  min,
  max,
  step,
  unit: 'u',
});

/** The fields of a font token: `font.heading`, `font.body`. */
export const FONT_FIELDS = Object.freeze({
  family: { type: 'text', label: 'Family', default: 'Inter', max: 80 },
  weight: { type: 'number', label: 'Weight', default: 400, min: 100, max: 900, step: 100 },
  italic: { type: 'boolean', label: 'Italic', default: false },
  tracking: {
    type: 'number',
    label: 'Letter spacing (of the size)',
    default: 0,
    min: -0.2,
    max: 1,
    step: 0.005,
  },
  lineHeight: { type: 'number', label: 'Line height', default: 1.15, min: 0.7, max: 2.5, step: 0.01 },
  upper: { type: 'boolean', label: 'Capitals', default: false },
  scale: { type: 'number', label: 'Size correction', default: 1, min: 0.4, max: 2.5, step: 0.01 },
});

/**
 * Every token: `TOKEN_SCHEMA[group][name]`.
 * @type {Readonly<Record<string, Readonly<Record<string, TokenSpec>>>>}
 */
export const TOKEN_SCHEMA = Object.freeze({
  color: {
    background: color('Background', '#0b1220', 'Fills the frame of intros, chapters and outros'),
    surface: color('Surface', '#0f172a', 'Plates and cards behind text'),
    primary: color('Primary', '#3b82f6', 'The brand colour: bars, marks, emphasis'),
    accent: color('Accent', '#f59e0b', 'A second colour, used sparingly'),
    text: color('Text', '#ffffff', 'Text on the background and on surfaces'),
    muted: color('Muted text', '#cbd5e1', 'Secondary text: roles, subtitles'),
    onPrimary: on('Text on primary', 'primary'),
    onAccent: on('Text on accent', 'accent'),
  },
  font: {
    heading: {
      type: 'font',
      label: 'Heading font',
      default: { family: 'Inter', weight: 700, tracking: -0.01, lineHeight: 1.1 },
    },
    body: {
      type: 'font',
      label: 'Body font',
      default: { family: 'Inter', weight: 400, lineHeight: 1.25 },
    },
  },
  logo: {
    main: { type: 'image', label: 'Logo', default: '', description: 'The full logo' },
    mark: { type: 'image', label: 'Logo mark', default: '', description: 'The small, square form' },
    initials: {
      type: 'text',
      label: 'Initials',
      default: '',
      max: 4,
      description: 'Written into the drawn mark while there is no logo file',
    },
  },
  shape: {
    radius: units('Corner radius', 1.2, 0, 20),
    stroke: units('Line thickness', 0.4, 0, 5, 0.05),
  },
  space: {
    margin: units('Safe margin', 6, 0, 20),
    gap: units('Gap', 1.5, 0, 10),
  },
  motion: {
    enter: { type: 'select', label: 'Arrives', default: 'slide-up', options: MOTIONS },
    exit: { type: 'select', label: 'Leaves', default: 'fade', options: MOTIONS },
    by: { type: 'select', label: 'Text arrives by', default: 'word', options: TEXT_UNITS },
    ease: { type: 'select', label: 'Easing', default: 'ease-out', options: EASINGS },
    speed: { type: 'number', label: 'Speed', default: 1, min: 0.25, max: 4, step: 0.05 },
  },
  sound: {
    style: { type: 'text', label: 'Musical style', default: 'corporate', max: 40 },
    key: { type: 'select', label: 'Key', default: 'C', options: KEY_NAMES },
    scale: { type: 'select', label: 'Scale', default: 'major', options: Object.keys(SCALES) },
  },
});

/**
 * @returns {Record<string, Record<string, any>>} Every token at its default
 *   (derived colours left empty: `resolveKit` fills them in)
 */
export function defaultTokens() {
  /** @type {Record<string, Record<string, any>>} */
  const tokens = {};
  for (const [group, specs] of Object.entries(TOKEN_SCHEMA)) {
    tokens[group] = {};
    for (const [name, spec] of Object.entries(specs)) {
      if (spec.derived) continue;
      tokens[group][name] = spec.type === 'font' ? { ...spec.default } : spec.default;
    }
  }
  return tokens;
}

/**
 * Read a token by its dotted path: `color.primary`, `font.heading`,
 * `font.heading.family`, `motion` (the whole group).
 * @param {{ tokens?: Record<string, any> } | null | undefined} kit
 * @param {string} path
 * @returns {any} undefined for a token the kit does not have
 */
export function tokenValue(kit, path) {
  let at = kit?.tokens;
  for (const key of String(path).split('.')) {
    if (at === null || typeof at !== 'object' || !Object.hasOwn(at, key)) return undefined;
    at = at[key];
  }
  return at;
}
