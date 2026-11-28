/**
 * The named caption styles. Each is written as what differs from the
 * schema's defaults and stored complete, so a preset can be read without
 * resolving anything.
 * Isomorphic and pure. Contract: docs/app-spec/CAPTIONS.md § Style.
 * @module utils/captions/presets
 */

import { CAPTION_STYLE, STYLE_PATHS, readPath, writePath } from './style.js';

/**
 * @typedef {Object} CaptionPreset
 * @property {string} label
 * @property {string} description - One line, for a tile
 * @property {import('./types.js').CaptionStyle} style - Complete
 */

/** @type {Record<string, { label: string, description: string, style: Record<string, any> }>} */
const WRITTEN = {
  clean: {
    label: 'Clean',
    description: 'White words with a dark outline; the word being said turns yellow',
    style: {},
  },
  pop: {
    label: 'Pop',
    description: 'Big capitals, two words at a time; the word being said grows and turns green',
    style: {
      font: { weight: 900 },
      size: 7.4,
      case: 'upper',
      punctuation: 'strip',
      stroke: { color: '#000000', width: 0.8 },
      shadow: { opacity: 0.6, blur: 0.2, x: 0.25, y: 0.5 },
      highlight: { mode: 'scale', color: '#4ade80', scale: 1.12 },
      group: { words: 2, chars: 13 },
      position: { offset: 16 },
      motion: { in: 'pop', word: 'pop', seconds: 0.14 },
    },
  },
  karaoke: {
    label: 'Karaoke',
    description: 'A whole phrase, dim until sung; colour runs through each word as it is said',
    style: {
      font: { weight: 700 },
      size: 4.6,
      stroke: { width: 0.4 },
      highlight: { mode: 'color', color: '#22d3ee' },
      unspoken: 'dim',
      group: { words: 7, chars: 44, lines: 2, pause: 0.7 },
      motion: { in: 'fade', word: 'fill', seconds: 0.2 },
      hold: 0.5,
    },
  },
  boxed: {
    label: 'Boxed',
    description: 'Words on a dark plate; a coloured pill glides to the word being said',
    style: {
      font: { weight: 700 },
      size: 4.6,
      stroke: { width: 0 },
      shadow: { opacity: 0 },
      plate: { on: true, color: '#0b0f19', opacity: 0.86, padding: 1.3, radius: 1.5 },
      highlight: { mode: 'box', color: '#facc15' },
      group: { words: 4, chars: 22 },
      motion: { in: 'slide', word: 'glide', seconds: 0.16 },
    },
  },
  minimal: {
    label: 'Minimal',
    description: 'Quiet subtitles in two lines; a thin line under the word being said',
    style: {
      font: { weight: 400 },
      size: 4.4,
      stroke: { width: 0.3 },
      shadow: { opacity: 0.85, blur: 0.7, y: 0.2 },
      highlight: { mode: 'underline', color: '#ffffff' },
      group: { words: 9, chars: 60, lines: 2, pause: 0.8 },
      position: { offset: 9 },
      motion: { in: 'fade', word: 'glide', seconds: 0.18 },
      hold: 0.6,
    },
  },
};

/**
 * @param {any} object
 * @returns {any} The object and everything in it, frozen
 */
export function deepFreeze(object) {
  for (const value of Object.values(object)) {
    if (value && typeof value === 'object') deepFreeze(value);
  }
  return Object.freeze(object);
}

/**
 * A written preset with every field of the schema.
 * @param {string} name
 * @param {Record<string, any>} written - What differs from the defaults
 * @returns {import('./types.js').CaptionStyle}
 */
function complete(name, written) {
  /** @type {Record<string, any>} */
  const style = {};
  for (const path of STYLE_PATHS) {
    writePath(style, path, readPath(written, path) ?? CAPTION_STYLE[path].default);
  }
  style.preset = name;
  return /** @type {import('./types.js').CaptionStyle} */ (style);
}

/**
 * The named styles, each complete.
 * @type {Readonly<Record<string, CaptionPreset>>}
 */
export const CAPTION_PRESETS = deepFreeze(
  Object.fromEntries(
    Object.entries(WRITTEN).map(([name, preset]) => [
      name,
      { ...preset, style: complete(name, preset.style) },
    ]),
  ),
);
