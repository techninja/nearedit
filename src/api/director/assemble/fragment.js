/**
 * Fragment under construction — clips collected per layout slot, with the
 * bookkeeping the assembler needs (where is picture, where is free).
 * @module api/director/assemble/fragment
 */

import { LAYOUT, layoutOrder } from '#utils/director/layout.js';

/**
 * @typedef {keyof typeof LAYOUT} Slot
 * @typedef {Object} Fragment
 * @property {number} fps
 * @property {Record<Slot, any[]>} slots - Clips per layout slot
 * @property {(slot: Slot, clip: any) => any} add - Returns the clip
 * @property {(slot: Slot, startF: number, endF: number) => boolean} isFree
 * @property {(slot: Slot) => [number, number][]} spans - Occupied [startF, endF) pairs, ascending
 * @property {() => number} endF - End of the last clip, frames
 * @property {() => { type: string, index: number, name: string, clips: any[] }[]} toTracks
 */

/**
 * @param {number} fps
 * @returns {Fragment}
 */
export function createFragment(fps) {
  /** @type {Record<Slot, any[]>} */
  const slots = { titles: [], broll: [], main: [], dialogue: [], ambience: [], music: [] };
  const frame = (/** @type {number} */ t) => Math.round(t * fps);
  const spans = (/** @type {Slot} */ slot) =>
    slots[slot]
      .map((c) => /** @type {[number, number]} */ ([frame(c.timelineStart), frame(c.timelineEnd)]))
      .sort((a, b) => a[0] - b[0]);
  return {
    fps,
    slots,
    add(slot, clip) {
      slots[slot].push(clip);
      return clip;
    },
    isFree: (slot, startF, endF) => spans(slot).every(([s, e]) => e <= startF || s >= endF),
    spans,
    endF: () =>
      Math.max(
        0,
        ...Object.values(slots).flatMap((clips) => clips.map((c) => frame(c.timelineEnd))),
      ),
    toTracks: () =>
      layoutOrder().map((key) => ({
        ...LAYOUT[key],
        clips: [...slots[key]].sort((a, b) => a.timelineStart - b.timelineStart),
      })),
  };
}

/**
 * The parts of [startF, endF) not covered by any of the given spans.
 * @param {number} startF
 * @param {number} endF
 * @param {[number, number][]} covered - Ascending
 * @returns {[number, number][]}
 */
export function uncovered(startF, endF, covered) {
  const gaps = [];
  let cursor = startF;
  for (const [s, e] of covered) {
    if (e <= cursor) continue;
    if (s >= endF) break;
    if (s > cursor) gaps.push(/** @type {[number, number]} */ ([cursor, Math.min(s, endF)]));
    cursor = Math.max(cursor, e);
  }
  if (cursor < endF) gaps.push(/** @type {[number, number]} */ ([cursor, endF]));
  return gaps;
}
