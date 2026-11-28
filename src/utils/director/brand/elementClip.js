/**
 * Brand elements for the director: which element of a kit a role means,
 * and an element clip made the way the editor makes one — through
 * `insertElement` — for a builder that places clips itself.
 * Isomorphic and pure.
 * @module utils/director/brand/elementClip
 */

import { createEdl, createTrack, elementClips, insertElement } from '#utils/edl/index.js';

/** @typedef {import('#utils/brand/types.js').Kit} Kit */

/** The roles the director reaches for, and the standard element of each. */
export const ROLES = Object.freeze({
  intro: 'intro',
  outro: 'outro',
  chapter: 'chapter',
  bug: 'bug',
  title: 'title',
  lowerThird: 'lower-third',
  captions: 'caption',
  quote: 'quote',
  transition: 'stinger',
});

/**
 * The element a kit uses in a role: what its `defaults` name, else the
 * standard element of that role.
 * @param {Kit} kit - An effective kit
 * @param {keyof typeof ROLES} role
 * @returns {string} An element id; '' when the kit has none for the role
 */
export function elementFor(kit, role) {
  const elements = kit?.elements || {};
  const named = kit?.defaults?.[role];
  if (named && Object.hasOwn(elements, named)) return named;
  return Object.hasOwn(elements, ROLES[role] || '') ? ROLES[role] : '';
}

/**
 * An element clip that is not on a timeline yet.
 * @param {Kit} kit - An effective kit
 * @param {string} elementId
 * @param {Record<string, string>} slots
 * @param {{ fps: number, width: number, height: number, startF: number, endF: number }} at -
 *   The document it is for, and the frames it spans
 * @param {Record<string, any>} [fields] - Outside fields: fades, effects, keyframes, a label, an intent
 * @returns {any|null} null when the kit has no such element
 */
export function elementClip(kit, elementId, slots, at, fields = {}) {
  const { fps, startF, endF } = at;
  const seconds = (endF - startF) / fps;
  if (!elementId || !(seconds > 0)) return null;
  const blank = createEdl({
    fps,
    resolution: `${at.width}x${at.height}`,
    tracks: [createTrack('video', { trackId: 'v' })],
  });
  const doc = insertElement(blank, kit, elementId, slots, {
    time: 0,
    duration: seconds,
    ripple: false,
  });
  const made = elementClips(doc)[0]?.clip;
  if (!made) return null;
  const { transform, ...outside } = fields;
  return {
    ...made,
    timelineStart: startF / fps,
    timelineEnd: endF / fps,
    sourceIn: 0,
    sourceOut: seconds,
    ...outside,
    transform: { ...made.transform, ...transform },
  };
}
