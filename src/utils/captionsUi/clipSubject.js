/**
 * Which captions the inspector's Captions group is about: the voices of
 * the selected clips — a sound clip with its linked picture is one — and
 * whether they are switched on. Pure.
 * @module utils/captionsUi/clipSubject
 */

import { captionInfo } from '#utils/edl/index.js';
import { findClip } from '#utils/edl/query.js';

/**
 * @typedef {Object} CaptionSubject
 * @property {{ info: import('#utils/edl/captionQuery.js').CaptionInfo, carrier: any }[]} voices -
 *   Each voice once, with the clip that carries its captions
 * @property {string[]} ids - Those clips' ids
 * @property {number} on - How many are switched on
 */

/**
 * @param {import('#utils/edl/types.js').Edl} doc
 * @param {string[]} clipIds - The selection
 * @returns {CaptionSubject} No voices when nothing selected can have captions
 */
export function captionSubject(doc, clipIds) {
  /** @type {Map<string, CaptionSubject['voices'][number]>} */
  const voices = new Map();
  for (const clipId of clipIds) {
    const info = captionInfo(doc, clipId);
    if (!info.can || voices.has(info.carrierId)) continue;
    const carrier = findClip(doc, info.carrierId)?.clip;
    if (carrier) voices.set(info.carrierId, { info, carrier });
  }
  const list = [...voices.values()];
  return {
    voices: list,
    ids: list.map((voice) => voice.info.carrierId),
    on: list.filter((voice) => voice.info.on).length,
  };
}
