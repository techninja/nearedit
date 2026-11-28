/**
 * The brand elements a plan names, bound to the kit: an element the kit
 * does not have is dropped and explained, like a file that is not there.
 * @module api/director/plan/elements
 */

import { resolveItem } from '#utils/director/brand/items.js';

/**
 * @param {any[]} items - Valid against the plan schema's element item
 * @param {import('#utils/brand/types.js').Kit} kit
 * @param {string[]} notes - Added to
 * @returns {NonNullable<ReturnType<typeof resolveItem>>[]}
 */
export function resolveElements(items, kit, notes) {
  return items.flatMap((item) => {
    const found = resolveItem(item, kit);
    if (!found) notes.push(`The brand kit has no element “${item.element}” — left out.`);
    return found ? [found] : [];
  });
}
