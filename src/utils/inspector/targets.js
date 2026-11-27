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
export const isVisual = (ref) =>
  isPicture(ref) || (ref.track.type === 'video' && ['title', 'generator'].includes(ref.kind));

/**
 * The scope of a field: which kind of clip it means anything for.
 * @param {string} name - Field path
 * @returns {'all'|'audio'|'picture'|'visual'|'title'|'generator'|'placeholder'}
 */
export function fieldScope(name) {
  if (name === 'volume') return 'audio';
  if (name.startsWith('text.')) return 'title';
  if (name.startsWith('generator.')) return 'generator';
  if (name === 'prompt' || name === 'intent') return 'placeholder';
  if (/^transform\.(fit|crop|kenBurns)/.test(name)) return 'picture';
  const drawn = name.startsWith('transform.') || name.startsWith('effects.');
  return drawn || name === 'blendMode' ? 'visual' : 'all';
}

/** @type {Record<string, (ref: SelectedClip) => boolean>} */
const IN_SCOPE = {
  all: () => true,
  audio: (ref) => ref.track.type === 'audio' && ref.kind !== 'placeholder',
  picture: isPicture,
  visual: isVisual,
  title: (ref) => ref.kind === 'title',
  generator: (ref) => ref.kind === 'generator',
  placeholder: (ref) => ref.kind === 'placeholder',
};

/**
 * The clips of a selection that a field applies to. A parameter of an
 * effect (`effects.<effectId>.<param>`) applies to the clips that have it.
 * @param {SelectedClip[]} refs
 * @param {string} name - Field path
 * @returns {SelectedClip[]}
 */
export function targetsOf(refs, name) {
  const scoped = refs.filter(IN_SCOPE[fieldScope(name)]);
  if (!name.startsWith('effects.')) return scoped;
  const effectId = name.split('.')[1];
  return scoped.filter((ref) => (ref.clip.effects || []).some((fx) => fx.effectId === effectId));
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
