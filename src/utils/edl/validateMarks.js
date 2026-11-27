/**
 * Checks behind `validateEdl` for markers and regions. Isomorphic and pure.
 * @module utils/edl/validateMarks
 */

import { isObject } from './sanitize.js';

/** @typedef {(path: string, message: string) => void} Report */

/**
 * @param {any} item
 * @param {string} idKey - `markerId` or `regionId`
 * @param {Set<string>} ids - Ids seen so far in this list
 * @param {string} path
 * @param {Report} report
 */
function checkId(item, idKey, ids, path, report) {
  if (typeof item[idKey] !== 'string' || !item[idKey]) report(path, `needs a ${idKey}`);
  else if (ids.has(item[idKey])) report(`${path}.${idKey}`, 'is not unique');
  else ids.add(item[idKey]);
}

/**
 * @param {any} item
 * @param {string} path
 * @param {Report} report
 */
function checkText(item, path, report) {
  for (const key of ['label', 'color']) {
    if (typeof item[key] !== 'string') report(`${path}.${key}`, 'must be a string');
  }
}

/**
 * @param {any} markers
 * @param {Report} report
 */
export function checkMarkers(markers, report) {
  if (!Array.isArray(markers)) return report('markers', 'must be an array');
  const ids = new Set();
  markers.forEach((marker, i) => {
    const path = `markers[${i}]`;
    if (!isObject(marker)) return report(path, 'must be an object');
    checkId(marker, 'markerId', ids, path, report);
    if (!(marker.time >= 0) || !Number.isFinite(marker.time))
      report(`${path}.time`, 'must be >= 0');
    if (i && marker.time < markers[i - 1]?.time) report(path, 'markers must be sorted by time');
    checkText(marker, path, report);
  });
}

/**
 * Regions are optional: a document without the field has none.
 * @param {any} regions
 * @param {Report} report
 */
export function checkRegions(regions, report) {
  if (regions === undefined) return;
  if (!Array.isArray(regions)) return report('regions', 'must be an array');
  const ids = new Set();
  regions.forEach((region, i) => {
    const path = `regions[${i}]`;
    if (!isObject(region)) return report(path, 'must be an object');
    checkId(region, 'regionId', ids, path, report);
    const spans = region.start >= 0 && Number.isFinite(region.end) && region.end > region.start;
    if (!spans) report(path, 'must span time: 0 <= start < end');
    const before = regions[i - 1];
    if (before && (before.start - region.start || before.end - region.end) > 0) {
      report(path, 'regions must be sorted by start, then end');
    }
    checkText(region, path, report);
  });
}
