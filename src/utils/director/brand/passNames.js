/**
 * The parts of a brand pass that name things: a lower third where each
 * speaker first speaks, and the single elements a request asks for by a
 * line. A name that would land on another of the pass's overlays waits for
 * it to leave, as long as the speaker is still speaking then.
 * Reference: docs/app-spec/DIRECTOR-BRAND.md § The brand pass. Isomorphic and pure.
 * @module utils/director/brand/passNames
 */

import { snapToFrame } from '#utils/edl/index.js';
import { elementFor } from './elementClip.js';
import { MARKS, marked } from './marks.js';
import { refill } from './passCards.js';
import { lane, lay, same, sweep } from './passOverlays.js';
import { blocker } from './place.js';

/** @typedef {import('./pass.js').PassState} PassState */

/** The pause between one overlay of the pass and the next, seconds. */
const BREATH = 0.2;

/** @param {PassState} state */
export function names(state) {
  const { kit } = state;
  const design = kit.elements[elementFor(kit, 'lowerThird')];
  const least = Number(design?.minDuration) || 1.5;
  const wanted = new Set();
  const owns = marked(state.doc, MARKS.name);
  for (const speaker of state.plan.speakers) {
    const slots = { name: speaker.name, role: speaker.role || '' };
    const what = `Lower third “${speaker.name}${speaker.role ? ` — ${speaker.role}` : ''}”`;
    const own = owns.find(({ clip }) => same(clip.element.slots.name, speaker.name));
    if (own) {
      wanted.add(own.clip.clipId);
      refill(state, own.clip, slots, what);
      continue;
    }
    if (speaker.time === null) continue;
    let time = snapToFrame(state.later(speaker.time), state.doc.fps);
    const until = speaker.until === null ? Infinity : state.later(speaker.until);
    let clip = null;
    for (let turn = 0; turn < 4 && !clip; turn++) {
      const length = Math.min(Number(design?.duration) || 5, until - time);
      if (length < least) break;
      clip = lay(state, 'lowerThird', slots, { time, duration: length, mark: MARKS.name });
      if (clip) break;
      const busy = blocker(lane(state), time, time + length);
      if (!busy) break;
      time = snapToFrame(busy.timelineEnd + BREATH, state.doc.fps);
    }
    if (!clip) {
      state.notes.push(`${what} did not fit beside another brand element while they speak.`);
      continue;
    }
    wanted.add(clip.clipId);
    state.log.push({ what, at: clip.timelineStart, state: 'placed', why: speaker.why });
  }
  sweep(state, MARKS.name, wanted, (clip) => `Lower third “${clip.element.slots.name || ''}”`);
}

/** @param {PassState} state */
export function items(state) {
  const wanted = new Set();
  const owns = marked(state.doc, MARKS.item);
  for (const item of state.plan.items) {
    const first = Object.values(item.slots)[0];
    const what = `${item.label}${first ? ` “${first}”` : ''}`;
    const own = owns.find(
      ({ clip }) =>
        clip.element.id === item.id &&
        same(Object.values(clip.element.slots)[0], first) &&
        !wanted.has(clip.clipId),
    );
    if (own) {
      wanted.add(own.clip.clipId);
      refill(state, own.clip, item.slots, what);
      continue;
    }
    const time = snapToFrame(state.later(item.at ?? 0), state.doc.fps);
    const clip = lay(state, item.id, item.slots, {
      ...{ time, duration: item.duration || undefined, mark: MARKS.item },
    });
    if (!clip) {
      state.notes.push(`${what} did not fit beside another brand element.`);
      continue;
    }
    wanted.add(clip.clipId);
    state.log.push({ what, at: time, state: 'placed' });
  }
  sweep(state, MARKS.item, wanted, (clip) => clip.label || 'Element');
}
