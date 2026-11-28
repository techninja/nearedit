/**
 * A placement written into the document: the clip's transform is set (and
 * what would move it away again — transform keyframes, a pan and zoom, a
 * crop, a rotation — is cleared), and the round window of a circle
 * placement is added as a `mask` effect or taken away. One edit, so one
 * undo step, and everything it writes can be changed by hand afterwards.
 * Pure and isomorphic.
 * @module utils/cutoutUi/placementEdit
 */

import { updateClip } from '#utils/edl/clipEdit.js';
import { addEffect, removeEffect, updateEffect } from '#utils/edl/effects.js';
import { parseResolution } from '#utils/edl/factory.js';
import { clearKeyframes } from '#utils/edl/keyframes.js';
import { findClip } from '#utils/edl/query.js';
import { CIRCLE_EFFECT, placementGeometry } from './placements.js';

/** @typedef {import('./placements.js').Size} Size */

/** What a placement resets besides position and size. */
const UPRIGHT = {
  ...{ rotation: 0, cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0 },
  kenBurns: { enabled: false },
};

/** Effects that follow a layer's shape: a window is cut before they run. */
const AFTER_CUT = ['outline', 'dropShadow', 'glow'];

/**
 * Add, move or remove the round window of a clip.
 * @param {any} edl
 * @param {string} clipId
 * @param {import('./placements.js').PlacementGeometry['circle']} circle
 * @returns {any}
 */
function setCircle(edl, clipId, circle) {
  const effects = findClip(edl, clipId)?.clip.effects || [];
  const has = effects.some((fx) => fx.effectId === CIRCLE_EFFECT);
  if (!circle) return has ? removeEffect(edl, clipId, CIRCLE_EFFECT) : edl;
  const { center, width, height } = circle;
  if (has) {
    // The window is moved; how soft its edge is stays as the person set it.
    const params = { shape: 'ellipse', center, width, height, rotation: null, invert: null };
    return updateEffect(edl, clipId, CIRCLE_EFFECT, { type: 'mask', enabled: true, params });
  }
  const before = effects.findIndex((fx) => AFTER_CUT.includes(fx.type));
  return addEffect(edl, clipId, 'mask', {
    effectId: CIRCLE_EFFECT,
    params: { shape: 'ellipse', center, width, height },
    index: before >= 0 ? before : effects.length,
  });
}

/**
 * Put clips into a placement.
 * @param {any} edl
 * @param {string[]} clipIds
 * @param {string} id - One of `PLACEMENTS`
 * @param {(clip: any) => Size|null|undefined} [sizeOf] - The picture of a
 *   clip as shown, when it is known; otherwise the frame's proportions are assumed
 * @returns {any} The same document when nothing changed
 */
export function applyPlacement(edl, clipIds, id, sizeOf = () => null) {
  const frame = parseResolution(edl.resolution);
  return clipIds.reduce((doc, clipId) => {
    const clip = findClip(doc, clipId)?.clip;
    const geometry = clip ? placementGeometry(id, frame, sizeOf(clip) || frame) : null;
    if (!geometry) return doc;
    const moving = Object.keys(clip.keyframes || {}).filter(
      (path) => path.startsWith('transform.') && path !== 'transform.opacity',
    );
    const still = moving.reduce((next, path) => clearKeyframes(next, clipId, path), doc);
    const placed = updateClip(still, clipId, { transform: { ...UPRIGHT, ...geometry.transform } });
    return setCircle(placed, clipId, geometry.circle);
  }, edl);
}
