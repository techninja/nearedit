/**
 * Reference documents: what a brand element does that nothing else does —
 * long and short text, an empty slot, tall and square frames, a logo file,
 * initials in a drawn mark, a brand font, a font whose file is missing.
 * @module tests/compose/cases/elementSpecials
 */

import { normalizeKit, resolveKit } from '#utils/brand/index.js';
import { SLOTS, at, scene } from './elements.js';

/** @typedef {import('./index.js').Case} Case */

const LONG = 'Dr. Wilhelmina Featherstonehaugh-Cholmondeley, Professor of Applied Mathematics';

/**
 * @param {import('#utils/brand/types.js').Kit[]} kits - The built-in kits, resolved
 * @param {{ logo: string, font: string }} files - Fixture files
 * @returns {Case[]}
 */
export function specialCases(kits, files) {
  /** @type {Case[]} */
  const cases = [];
  const [clean, bold, documentary, playful] = kits;
  const long = { name: LONG, role: LONG, title: LONG, subtitle: LONG, text: `${LONG}. ${LONG}.` };
  const short = { name: 'Ada', role: 'CEO', title: 'Ada', text: 'Ada' };
  cases.push(
    at('element-long-lower-third', scene(bold, 'lower-third', long), 'rest'),
    at('element-long-caption', scene(clean, 'caption', long), 'rest'),
    at('element-long-chapter', scene(playful, 'chapter', { ...long, number: '12' }), 'rest'),
    at('element-long-intro', scene(playful, 'intro', long), 'rest'),
    at('element-short-lower-third', scene(clean, 'lower-third', short), 'rest'),
    at('element-short-caption', scene(documentary, 'caption', short), 'rest'),
    at('element-empty-role', scene(clean, 'lower-third', { name: 'Ada Lovelace' }), 'rest'),
    at('element-empty-subtitle', scene(documentary, 'title', { title: 'Alone' }), 'rest'),
    at('element-empty-by', scene(playful, 'quote', { text: SLOTS.text }), 'rest'),
  );
  for (const format of /** @type {const} */ (['tall', 'square'])) {
    cases.push(
      at(`element-${format}-lower-third`, scene(clean, 'lower-third', SLOTS, { format }), 'in'),
      at(`element-${format}-long`, scene(bold, 'lower-third', long, { format }), 'rest'),
      at(`element-${format}-title`, scene(documentary, 'title', SLOTS, { format }), 'rest'),
      at(`element-${format}-intro`, scene(bold, 'intro', SLOTS, { format }), 'rest'),
      at(`element-${format}-chapter`, scene(playful, 'chapter', SLOTS, { format }), 'in'),
      at(`element-${format}-stinger`, scene(clean, 'stinger', {}, { format }), 'in'),
    );
  }
  // A kit of one's own: a logo file, initials, and a font the kit brings.
  const branded = (/** @type {string} */ family, /** @type {string} */ file) =>
    resolveKit(
      normalizeKit({
        id: 'acme',
        extends: 'builtin:clean',
        tokens: {
          color: { primary: '#be123c' },
          font: { heading: { family, weight: 700, scale: 1.4 } },
          logo: { mark: files.logo },
        },
        fonts: [{ family, weight: 700, file }],
      }),
    );
  const acme = branded('Brand Hand', files.font);
  const table = (/** @type {any} */ kit) => ({ fonts: kit.fonts });
  cases.push(
    at('element-logo-bug', scene(acme, 'bug', {}), 'rest'),
    at('element-logo-intro', scene(acme, 'intro', SLOTS, table(acme)), 'in'),
    at('element-font-lower-third', scene(acme, 'lower-third', SLOTS, table(acme)), 'rest'),
    at('element-font-title-in', scene(acme, 'title', SLOTS, table(acme)), 'in'),
  );
  const initials = resolveKit(
    normalizeKit({ id: 'ne', extends: 'builtin:playful', tokens: { logo: { initials: 'NE' } } }),
  );
  cases.push(at('element-initials-outro', scene(initials, 'outro', SLOTS), 'rest'));
  // A font file that is not there: both canvases fall back to the same face.
  const lost = branded('Lost Sans', '/nowhere/Lost-Bold.woff2');
  const fallback = scene(lost, 'lower-third', SLOTS, table(lost));
  cases.push(at('element-font-missing', fallback, 'rest'));
  return cases;
}
