/**
 * What a clip is to an action that works on the existing timeline. A brand
 * element is one of two things: an **overlay** — a lower third, a bug, a
 * stinger — lies over the picture like a title and is never part of the
 * cut; a **segment** — an intro, a chapter card, an outro — is a shot of
 * the cut like any other. Nothing here splits or shifts an element.
 * @module api/director/inplace/kinds
 */

import { clipKind } from '#utils/edl/factory.js';

/**
 * @param {any} clip
 * @param {{ type?: string }} [track]
 * @returns {boolean} True for a title and for an element that lies over the picture
 */
export function isOverlay(clip, track) {
  const kind = /** @type {string} */ (clipKind(clip, track));
  if (kind === 'title') return true;
  return kind === 'element' && clip.element.design.kind !== 'segment';
}

/**
 * @param {any} clip
 * @param {{ type?: string }} [track]
 * @returns {boolean} True for what is cut together as picture: footage, a
 *   still, a generated scene, a card of the brand kit
 */
export function isShot(clip, track) {
  const kind = /** @type {string} */ (clipKind(clip, track));
  if (kind === 'element') return clip.element.design.kind === 'segment';
  return ['video', 'image', 'generator'].includes(kind);
}

/**
 * @param {any} clip
 * @returns {boolean} True for a brand transition: a stinger that covers a cut
 */
export function isStinger(clip) {
  return clip.element?.design?.kind === 'transition';
}
