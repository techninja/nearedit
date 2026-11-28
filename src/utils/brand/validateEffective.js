/**
 * What only shows once a kit is complete — after `resolveKit`: whether its
 * colours read on their grounds, whether its fonts can be drawn, whether it
 * has every standard element. Isomorphic and pure.
 * @module utils/brand/validateEffective
 */

import { FONT_FAMILIES } from '#utils/compose/fonts.js';
import { MIN_CONTRAST, contrastRatio } from './color.js';
import { STANDARD_ELEMENTS } from './kits/parts.js';

/** Pairs that must read: [ink, ground, least contrast]. */
const PAIRS = [
  ['text', 'background', MIN_CONTRAST],
  ['text', 'surface', MIN_CONTRAST],
  ['muted', 'background', 3],
  ['onPrimary', 'primary', 3],
  ['onAccent', 'accent', 3],
];

/**
 * Check an effective kit.
 * @param {import('./types.js').Kit} kit - An effective kit
 * @param {(path: string, message: string, level?: 'error'|'warning') => void} report
 */
export function checkEffective(kit, report) {
  const { color = {}, font = {} } = kit.tokens || {};
  for (const [ink, ground, least] of PAIRS) {
    const ratio = contrastRatio(color[ink], color[ground]);
    if (ratio < /** @type {number} */ (least)) {
      const said = `${color[ink]} on ${color[ground]} has a contrast of ${ratio.toFixed(1)}`;
      report(`tokens.color.${ink}`, `${said}: hard to read (at least ${least})`, 'warning');
    }
  }
  const families = new Set([
    ...FONT_FAMILIES.map((family) => family.id.toLowerCase()),
    ...(kit.fonts || []).map((face) => face.family.toLowerCase()),
  ]);
  for (const [name, value] of Object.entries(font)) {
    if (value?.family && !families.has(String(value.family).toLowerCase())) {
      const why = 'is not bundled and the kit brings no file for it';
      report(
        `tokens.font.${name}.family`,
        `"${value.family}" ${why}: the fallback font is drawn`,
        'warning',
      );
    }
  }
  for (const id of STANDARD_ELEMENTS.filter((name) => !Object.hasOwn(kit.elements || {}, name))) {
    report(`elements.${id}`, 'the standard element is missing');
  }
  for (const [role, id] of Object.entries(kit.defaults || {})) {
    if (!Object.hasOwn(kit.elements || {}, id))
      report(`defaults.${role}`, `the kit has no element "${id}"`, 'warning');
  }
}
