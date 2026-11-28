/**
 * What the overlays of a brand pass share — the pass's `Brand` track, where
 * they never overlap: a card comes first, a stinger gives way to it, a
 * name waits — and the first of them: a chapter card at each chapter
 * (`passStingers.js`, `passNames.js` are the others).
 * What an earlier pass placed is found again by its mark and kept where it
 * is; what the request no longer asks for is taken away.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § The brand pass. Isomorphic and pure.
 * @module utils/director/brand/passOverlays
 */

import { deleteClips, snapToFrame } from '#utils/edl/index.js';
import { elementFor } from './elementClip.js';
import { MARKS, brandTrack, marked } from './marks.js';
import { refill } from './passCards.js';
import { blocker, nearestCut, putElement } from './place.js';

/** @typedef {import('./pass.js').PassState} PassState */

/** How near a cut must be for a card or a stinger to take it, seconds. */
export const NEAR = 0.75;
export const same = (/** @type {unknown} */ a, /** @type {unknown} */ b) =>
  String(a ?? '')
    .trim()
    .toLowerCase() ===
  String(b ?? '')
    .trim()
    .toLowerCase();

/**
 * The pass's `Brand` track as it is now.
 * @param {PassState} state
 * @returns {any|undefined} undefined while the pass has placed nothing on it
 */
export function lane(state) {
  const where = brandTrack(state.doc, 'brand');
  return where.edl === state.doc
    ? state.doc.tracks.find((entry) => entry.trackId === where.trackId)
    : undefined;
}

/**
 * Take away the clips of a mark that the request no longer asks for.
 * @param {PassState} state
 * @param {string} mark
 * @param {Set<string>} wanted - Ids of the clips that stay
 * @param {(clip: any) => string} name
 */
export function sweep(state, mark, wanted, name) {
  const gone = marked(state.doc, mark).filter(({ clip }) => !wanted.has(clip.clipId));
  for (const { clip } of gone)
    state.log.push({ what: name(clip), at: clip.timelineStart, state: 'removed' });
  if (gone.length) {
    state.doc = deleteClips(
      state.doc,
      gone.map(({ clip }) => clip.clipId),
    );
  }
}

/**
 * Put an overlay on the pass's track, if its stretch is free there. One
 * that would run into what the pass already placed ends where that begins,
 * as long as enough of it is left to read.
 * @param {PassState} state
 * @param {string} role - A role of `elementFor`, or an element id
 * @param {Record<string, string>} slots
 * @param {{ time: number, duration?: number, mark: string }} at
 * @returns {any|null} The clip; null when the stretch is taken
 */
export function lay(state, role, slots, { time, duration, mark }) {
  const { kit } = state;
  const id = elementFor(kit, /** @type {any} */ (role)) || role;
  const design = kit.elements[id];
  const wanted = duration || Number(design?.duration) || 5;
  const where = brandTrack(state.doc, 'brand');
  const track = where.edl.tracks.find((entry) => entry.trackId === where.trackId);
  const busy = blocker(track, time, time + wanted);
  const length = busy ? busy.timelineStart - time : wanted;
  if (length < (Number(design?.minDuration) || 1) - 1e-6) return null;
  // Laid over the picture, whatever its kind: the pass opens no time but the intro's.
  const made = putElement(where.edl, kit, id, slots, {
    ...{ time, duration: length, trackId: where.trackId, ripple: false, intent: mark },
  });
  if (!made) return null;
  state.doc = made.edl;
  return made.clip;
}

/**
 * @param {PassState} state
 * @returns {number[]} The cuts that got a card
 */
export function chapters(state) {
  const wanted = new Set();
  const taken = [];
  const markers = (state.doc.markers || []).filter((marker) => String(marker.label || '').trim());
  const free = [...markers];
  const owns = marked(state.doc, MARKS.chapter);
  state.plan.chapters.forEach((chapter, i) => {
    const slots = { title: chapter.title, number: String(i + 1).padStart(2, '0') };
    const what = `Chapter card “${chapter.title}”`;
    const own = owns.find(({ clip }) => same(clip.element.slots.title, chapter.title));
    if (own) {
      wanted.add(own.clip.clipId);
      taken.push(own.clip.timelineStart);
      return refill(state, own.clip, slots, what);
    }
    const named = free.find((marker) => same(marker.label, chapter.title));
    const marker = chapter.at === null ? named || free[0] : null;
    if (marker) free.splice(free.indexOf(marker), 1);
    const asked = chapter.at === null ? marker?.time : state.later(chapter.at);
    if (asked === undefined) {
      return void state.notes.push(`${what} has no place: give it a time, or a named marker.`);
    }
    const time = nearestCut(state.doc, asked, NEAR) ?? snapToFrame(asked, state.doc.fps);
    const clip = lay(state, 'chapter', slots, { time, mark: MARKS.chapter });
    if (!clip) return void state.notes.push(`${what} did not fit beside another brand element.`);
    wanted.add(clip.clipId);
    taken.push(time);
    state.log.push({ what, at: time, state: 'placed' });
  });
  sweep(state, MARKS.chapter, wanted, (clip) => `Chapter card “${clip.element.slots.title || ''}”`);
  return taken;
}
