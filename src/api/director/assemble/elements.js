/**
 * What a plan puts on screen, as brand elements with their places worked
 * out: the opening title is the kit's `title` element, a pick's title its
 * `lower-third`, and every element item of the plan is the element it
 * names — with the pick it belongs to, or at the time it asks for.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § Elements in a plan.
 * @module api/director/assemble/elements
 */

import { elementFor } from '#utils/director/brand/elementClip.js';
import { formatSeconds } from '#utils/director/snap.js';

/**
 * @typedef {import('../brand/dress.js').Wanted} Wanted
 * @typedef {import('./spine.js').SpineItem} SpineItem
 */

/** Seconds the opening title shows, and a pick's title at most. */
const OPENING = 4;
const OVER_PICK = 3.5;

/**
 * The stretch of the fragment a pick of the plan became.
 * @param {SpineItem[]} items
 * @param {number} pick - Its number in the plan, from 1
 * @param {number} fps
 * @returns {{ start: number, end: number }|null}
 */
function pickSpan(items, pick, fps) {
  const own = items.filter((item) => item.pick.index === pick - 1);
  if (!own.length) return null;
  return { start: own[0].startF / fps, end: own[own.length - 1].endF / fps };
}

/**
 * Where an element item of a plan goes.
 * @param {NonNullable<ReturnType<typeof import('#utils/director/brand/items.js').resolveItem>>} item
 * @param {SpineItem[]} items
 * @param {{ kit: import('#utils/brand/types.js').Kit, fps: number, total: number }} facts
 * @param {string[]} notes
 * @returns {Wanted|null}
 */
function placeItem(item, items, { kit, fps, total }, notes) {
  const base = { id: item.id, kind: item.kind, label: item.label, slots: item.slots };
  const named = Object.values(item.slots)[0] || item.label;
  if (item.id === elementFor(kit, 'bug')) {
    notes.push('The logo bug spans a finished piece: run “Apply brand” on the timeline for it.');
    return null;
  }
  const span = item.pick ? pickSpan(items, item.pick, fps) : null;
  if (item.pick && !span) {
    notes.push(`“${named}” goes with pick ${item.pick}, which is not in the edit — left out.`);
    return null;
  }
  if (item.kind === 'segment') {
    // A card stands between two picks: at the start of one, or where the edit ends.
    const edges = [0, ...items.map((entry) => entry.endF / fps)];
    const wanted = span ? span.start : item.at;
    const ends = item.id === elementFor(kit, 'intro') ? 0 : total;
    const time =
      wanted === null || wanted === undefined
        ? ends
        : edges.reduce((best, at) => (Math.abs(at - wanted) < Math.abs(best - wanted) ? at : best));
    if (wanted === null && item.id === elementFor(kit, 'chapter')) {
      notes.push(`The chapter card “${named}” names no pick to open — left out.`);
      return null;
    }
    return { ...base, time, duration: item.duration };
  }
  if (item.kind === 'transition') {
    const time = span ? span.start : item.at;
    if (time === null || time === undefined) {
      notes.push(`A ${item.label.toLowerCase()} names no pick or time — left out.`);
      return null;
    }
    return { ...base, time };
  }
  if (span) return { ...base, time: span.start, until: span.end, duration: item.duration };
  const time = Math.min(item.at ?? 0, Math.max(0, total - 1));
  if (item.at !== null && item.at > total) {
    notes.push(`“${named}” was asked for at ${formatSeconds(item.at)}, after the end.`);
  }
  return { ...base, time, duration: item.duration };
}

/**
 * Everything a resolved plan puts on screen.
 * @param {import('../plan/resolve.js').ResolvedPlan} plan
 * @param {SpineItem[]} items - The picks as laid out
 * @param {{ kit: import('#utils/brand/types.js').Kit, fps: number, total: number }} facts -
 *   `total`: length of the fragment, seconds
 * @param {string[]} notes - Added to
 * @returns {Wanted[]}
 */
export function wantedElements(plan, items, facts, notes) {
  const { kit, fps } = facts;
  /** @type {Wanted[]} */
  const wanted = [];
  const overlay = (/** @type {'title'|'lowerThird'} */ role) => {
    const id = elementFor(kit, role);
    return { id, kind: 'overlay', label: kit.elements[id]?.label || id };
  };
  if (plan.title && facts.total > 0) {
    wanted.push({ ...overlay('title'), slots: { title: plan.title }, time: 0, duration: OPENING });
  }
  for (const item of items) {
    if (!item.pick.title) continue;
    const [time, until] = [item.startF / fps, item.endF / fps];
    const slots = { name: item.pick.title };
    wanted.push({ ...overlay('lowerThird'), slots, time, until, duration: OVER_PICK });
  }
  for (const item of plan.elements || []) {
    const placed = placeItem(item, items, facts, notes);
    if (placed) wanted.push(placed);
  }
  return wanted.filter((item) => item.id);
}
