/**
 * Turning an inspector change into a document edit. A change names a field
 * by path (or an action) and carries its new value; it is applied to every
 * selected clip the field means something for. Field writes go through
 * `setValueAt`, so a property that is animated gets a key at the playhead
 * and any other gets the plain value. Timing, fades, links and groups go
 * through their own EDL operations. Isomorphic and pure.
 * @module utils/inspector/apply
 */

import { setValueAt } from '#utils/edl/autoKey.js';
import { setClipFades } from '#utils/edl/clipEdit.js';
import { compound } from './applyCompound.js';
import { applyAction, applyTiming } from './applyTiming.js';
import { selectedClips, targetsOf } from './targets.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * @typedef {Object} FieldChange
 * @property {string} name - Field path (`transform.x`,
 *   `effects.<effectId>.<param>`, `generator.params.<name>`), `timing.*`,
 *   `reset.*`, `kenBurns.preset`, `generator.type`, `generator.preset` or
 *   `action.*`
 * @property {any} [value]
 */

/**
 * @typedef {Object} ApplyOptions
 * @property {import('#utils/edl/types.js').SourceDurations} [sourceDurations]
 * @property {boolean} [autoCrossfade]
 * @property {number} [time] - The playhead, timeline seconds: where an
 *   animated property gets its key. Default: the start of each clip
 */

/**
 * The moment a clip's animated property is keyed at: the playhead, kept
 * inside the clip.
 * @param {any} clip
 * @param {number|undefined} time
 * @returns {number}
 */
export function keyTimeFor(clip, time) {
  if (!Number.isFinite(time)) return clip.timelineStart;
  return Math.min(clip.timelineEnd, Math.max(clip.timelineStart, time));
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
  return targetsOf(refs, many ? many.probe : name).reduce((doc, { clip }) => {
    const at = keyTimeFor(clip, opts.time);
    return many ? many.apply(doc, clip.clipId, at) : setValueAt(doc, clip.clipId, name, value, at);
  }, edl);
}
