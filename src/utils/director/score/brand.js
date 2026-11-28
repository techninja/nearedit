/**
 * The sound of a brand: what a kit's `sound` tokens — a musical style, a
 * key and a scale — mean for a score. The style and the key are taken as
 * they are. A style is written in one scale: its chords are spelled for it,
 * so the kit's scale is honoured where the style agrees with it and
 * otherwise said, not forced. When the kit names a style the director does
 * not write, its scale still narrows the choice: major or minor.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § Score. Isomorphic and pure.
 * @module utils/director/score/brand
 */

import { KEY_NAMES } from '#utils/music/theory/names.js';
import { SCALES, scaleSteps } from '#utils/music/theory/scales.js';
import { STYLES, findStyle } from './styles.js';

/** @typedef {import('./style.js').Style} Style */

/**
 * @typedef {Object} BrandSound
 * @property {Style|null} style - The kit's style, when the director writes it
 * @property {string} word - What the kit calls its style
 * @property {string} key - The kit's key; '' when it names none that exists
 * @property {string} scale - The kit's scale; '' when it names none that exists
 */

/** @param {string} scale @returns {boolean} A scale with a major third */
const isMajor = (scale) => scaleSteps(scale).includes(4);

/**
 * @param {{ tokens?: Record<string, any> } | null | undefined} kit - An effective kit
 * @returns {BrandSound}
 */
export function brandSound(kit) {
  const sound = kit?.tokens?.sound || {};
  const word = typeof sound.style === 'string' ? sound.style.trim() : '';
  return {
    style: findStyle(word),
    word,
    key: KEY_NAMES.includes(sound.key) ? sound.key : '',
    scale: Object.hasOwn(SCALES, sound.scale) ? sound.scale : '',
  };
}

/**
 * The styles that agree with a scale: those written in it, else those of
 * its kind (major or minor).
 * @param {string} scale - A name in `SCALES`, or ''
 * @returns {Style[]} Every style when the scale says nothing
 */
export function stylesIn(scale) {
  if (!scale) return [...STYLES];
  const same = STYLES.filter((style) => style.scale === scale);
  if (same.length) return same;
  const alike = STYLES.filter((style) => isMajor(style.scale) === isMajor(scale));
  return alike.length ? alike : [...STYLES];
}

/**
 * What to say when a style is not written in the scale a kit asks for.
 * @param {Style} style
 * @param {string} scale - The kit's
 * @returns {string} '' when they agree, or the kit names no scale
 */
export function scaleNote(style, scale) {
  if (!scale || style.scale === scale) return '';
  const label = (/** @type {string} */ name) => SCALES[name].label.toLowerCase();
  return (
    `The kit asks for the ${label(scale)} scale; ${style.label} is written in ` +
    `${label(style.scale)}, and keeps it — its chords are spelled for that scale.`
  );
}
