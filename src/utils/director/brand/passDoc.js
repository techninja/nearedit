/**
 * The parts of a brand pass that concern the document as a whole: what its
 * picture is, the caption style of the timeline, and bringing element
 * clips up to date with the kit.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § The brand pass. Isomorphic and pure.
 * @module utils/director/brand/passDoc
 */

import { captionStyleOf } from '#utils/brand/index.js';
import { allClips, clipKind, restyle, setCaptionStyle, staleElements } from '#utils/edl/index.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */
/** @typedef {import('./pass.js').PassState} PassState */

/**
 * The picture of a timeline: what is cut together on its video tracks —
 * footage, stills, generated scenes and cards — without what lies over it.
 * @param {Edl} edl
 * @returns {{ clip: any, track: any }[]} In time order
 */
export function pictures(edl) {
  return allClips(edl)
    .filter(({ clip, track }) => {
      if (track.type !== 'video' || String(clip.intent).startsWith('brand:')) return false;
      const kind = clipKind(clip, track);
      if (/** @type {string} */ (kind) === 'element') return clip.element.design.kind === 'segment';
      return kind !== 'title' && kind !== 'placeholder';
    })
    .sort((a, b) => a.clip.timelineStart - b.clip.timelineStart);
}

/**
 * The caption style of the timeline, from the kit.
 * @param {PassState} state
 */
export function captions(state) {
  const style = captionStyleOf(state.kit);
  const next = setCaptionStyle(state.doc, style);
  state.captions = { style, changed: next !== state.doc };
  state.doc = next;
}

/**
 * Bring element clips up to date with the kit: every one of them, or — with
 * that part switched off — only those the pass placed itself.
 * @param {PassState} state
 * @param {boolean} everything
 */
export function upToDate(state, everything) {
  const stale = staleElements(state.doc, state.kit).filter((ref) => ref.reason === 'outdated');
  const own = stale.filter(({ clip }) => String(clip.intent).startsWith('brand:'));
  const chosen = (everything ? stale : own).filter(({ track }) => !track.locked);
  if (chosen.length) {
    state.doc = restyle(
      state.doc,
      state.kit,
      chosen.map(({ clip }) => clip.clipId),
    );
  }
  state.restyled = chosen.length;
  state.lockedStale = stale.filter(({ track }) => track.locked).length;
}
