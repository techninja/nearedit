/**
 * The parts of a brand pass that frame the piece: the intro before the
 * first picture, the outro after the last, and the logo bug over what lies
 * between.
 * Each finds what an earlier pass placed and keeps it — where it is, as
 * long as it is — changing only what it says.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § The brand pass. Isomorphic and pure.
 * @module utils/director/brand/passCards
 */

import { allClips, trimClipEnd, trimClipStart, updateElementSlots } from '#utils/edl/index.js';
import { elementFor } from './elementClip.js';
import { MARKS, brandTrack, marked } from './marks.js';
import { pictures } from './passDoc.js';
import { blocker, putElement } from './place.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */
/** @typedef {import('./pass.js').PassState} PassState */

const EPS = 1e-6;

/**
 * Change what one of the pass's own clips says.
 * @param {PassState} state
 * @param {any} clip
 * @param {Record<string, string>} slots
 * @param {string} what - How the result calls it
 */
export function refill(state, clip, slots, what) {
  const next = updateElementSlots(state.doc, clip.clipId, slots);
  state.log.push({ what, at: clip.timelineStart, state: next === state.doc ? 'kept' : 'updated' });
  state.doc = next;
}

/** @param {PassState} state */
export function intro(state) {
  const { kit, plan } = state;
  const slots = { title: plan.title, subtitle: plan.subtitle };
  const what = `Intro “${plan.title}”`;
  const [own] = marked(state.doc, MARKS.intro);
  if (own) return refill(state, own.clip, slots, what);
  const first = pictures(state.doc)[0];
  if (!first) return;
  if (state.doc.tracks.some((track) => track.locked && track.clips.length)) {
    return void state.notes.push(
      'The intro was left out: a locked track holds clips, and opening time for the intro ' +
        'would pull the rest of the timeline out of step with them. Unlock the track first.',
    );
  }
  const start = Math.min(...allClips(state.doc).map(({ clip }) => clip.timelineStart));
  const made = putElement(state.doc, kit, elementFor(kit, 'intro'), slots, {
    ...{ time: start, trackId: first.track.trackId, intent: MARKS.intro },
  });
  if (!made) return;
  state.doc = made.edl;
  state.opened = { from: start, by: made.clip.timelineEnd - made.clip.timelineStart };
  state.log.push({ what, at: start, state: 'placed' });
}

/** @param {PassState} state */
export function outro(state) {
  const { kit, plan } = state;
  const slots = plan.closing?.title ? plan.closing : { title: plan.title, text: '' };
  const what = `Outro “${slots.title}”`;
  const [own] = marked(state.doc, MARKS.outro);
  if (own) return refill(state, own.clip, slots, what);
  const last = pictures(state.doc).sort((a, b) => b.clip.timelineEnd - a.clip.timelineEnd)[0];
  if (!last) return;
  const time = last.clip.timelineEnd;
  const design = kit.elements[elementFor(kit, 'outro')];
  const length = Number(design?.duration) || 5;
  // After the last picture, on its track — nothing moves, and music may run on under it.
  const free = !last.track.locked && !blocker(last.track, time, time + length);
  const where = free
    ? { edl: state.doc, trackId: last.track.trackId }
    : brandTrack(state.doc, 'brand');
  const made = putElement(where.edl, kit, elementFor(kit, 'outro'), slots, {
    ...{ time, ripple: false, trackId: where.trackId, intent: MARKS.outro },
  });
  if (!made) return;
  state.doc = made.edl;
  state.log.push({ what, at: time, state: 'placed' });
}

/** @param {PassState} state */
export function bug(state) {
  const { kit } = state;
  const shots = pictures(state.doc);
  if (!shots.length) return;
  const [opening] = marked(state.doc, MARKS.intro);
  const [closing] = marked(state.doc, MARKS.outro);
  // Over the piece itself: the intro and the outro show the logo already.
  const start = opening ? opening.clip.timelineEnd : shots[0].clip.timelineStart;
  const end = closing
    ? closing.clip.timelineStart
    : Math.max(...shots.map(({ clip }) => clip.timelineEnd));
  if (end - start < 1) return;
  const [own] = marked(state.doc, MARKS.bug);
  if (own) {
    const { clip } = own;
    let next = state.doc;
    if (Math.abs(clip.timelineEnd - end) > EPS) next = trimClipEnd(next, clip.clipId, end);
    if (Math.abs(clip.timelineStart - start) > EPS) next = trimClipStart(next, clip.clipId, start);
    state.log.push({ what: 'Logo bug', at: start, state: next === state.doc ? 'kept' : 'updated' });
    state.doc = next;
    return;
  }
  const where = brandTrack(state.doc, 'logo');
  const made = putElement(
    where.edl,
    kit,
    elementFor(kit, 'bug'),
    {},
    {
      ...{ time: start, duration: end - start, trackId: where.trackId, intent: MARKS.bug },
    },
  );
  if (!made) return;
  state.doc = made.edl;
  state.log.push({ what: 'Logo bug', at: start, state: 'placed' });
}
