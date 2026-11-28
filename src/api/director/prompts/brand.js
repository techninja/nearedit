/**
 * The brand in a prompt: the elements of the project's kit with their
 * slots, briefly, so a language model can name one instead of inventing a
 * look. It is told what each is for — never how it looks.
 * @module api/director/prompts/brand
 */

import { elementFor } from '#utils/director/brand/elementClip.js';
import { kitMenu } from '#utils/director/brand/menu.js';
import { kitName } from '../brand/kit.js';

const KINDS = {
  overlay: 'over the picture',
  segment: 'a card that takes its own time',
  transition: 'covers the frame for a moment, on a cut',
};

/**
 * The elements a plan may name, one line each: `lower-third (name, role?) — …`.
 * @param {import('#utils/brand/types.js').Kit} kit
 * @param {{ except?: string[] }} [opts] - Roles to leave out (`bug`…)
 * @returns {string[]}
 */
export function elementLines(kit, opts = {}) {
  const hidden = (opts.except || []).map((role) => elementFor(kit, /** @type {any} */ (role)));
  return kitMenu(kit)
    .filter((entry) => !hidden.includes(entry.id))
    .map((entry) => {
      const slots = entry.slots.map((name) => (entry.needs.includes(name) ? name : `${name}?`));
      const fills = slots.length ? ` (${slots.join(', ')})` : '';
      return `  ${entry.id}${fills} — ${entry.label}: ${KINDS[entry.kind] || KINDS.overlay}`;
    });
}

/**
 * The BRAND block of an edit-plan prompt.
 * @param {import('#utils/brand/types.js').Kit} kit
 * @returns {string[]}
 */
export function brandBlock(kit) {
  return [
    'BRAND',
    `The brand kit “${kitName(kit)}” has these elements (slots in brackets, ? = optional). ` +
      'Name them in "elements" where the request calls for one — a speaker’s name, a chapter, ' +
      'an opening or a closing — instead of describing a title:',
    ...elementLines(kit, { except: ['bug', 'captions'] }),
  ];
}
