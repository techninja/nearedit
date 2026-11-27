/**
 * Turning an inspector change into a document edit. A change names a field
 * by path (or an action) and carries its new value; it is applied to every
 * selected clip the field means something for. Timing, fades, links and
 * groups go through their own EDL operations, everything else through
 * `updateClip`. Isomorphic and pure.
 * @module utils/inspector/apply
 */

import { setClipFades, slipClip, updateClip } from '#utils/edl/clipEdit.js';
import { defaultKenBurns, defaultText } from '#utils/edl/factory.js';
import { moveClips } from '#utils/edl/move.js';
import { groupClips, linkClips, ungroupClips, unlinkClips } from '#utils/edl/selection.js';
import { trimClipEnd } from '#utils/edl/trim.js';
import { kenBurnsPreset } from './kenBurns.js';
import { patchFor } from './paths.js';
import { selectedClips, targetsOf } from './targets.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * @typedef {Object} FieldChange
 * @property {string} name - Field path (`transform.x`), `timing.*`,
 *   `reset.*`, `kenBurns.preset` or `action.*`
 * @property {any} [value]
 */

/**
 * @typedef {Object} ApplyOptions
 * @property {import('#utils/edl/types.js').SourceDurations} [sourceDurations]
 * @property {boolean} [autoCrossfade]
 */

const RESET_TRANSFORM = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1 };
const RESET_CROP = { cropTop: 0, cropBottom: 0, cropLeft: 0, cropRight: 0 };

/**
 * Changes that are several fields at once: the probe path decides which
 * clips they apply to, `patch` what is written.
 * @param {FieldChange} change
 * @param {Edl} edl
 * @returns {{ probe: string, patch: Record<string, any> }|null}
 */
function compound({ name, value }, edl) {
  if (name === 'transform.scale')
    return { probe: 'transform.x', patch: { transform: { scaleX: value, scaleY: value } } };
  if (name === 'reset.transform')
    return { probe: 'transform.x', patch: { transform: RESET_TRANSFORM } };
  if (name === 'reset.crop') return { probe: 'transform.fit', patch: { transform: RESET_CROP } };
  if (name === 'reset.kenBurns')
    return { probe: 'transform.fit', patch: { transform: { kenBurns: defaultKenBurns() } } };
  if (name === 'kenBurns.preset') {
    const kenBurns = kenBurnsPreset(value, edl.resolution);
    return kenBurns ? { probe: 'transform.fit', patch: { transform: { kenBurns } } } : null;
  }
  if (name === 'reset.text') {
    const style = { ...defaultText() };
    delete style.content;
    return { probe: 'text.content', patch: { text: style } };
  }
  return null;
}

/**
 * Timing fields act on one clip; its linked partner follows.
 * @param {Edl} edl
 * @param {any} clip
 * @param {FieldChange} change
 * @param {ApplyOptions} opts
 * @returns {Edl}
 */
function applyTiming(edl, clip, { name, value }, opts) {
  if (!Number.isFinite(value)) return edl;
  const id = clip.clipId;
  if (name === 'timing.start')
    return moveClips(edl, [id], { ...opts, delta: value - clip.timelineStart });
  if (name === 'timing.end') return trimClipEnd(edl, id, value, opts);
  if (name === 'timing.duration') return trimClipEnd(edl, id, clip.timelineStart + value, opts);
  if (name === 'timing.sourceIn') return slipClip(edl, id, value - clip.sourceIn, opts);
  return edl;
}

/**
 * @param {Edl} edl
 * @param {string[]} ids
 * @param {string} action
 * @returns {Edl}
 */
function applyAction(edl, ids, action) {
  if (action === 'action.unlink') return unlinkClips(edl, ids);
  if (action === 'action.link') return ids.length === 2 ? linkClips(edl, ids[0], ids[1]) : edl;
  if (action === 'action.group') return groupClips(edl, ids);
  if (action === 'action.ungroup') return ungroupClips(edl, ids);
  return edl;
}

/**
 * Apply one inspector change to the selected clips.
 * @param {Edl} edl
 * @param {string[]} selection - Selected clip ids
 * @param {FieldChange} change
 * @param {ApplyOptions} [opts]
 * @returns {Edl} The same document when the change does not apply
 */
export function applyChange(edl, selection, change, opts = {}) {
  const refs = selectedClips(edl, selection);
  const { name, value } = change;
  if (!refs.length || !name) return edl;
  const ids = refs.map((ref) => ref.clip.clipId);
  if (name.startsWith('action.')) return applyAction(edl, ids, name);
  if (name.startsWith('timing.')) return applyTiming(edl, refs[0].clip, change, opts);
  if (name === 'fadeIn' || name === 'fadeOut') {
    if (!Number.isFinite(value)) return edl;
    return ids.reduce((doc, id) => setClipFades(doc, id, { [name]: value }), edl);
  }
  // A title without text stops being a title; emptying the box is not an edit.
  if (name === 'text.content' && !String(value ?? '').trim()) return edl;
  const many = compound(change, edl);
  const patch = many ? many.patch : patchFor(name, value);
  return targetsOf(refs, many ? many.probe : name).reduce(
    (doc, ref) => updateClip(doc, ref.clip.clipId, patch),
    edl,
  );
}
