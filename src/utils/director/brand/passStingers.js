/**
 * The stingers of a brand pass: the kit's transition on the cut at each
 * named marker, the moment it covers the frame on the cut itself. A marker
 * that is not on a cut gets none, and neither does a cut that carries a
 * chapter card — the card is the turn there.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § The brand pass. Isomorphic and pure.
 * @module utils/director/brand/passStingers
 */

import { elementFor } from './elementClip.js';
import { MARKS, brandTrack, marked } from './marks.js';
import { NEAR, sweep } from './passOverlays.js';
import { blocker, coverSpan, nearestCut, putElement } from './place.js';

/** @typedef {import('./pass.js').PassState} PassState */

/**
 * @param {PassState} state
 * @param {number[]} cards - Cuts that carry a chapter card: no stinger there
 */
export function stingers(state, cards) {
  const { kit } = state;
  const id = elementFor(kit, 'transition');
  const wanted = new Set();
  const owns = marked(state.doc, MARKS.stinger);
  const frame = 1 / (Number(state.doc.fps) || 30);
  let far = 0;
  for (const marker of state.doc.markers || []) {
    if (!String(marker.label || '').trim()) continue;
    // A marker that carries a chapter card has its turn already.
    if (cards.some((time) => Math.abs(time - marker.time) < NEAR)) continue;
    const cut = nearestCut(state.doc, marker.time, NEAR);
    if (cut === null) far++;
    if (cut === null || cards.some((time) => Math.abs(time - cut) < NEAR)) continue;
    const span = coverSpan(state.doc, kit, id, cut);
    if (!span) continue;
    const what = `Stinger at “${marker.label}”`;
    const own = owns.find(({ clip }) => Math.abs(clip.timelineStart - span.start) < frame * 1.5);
    if (own) {
      wanted.add(own.clip.clipId);
      state.log.push({ what, at: cut, state: 'kept' });
      continue;
    }
    const where = brandTrack(state.doc, 'brand');
    const track = where.edl.tracks.find((entry) => entry.trackId === where.trackId);
    if (blocker(track, span.start, span.end)) continue;
    const made = putElement(
      where.edl,
      kit,
      id,
      {},
      {
        ...{ time: cut, trackId: where.trackId, intent: MARKS.stinger },
      },
    );
    if (!made) continue;
    state.doc = made.edl;
    wanted.add(made.clip.clipId);
    state.log.push({ what, at: cut, state: 'placed' });
  }
  if (far) {
    state.notes.push(
      `${far} named marker${far === 1 ? ' is' : 's are'} not on a cut: no stinger there.`,
    );
  }
  sweep(state, MARKS.stinger, wanted, () => 'Stinger');
}
