/**
 * The page as text for a language model: what a snapshot found on it, in
 * page order, grouped under the headings a tour would stop at — kind and
 * name only, no selectors, no positions. Trimmed to a budget: every
 * heading stays, long groups are cut short and say by how much.
 * Reference: docs/app-spec/DIRECTOR-WEB.md § With a model. Isomorphic and pure.
 * @module utils/director/web/digest
 */

import { pagePlaces } from './places.js';

/** @typedef {import('./match.js').PageElement} PageElement */

/** Characters a digest may take by default: about 1,500 tokens. */
export const DIGEST_BUDGET = 6000;
/** Entries a group is cut down to, step by step, until the digest fits. */
const CAPS = [Infinity, 60, 30, 16, 10, 6, 3];

/**
 * The elements of a page under the headings they follow.
 * @param {PageElement[]} elements
 * @param {{ width: number, height: number }} viewport
 * @returns {{ heading: string, entries: string[] }[]} `heading` '' for what
 *   comes before the first heading; an entry reads `link "Pricing"`
 */
export function pageGroups(elements, viewport) {
  const places = pagePlaces(elements, viewport);
  const headings = new Set(elements.filter((el) => el.kind === 'heading').map((el) => el.name));
  const groups = [
    { heading: '', entries: [] },
    ...places.map((p) => ({ heading: p.name, entries: [] })),
  ];
  const ordered = [...elements].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  for (const element of ordered) {
    if (places.includes(element) || !element.name) continue;
    // A section called what its heading says is that heading again.
    if (element.kind === 'section' && headings.has(element.name)) continue;
    const middle = element.rect.y + Math.min(element.rect.height, viewport.height) / 2;
    const at = places.findLastIndex((place) => place.rect.y <= middle);
    const entry = `${element.kind} ${JSON.stringify(element.name)}`;
    if (!groups[at + 1].entries.includes(entry)) groups[at + 1].entries.push(entry);
  }
  return groups.filter((group) => group.heading || group.entries.length);
}

/**
 * @param {{ heading: string, entries: string[] }[]} groups
 * @param {number} cap - Most entries shown per group
 * @returns {string[]}
 */
function lines(groups, cap) {
  return groups.flatMap(({ heading, entries }) => [
    heading ? `heading ${JSON.stringify(heading)}` : '(top of the page)',
    ...entries.slice(0, cap).map((entry) => `  ${entry}`),
    ...(entries.length > cap ? [`  … and ${entries.length - cap} more`] : []),
  ]);
}

/**
 * The digest of a snapshot.
 * @param {{ url: string, title: string, viewport: { width: number, height: number },
 *   page?: { height: number }, elements: PageElement[] }} snapshot
 * @param {number} [budget] - Characters
 * @returns {{ text: string, shown: number, total: number }} `shown` of
 *   `total` things on the page are listed
 */
export function pageDigest(snapshot, budget = DIGEST_BUDGET) {
  const { viewport } = snapshot;
  const groups = pageGroups(snapshot.elements, viewport);
  const total = groups.reduce(
    (sum, group) => sum + group.entries.length + (group.heading ? 1 : 0),
    0,
  );
  const tall = snapshot.page?.height ? `, ${Math.round(snapshot.page.height)} px tall` : '';
  const head = `${JSON.stringify(snapshot.title || '')} — ${snapshot.url} — seen ${viewport.width} × ${viewport.height}${tall}`;
  let body = lines(groups, CAPS[0]);
  for (const cap of CAPS) {
    body = lines(groups, cap);
    if (head.length + body.join('\n').length + 1 <= budget) break;
  }
  let kept = body.length;
  let size = head.length + 1 + body.join('\n').length;
  while (size > budget && kept > 1) size -= body[--kept].length + 1;
  const cut = body.slice(0, kept);
  if (kept < body.length)
    cut.push(`(… the page goes on: ${body.length - kept} more lines not shown)`);
  const shown = cut.filter((line) => /^(heading|  \w)/.test(line)).length;
  return { text: [head, ...cut].join('\n'), shown, total };
}
