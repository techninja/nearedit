/**
 * Timeline markers: add, move, rename, recolour, remove. Markers are kept
 * sorted by time and sit on frame boundaries. Isomorphic and pure.
 * @module utils/edl/markers
 */

import { newId } from './factory.js';
import { snap } from './time.js';

/** @typedef {import('./types.js').Edl} Edl */
/** @typedef {import('./types.js').Marker} Marker */

/**
 * @param {Edl} edl
 * @param {Marker[]} markers
 * @returns {Edl}
 */
function withMarkers(edl, markers) {
  const sorted = [...markers].sort((a, b) => a.time - b.time);
  const old = edl.markers || [];
  const same = sorted.length === old.length && sorted.every((marker, i) => marker === old[i]);
  return same ? edl : { ...edl, markers: sorted };
}

/**
 * Add a marker.
 * @param {Edl} edl
 * @param {number} time
 * @param {{ label?: string, color?: string, markerId?: string }} [fields]
 * @returns {Edl}
 */
export function addMarker(edl, time, fields = {}) {
  if (!Number.isFinite(time)) return edl;
  const taken = new Set((edl.markers || []).map((marker) => marker.markerId));
  const markerId = fields.markerId && !taken.has(fields.markerId) ? fields.markerId : newId('m');
  const marker = {
    markerId,
    time: Math.max(0, snap(edl, time)),
    label: String(fields.label ?? ''),
    color: String(fields.color ?? ''),
  };
  return withMarkers(edl, [...(edl.markers || []), marker]);
}

/**
 * Change a marker's label and/or colour.
 * @param {Edl} edl
 * @param {string} markerId
 * @param {{ label?: string, color?: string }} patch
 * @returns {Edl}
 */
export function updateMarker(edl, markerId, patch) {
  const change = (marker) => {
    if (marker.markerId !== markerId) return marker;
    const label = typeof patch?.label === 'string' ? patch.label : marker.label;
    const color = typeof patch?.color === 'string' ? patch.color : marker.color;
    return label === marker.label && color === marker.color ? marker : { ...marker, label, color };
  };
  return withMarkers(edl, (edl.markers || []).map(change));
}

/**
 * @param {Edl} edl
 * @param {string} markerId
 * @param {string} label
 * @returns {Edl}
 */
export function renameMarker(edl, markerId, label) {
  return updateMarker(edl, markerId, { label });
}

/**
 * Move a marker to a new time.
 * @param {Edl} edl
 * @param {string} markerId
 * @param {number} time
 * @returns {Edl}
 */
export function moveMarker(edl, markerId, time) {
  if (!Number.isFinite(time)) return edl;
  const to = Math.max(0, snap(edl, time));
  const move = (marker) =>
    marker.markerId === markerId && marker.time !== to ? { ...marker, time: to } : marker;
  return withMarkers(edl, (edl.markers || []).map(move));
}

/**
 * @param {Edl} edl
 * @param {string} markerId
 * @returns {Edl}
 */
export function removeMarker(edl, markerId) {
  return withMarkers(
    edl,
    (edl.markers || []).filter((marker) => marker.markerId !== markerId),
  );
}

/**
 * Re-time markers, e.g. so they follow a ripple edit.
 * @param {Edl} edl
 * @param {(time: number) => number|null} retime - New time, or null to drop
 * @returns {Edl}
 */
export function retimeMarkers(edl, retime) {
  const out = [];
  for (const marker of edl.markers || []) {
    const next = retime(marker.time);
    if (next === null) continue;
    out.push(next === marker.time ? marker : { ...marker, time: Math.max(0, snap(edl, next)) });
  }
  return withMarkers(edl, out);
}
