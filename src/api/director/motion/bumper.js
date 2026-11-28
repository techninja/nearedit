/**
 * A card of the brand kit as a scene of a motion piece: the opening is the
 * kit's `intro` element, a section card its `chapter`, the closing its
 * `outro` — element clips, so they follow the kit when it changes. The
 * card fills the frame for its scene and carries the scene's transitions
 * the way a background does.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § Motion piece.
 * @module api/director/motion/bumper
 */

import { elementClip, elementFor } from '#utils/director/brand/elementClip.js';
import { sceneChange } from './backdrop.js';
import { keyframes } from './clips.js';

/**
 * @typedef {import('./shots.js').Shot} Shot
 * @typedef {import('./scene.js').Piece} Piece
 */

/**
 * What a scene's words fill in, by the kind of card.
 * @param {{ kind: string, title: string, subtitle?: string, number?: string }} scene
 * @returns {Record<string, string>}
 */
export function cardSlots(scene) {
  const second = scene.subtitle || '';
  if (scene.kind === 'chapter') return { title: scene.title, number: scene.number || '' };
  if (scene.kind === 'outro') return { title: scene.title, text: second };
  return { title: scene.title, subtitle: second };
}

/**
 * The element clip of a card scene.
 * @param {Shot} shot
 * @param {Shot|undefined} next
 * @param {Piece} piece
 * @returns {any|null} null when the piece has no kit, or the kit no such element
 */
export function bumper(shot, next, piece) {
  const { kit, format } = piece;
  const { scene } = shot;
  if (!kit) return null;
  const { fps } = format;
  const change = sceneChange(shot, next, piece);
  const span = { ...format, startF: shot.startF, endF: shot.endF + shot.tailF };
  return elementClip(kit, elementFor(kit, scene.kind), cardSlots(scene), span, {
    effects: change.effects,
    keyframes: keyframes(change.keys, fps),
    fadeIn: change.fadeInF / fps,
    fadeOut: change.fadeOutF / fps,
    fadeInCurve: 'smooth',
    fadeOutCurve: 'smooth',
  });
}
