/**
 * Adding a title clip in one of the ready-made text styles. Pure and
 * isomorphic.
 * @module utils/create/addText
 */

import { updateClip } from '#utils/edl/clipEdit.js';
import { parseResolution } from '#utils/edl/factory.js';
import { insertTitle } from '#utils/edl/insert.js';
import { newClipIds } from '#utils/edl/selection.js';
import { textPreset } from './textPresets.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * Add a title clip in a preset's style.
 * @param {Edl} edl
 * @param {string} id - One of `TEXT_PRESETS`
 * @param {{ time?: number, trackId?: string, autoCrossfade?: boolean }} [opts]
 * @returns {{ edl: Edl, clipId: string }} `clipId` is '' and the document
 *   unchanged for an unknown preset
 */
export function addTextPreset(edl, id, opts = {}) {
  const preset = textPreset(id);
  if (!preset) return { edl, clipId: '' };
  const { width, height } = parseResolution(edl.resolution);
  const look = preset.build(width, height);
  const placed = insertTitle(edl, { ...opts, text: look.text, duration: preset.duration });
  const [clipId] = newClipIds(edl, placed);
  if (!clipId) return { edl, clipId: '' };
  const next = look.transform ? updateClip(placed, clipId, { transform: look.transform }) : placed;
  return { edl: next, clipId };
}
