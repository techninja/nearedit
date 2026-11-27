/**
 * Regions: named stretches of the timeline (a verse, a scene, the part to
 * render) — the Vegas region. A region is `{ regionId, start, end, label,
 * color }`. The document keeps them in `regions`, sorted by start, on frame
 * boundaries and at least one frame long; a document without the field has
 * none. Isomorphic and pure.
 * @module utils/edl/regions
 */

import { newId } from './factory.js';
import { EPS, frameDuration, snap } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */

/**
 * @typedef {Object} Region
 * @property {string} regionId
 * @property {number} start - Seconds
 * @property {number} end - Seconds, at least one frame after `start`
 * @property {string} label
 * @property {string} color - Hex override, '' for the theme's region colour
 */

/** @type {(edl: Edl) => Region[]} The document's regions, sorted by start. */
export const regionsOf = (edl) => /** @type {any} */ (edl)?.regions || [];

/**
 * @param {Edl} edl
 * @param {Region[]} regions
 * @returns {Edl} The same document when no region changed
 */
function withRegions(edl, regions) {
  const sorted = [...regions].sort((a, b) => a.start - b.start || a.end - b.end);
  const old = regionsOf(edl);
  const same = sorted.length === old.length && sorted.every((region, i) => region === old[i]);
  return same ? edl : /** @type {any} */ ({ ...edl, regions: sorted });
}

/**
 * A span on the frame grid, at least one frame long and not before 0.
 * @param {{ fps?: number }} edl
 * @param {number} a
 * @param {number} b
 * @returns {{ start: number, end: number }}
 */
function span(edl, a, b) {
  const start = Math.max(0, snap(edl, Math.min(a, b)));
  return { start, end: Math.max(snap(edl, Math.max(a, b)), snap(edl, start + frameDuration(edl))) };
}

/**
 * Add a region over a stretch of time (given in either order).
 * @param {Edl} edl
 * @param {number} start
 * @param {number} end
 * @param {{ label?: string, color?: string, regionId?: string }} [fields]
 * @returns {Edl} Unchanged when the times are not numbers
 */
export function addRegion(edl, start, end, fields = {}) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return edl;
  const taken = new Set(regionsOf(edl).map((region) => region.regionId));
  const regionId = fields.regionId && !taken.has(fields.regionId) ? fields.regionId : newId('r');
  const text = (value) => (typeof value === 'string' ? value : '');
  const [label, color] = [text(fields.label), text(fields.color)];
  return withRegions(edl, [
    ...regionsOf(edl),
    { regionId, ...span(edl, start, end), label, color },
  ]);
}

/**
 * Change a region: its label and colour, or its span. `start` alone moves
 * the region (keeping its length) unless `resize` is set; an edge being
 * resized stops one frame short of the other end.
 * @param {Edl} edl
 * @param {string} regionId
 * @param {{ label?: string, color?: string, start?: number, end?: number, resize?: boolean }} patch
 * @returns {Edl}
 */
export function updateRegion(edl, regionId, patch) {
  const frame = frameDuration(edl);
  const text = (value, current) => (typeof value === 'string' ? value : current);
  const next = regionsOf(edl).map((region) => {
    if (region.regionId !== regionId) return region;
    let { start, end } = region;
    if (Number.isFinite(patch?.start)) {
      start = Math.max(0, snap(edl, patch.start));
      if (patch.resize) start = Math.min(start, snap(edl, end - frame));
      else end = snap(edl, start + (region.end - region.start));
    }
    if (Number.isFinite(patch?.end)) end = Math.max(snap(edl, patch.end), snap(edl, start + frame));
    const label = text(patch?.label, region.label);
    const color = text(patch?.color, region.color);
    const same = start === region.start && end === region.end && label === region.label;
    return same && color === region.color ? region : { ...region, start, end, label, color };
  });
  return withRegions(edl, next);
}

/** @type {(edl: Edl, regionId: string, label: string) => Edl} Rename a region. */
export const renameRegion = (edl, regionId, label) => updateRegion(edl, regionId, { label });

/** @type {(edl: Edl, regionId: string, start: number) => Edl} Move a region, keeping its length. */
export const moveRegion = (edl, regionId, start) => updateRegion(edl, regionId, { start });

/** @type {(edl: Edl, regionId: string, edge: 'start'|'end', time: number) => Edl} Drag one end. */
export const resizeRegion = (edl, regionId, edge, time) =>
  updateRegion(edl, regionId, { [edge]: time, resize: true });

/** @type {(edl: Edl, regionId: string) => Edl} Delete a region. */
export const removeRegion = (edl, regionId) =>
  withRegions(
    edl,
    regionsOf(edl).filter((region) => region.regionId !== regionId),
  );

/**
 * Re-time regions so they follow a ripple edit. A region whose ends meet
 * (the time it covered was removed) is dropped.
 * @param {Edl} edl
 * @param {(time: number) => number|null} retime - New time; null = removed
 * @returns {Edl}
 */
export function retimeRegions(edl, retime) {
  const out = [];
  for (const region of regionsOf(edl)) {
    const [start, end] = [retime(region.start), retime(region.end)];
    if (start === null || end === null || !(end - start > EPS)) continue;
    const same = start === region.start && end === region.end;
    out.push(same ? region : { ...region, ...span(edl, start, end) });
  }
  return withRegions(edl, out);
}
