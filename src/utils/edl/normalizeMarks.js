/**
 * Normalising the things that mark time on a document: markers and
 * regions. Isomorphic and pure.
 * @module utils/edl/normalizeMarks
 */

import { snapToFrame } from './query.js';
import { coerce, isObject, toNumber } from './sanitize.js';

/** @typedef {(id: any, prefix: string) => string} Unique */

/**
 * @param {any} raw
 * @param {number} fps
 * @param {Unique} unique - Keeps an id that is free, replaces one that is not
 * @returns {import('./types.js').Marker[]} Sorted by time
 */
export function normalizeMarkers(raw, fps, unique) {
  return (Array.isArray(raw) ? raw : [])
    .filter((marker) => isObject(marker) && Number.isFinite(toNumber(marker.time, NaN)))
    .map((marker) => ({
      markerId: unique(marker.markerId ?? marker.id, 'm'),
      time: Math.max(0, snapToFrame(toNumber(marker.time, 0), fps)),
      label: coerce('label', marker.label, ''),
      color: coerce('color', marker.color, ''),
    }))
    .sort((a, b) => a.time - b.time);
}

/**
 * Regions (regions.js): named stretches of the timeline. Kept as that
 * module keeps them — on the frame grid, not before 0, at least one frame
 * long, sorted by start then end, with unique ids. Entries without two
 * finite times are dropped.
 * @param {any} raw
 * @param {number} fps
 * @param {Unique} unique
 * @returns {import('./types.js').Region[]}
 */
export function normalizeRegions(raw, fps, unique) {
  const time = (value) => toNumber(value, NaN);
  return (Array.isArray(raw) ? raw : [])
    .filter((r) => isObject(r) && Number.isFinite(time(r.start)) && Number.isFinite(time(r.end)))
    .map((region) => {
      const [a, b] = [time(region.start), time(region.end)];
      const start = Math.max(0, snapToFrame(Math.min(a, b), fps));
      const least = snapToFrame(start + 1 / fps, fps);
      return {
        regionId: unique(region.regionId ?? region.id, 'r'),
        start,
        end: Math.max(snapToFrame(Math.max(a, b), fps), least),
        label: coerce('label', region.label, ''),
        color: coerce('color', region.color, ''),
      };
    })
    .sort((x, y) => x.start - y.start || x.end - y.end);
}
