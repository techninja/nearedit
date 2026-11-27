/**
 * Copying an effect stack from one clip or track and pasting it onto
 * others. A copied stack carries the keyframes of its parameters; pasted
 * onto a clip they keep their distance from the start of the clip (a track
 * has no keyframes, so there they are left behind). Pasting replaces the
 * target's stack, as "paste attributes" does. The functions are pure; the
 * holder keeps the last copy for the session.
 * @module utils/inspector/effectClipboard
 */

import { pasteAttributes } from '#utils/edl/attributes.js';
import { updateClip } from '#utils/edl/clipEdit.js';
import { effectsOf } from '#utils/edl/effects.js';
import { createClip } from '#utils/edl/factory.js';
import { findClip } from '#utils/edl/query.js';
import { updateTrack } from '#utils/edl/trackOps.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * @typedef {Object} CopiedEffects
 * @property {any[]} effects
 * @property {Record<string, any[]>} keyframes - Only `effects.*` paths
 * @property {number} sourceIn - Source time the keys count from
 */

/**
 * @param {Edl} edl
 * @param {{ clipId: string } | { trackId: string }} source
 * @returns {CopiedEffects|null} null when the source has no effects
 */
export function copyEffects(edl, source) {
  const effects = effectsOf(edl, source);
  if (!effects.length) return null;
  const clip = 'clipId' in source ? findClip(edl, source.clipId)?.clip : null;
  const keyframes = Object.fromEntries(
    Object.entries(clip?.keyframes || {}).filter(([path]) => path.startsWith('effects.')),
  );
  return { effects, keyframes, sourceIn: clip?.sourceIn || 0 };
}

/**
 * @param {Edl} edl
 * @param {CopiedEffects|null} copied
 * @param {{ clipIds: string[] } | { trackId: string }} target
 * @returns {Edl}
 */
export function pasteEffects(edl, copied, target) {
  if (!copied?.effects.length) return edl;
  if ('trackId' in target) return updateTrack(edl, target.trackId, { effects: copied.effects });
  const from = createClip({ timelineEnd: 1, effects: copied.effects });
  const pasted = pasteAttributes(edl, /** @type {any} */ (from), target.clipIds, { effects: true });
  return target.clipIds.reduce((doc, clipId) => {
    const clip = findClip(doc, clipId)?.clip;
    if (!clip) return doc;
    const shift = clip.sourceIn - copied.sourceIn;
    const keyframes = Object.fromEntries(
      Object.entries(copied.keyframes).map(([path, keys]) => [
        path,
        keys.map((key) => ({ ...key, t: key.t + shift })),
      ]),
    );
    return updateClip(doc, clipId, { keyframes });
  }, pasted);
}

/** @type {CopiedEffects|null} */
let held = null;

/**
 * Keep a copy for later pastes.
 * @param {CopiedEffects|null} copied - null leaves the previous copy in place
 * @returns {boolean} True when something was copied
 */
export function holdEffects(copied) {
  if (copied) held = copied;
  return Boolean(copied);
}

/** @returns {CopiedEffects|null} The last copy */
export const heldEffects = () => held;
