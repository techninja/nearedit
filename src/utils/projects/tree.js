/**
 * The adaptation tree. Adaptations are stored flat with a
 * `parentAdaptationId`; these helpers turn that into the nested view the
 * project page shows (a 16:9 long-form with 9:16 and 1:1 children) and
 * answer the questions the page asks before changing it. Pure.
 * @module utils/projects/tree
 */

/** @typedef {import('#utils/projects/api.js').Adaptation} Adaptation */
/**
 * @typedef {Object} TreeRow
 * @property {Adaptation} adaptation
 * @property {number} depth - 0 for a root
 * @property {number} childCount - Direct children
 * @property {string} parentName - '' for a root
 */

/**
 * Whether following parents from `start` ever comes back to it.
 * @param {Map<string, Adaptation>} byId
 * @param {Adaptation} start
 * @returns {boolean}
 */
function inCycle(byId, start) {
  const seen = new Set([start.id]);
  let current = byId.get(start.parentAdaptationId);
  while (current) {
    if (current.id === start.id) return true;
    if (seen.has(current.id)) return false; // a loop further up, not through `start`
    seen.add(current.id);
    current = byId.get(current.parentAdaptationId);
  }
  return false;
}

/**
 * The parent an adaptation is shown under: '' (top level) when it has
 * none, when the parent no longer exists, or when the stored parents form
 * a loop — nothing may ever disappear from the tree.
 * @param {Adaptation[]} adaptations
 * @returns {Map<string, string>} adaptation id → effective parent id
 */
export function effectiveParents(adaptations) {
  const byId = new Map(adaptations.map((a) => [a.id, a]));
  const parents = new Map();
  for (const adaptation of adaptations) {
    const parentId = adaptation.parentAdaptationId || '';
    const usable = parentId && byId.has(parentId) && !inCycle(byId, adaptation);
    parents.set(adaptation.id, usable ? parentId : '');
  }
  return parents;
}

/**
 * Flatten the tree depth-first into display rows; siblings keep their
 * stored (creation) order.
 * @param {Adaptation[]} adaptations
 * @returns {TreeRow[]}
 */
export function adaptationRows(adaptations) {
  const list = Array.isArray(adaptations) ? adaptations.filter((a) => a && a.id) : [];
  const parents = effectiveParents(list);
  const childrenOf = (/** @type {string} */ id) => list.filter((a) => parents.get(a.id) === id);
  const byId = new Map(list.map((a) => [a.id, a]));
  /** @type {TreeRow[]} */
  const rows = [];
  const visit = (/** @type {Adaptation} */ adaptation, /** @type {number} */ depth) => {
    const children = childrenOf(adaptation.id);
    const parentName = byId.get(parents.get(adaptation.id))?.name || '';
    rows.push({ adaptation, depth, childCount: children.length, parentName });
    for (const child of children) visit(child, depth + 1);
  };
  for (const root of childrenOf('')) visit(root, 0);
  return rows;
}

/**
 * What deleting an adaptation does to the others, for the confirmation.
 * @param {Adaptation[]} adaptations
 * @param {string} id
 * @returns {{ allowed: boolean, children: string[], newParentName: string }} `allowed` is
 *   false for the last adaptation; `children` are the names that move up; `newParentName`
 *   is '' when they become top-level
 */
export function deletionEffect(adaptations, id) {
  const rows = adaptationRows(adaptations);
  const row = rows.find((r) => r.adaptation.id === id);
  const parents = effectiveParents(adaptations);
  const children = adaptations.filter((a) => parents.get(a.id) === id).map((a) => a.name);
  return { allowed: adaptations.length > 1, children, newParentName: row?.parentName || '' };
}

/**
 * The sentence that tells the user what a deletion will do.
 * @param {string} name - Adaptation being deleted
 * @param {{ children: string[], newParentName: string }} effect
 * @returns {string}
 */
export function deletionMessage(name, effect) {
  const base = `The timeline of “${name}” is deleted for good. Media files and finished renders are not touched.`;
  if (!effect.children.length) return base;
  const names = effect.children.map((child) => `“${child}”`).join(', ');
  const where = effect.newParentName ? `under “${effect.newParentName}”` : 'to the top level';
  const subject =
    effect.children.length === 1 ? `Its variant ${names} moves` : `Its variants ${names} move`;
  return `${base}\n\n${subject} ${where}.`;
}
