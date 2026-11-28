/**
 * The token editor as data, generated from `TOKEN_SCHEMA`: the groups in
 * the order a person sets them, every token as a field with its path
 * (`color.primary`, `font.heading`), and — for colours — a plain note when
 * text set in one would be hard to read on its ground. Pure and isomorphic.
 * @module utils/brandUi/tokenFields
 */

import { FONT_FIELDS, MIN_CONTRAST, TOKEN_SCHEMA, contrastRatio } from '#utils/brand/index.js';

/** @typedef {import('#utils/brand/tokenSchema.js').TokenSpec} TokenSpec */

/**
 * @typedef {Object} TokenField
 * @property {string} path - `group.name`
 * @property {string} group
 * @property {string} name
 * @property {TokenSpec} spec
 */

/** The groups, in the order the editor shows them, with their headings. */
export const TOKEN_GROUPS = Object.freeze([
  { group: 'color', label: 'Colours' },
  { group: 'font', label: 'Fonts' },
  { group: 'logo', label: 'Logo' },
  { group: 'shape', label: 'Shape' },
  { group: 'space', label: 'Spacing' },
  { group: 'motion', label: 'Motion' },
  { group: 'sound', label: 'Sound' },
]);

/** The fields of a font token that sit behind "Fine tuning". */
export const FONT_FINE = Object.freeze(['tracking', 'lineHeight', 'scale']);

/**
 * @returns {{ group: string, label: string, fields: TokenField[] }[]} Every
 *   group the schema has, each with its tokens as fields
 */
export function tokenGroups() {
  const known = TOKEN_GROUPS.filter(({ group }) => Object.hasOwn(TOKEN_SCHEMA, group));
  const others = Object.keys(TOKEN_SCHEMA)
    .filter((group) => !known.some((entry) => entry.group === group))
    .map((group) => ({ group, label: group }));
  return [...known, ...others].map(({ group, label }) => ({
    group,
    label,
    fields: Object.entries(TOKEN_SCHEMA[group]).map(([name, spec]) => ({
      path: `${group}.${name}`,
      group,
      name,
      spec,
    })),
  }));
}

/**
 * @param {string} field - A field of a font token: `weight`, `tracking`…
 * @returns {TokenSpec}
 */
export const fontFieldSpec = (field) => /** @type {any} */ (FONT_FIELDS)[field];

/** Pairs that must read: [ink, ground, least contrast] (as `validateKit` checks them). */
const PAIRS = /** @type {[string, string, number][]} */ ([
  ['text', 'background', MIN_CONTRAST],
  ['text', 'surface', MIN_CONTRAST],
  ['muted', 'background', 3],
  ['onPrimary', 'primary', 3],
  ['onAccent', 'accent', 3],
]);

/**
 * Where text would be hard to read, as a sentence per colour.
 * @param {Record<string, Record<string, any>>} tokens - Complete tokens (an effective kit's)
 * @returns {Record<string, string>} By token path (`color.text`); empty when all reads
 */
export function contrastNotes(tokens) {
  const color = tokens?.color || {};
  const labels = TOKEN_SCHEMA.color;
  /** @type {Record<string, string[]>} */
  const found = {};
  for (const [ink, ground, least] of PAIRS) {
    const ratio = contrastRatio(color[ink], color[ground]);
    if (!color[ink] || !color[ground] || ratio >= least) continue;
    const on = labels[ground]?.label.toLowerCase() || ground;
    (found[`color.${ink}`] ||= []).push(`${on} (contrast ${ratio.toFixed(1)}, aim for ${least})`);
  }
  return Object.fromEntries(
    Object.entries(found).map(([path, grounds]) => [
      path,
      `Hard to read on the ${grounds.join(' and on the ')}`,
    ]),
  );
}
