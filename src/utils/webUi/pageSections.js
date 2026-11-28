/**
 * The elements of a snapshot as a list: sorted under the section each lies
 * in, so that what is above or below the picture can be found by name.
 * Pure and isomorphic.
 * @module utils/webUi/pageSections
 */

/** @typedef {import('./pageMap.js').Snapshot} Snapshot */
/** @typedef {import('./pageMap.js').PageElement} PageElement */
/** @typedef {import('./pageMap.js').Rect} Rect */

/**
 * @typedef {Object} SectionGroup
 * @property {string} name
 * @property {number} index - The section's own place in the snapshot, -1 for "Page"
 * @property {(PageElement & { index: number })[]} elements
 */

/**
 * The elements sorted under the section each lies in, for a list. An
 * element belongs to the smallest section that holds its middle.
 * @param {Snapshot} snapshot
 * @returns {SectionGroup[]} In page order; "Page" holds what is in no section
 */
export function sectionGroups(snapshot) {
  const all = (snapshot.elements || []).map((element, index) => ({ ...element, index }));
  const sections = all.filter((element) => element.kind === 'section');
  const holds = (/** @type {Rect} */ box, /** @type {Rect} */ rect) => {
    const [x, y] = [rect.x + rect.width / 2, rect.y + rect.height / 2];
    return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
  };
  /** @type {Map<number, SectionGroup>} */
  const groups = new Map([[-1, { name: 'Page', index: -1, elements: [] }]]);
  for (const { name, index } of sections) groups.set(index, { name, index, elements: [] });
  for (const element of all.filter((each) => each.kind !== 'section')) {
    const home = sections
      .filter((section) => holds(section.rect, element.rect))
      .sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height)[0];
    groups.get(home ? home.index : -1).elements.push(element);
  }
  return [...groups.values()].filter((group) => group.index >= 0 || group.elements.length);
}
