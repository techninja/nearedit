/**
 * Which selected clips a field applies to. A typical selection is a linked
 * picture + sound pair: "volume" then means the sound, "opacity" the
 * picture, "label" both. Pure and isomorphic.
 * @module utils/inspector/targets
 */

import { clipKind } from '#utils/edl/factory.js';
import { findClip } from '#utils/edl/query.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */

/**
 * @typedef {Object} SelectedClip
 * @property {any} clip
 * @property {any} track
 * @property {'video'|'audio'|'image'|'title'|'generator'|'placeholder'} kind
 */

/**
 * The selected clips that still exist, with their track and kind.
 * @param {Edl} edl
 * @param {string[]} selection
 * @returns {SelectedClip[]} In selection order
 */
export function selectedClips(edl, selection) {
  const out = [];
  for (const clipId of selection || []) {
    const found = findClip(edl, clipId);
    if (found)
      out.push({ clip: found.clip, track: found.track, kind: clipKind(found.clip, found.track) });
  }
  return out;
}

/** @type {(ref: SelectedClip) => boolean} Has a picture that can be cropped and fitted */
const isPicture = (ref) => ref.track.type === 'video' && ['video', 'image'].includes(ref.kind);
/** @type {(ref: SelectedClip) => boolean} Anything drawn in the frame */
const isVisual = (ref) => isPicture(ref) || ref.kind === 'title';

/**
 * The scope of a field: which kind of clip it means anything for.
 * @param {string} name - Field path
 * @returns {'all'|'audio'|'picture'|'visual'|'title'|'placeholder'}
 */
export function fieldScope(name) {
  if (name === 'volume') return 'audio';
  if (name.startsWith('text.')) return 'title';
  if (name === 'prompt' || name === 'intent') return 'placeholder';
  if (/^transform\.(fit|crop|kenBurns)/.test(name)) return 'picture';
  return name.startsWith('transform.') ? 'visual' : 'all';
}

/** @type {Record<string, (ref: SelectedClip) => boolean>} */
const IN_SCOPE = {
  all: () => true,
  audio: (ref) => ref.track.type === 'audio' && ref.kind !== 'placeholder',
  picture: isPicture,
  visual: isVisual,
  title: (ref) => ref.kind === 'title',
  placeholder: (ref) => ref.kind === 'placeholder',
};

/**
 * The clips of a selection that a field applies to.
 * @param {SelectedClip[]} refs
 * @param {string} name - Field path
 * @returns {SelectedClip[]}
 */
export function targetsOf(refs, name) {
  return refs.filter(IN_SCOPE[fieldScope(name)]);
}

/**
 * Whether the selection is one clip, or one linked pair covering the same
 * time — the cases where a single set of timing fields makes sense.
 * @param {SelectedClip[]} refs
 * @returns {boolean}
 */
export function isSingleEvent(refs) {
  if (refs.length === 1) return true;
  if (refs.length !== 2) return false;
  const [a, b] = refs.map((ref) => ref.clip);
  return (
    a.linkedClipId === b.clipId &&
    Math.abs(a.timelineStart - b.timelineStart) < 1e-6 &&
    Math.abs(a.timelineEnd - b.timelineEnd) < 1e-6
  );
}
