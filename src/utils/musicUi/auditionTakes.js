/**
 * The rendered songs of the audition: a song is rendered into a buffer
 * once, and the last few buffers are kept — going back to a song that was
 * just heard (an undo, the same tile again) plays at once. Only the newest
 * request counts: a render that has been overtaken is given up.
 * @module utils/musicUi/auditionTakes
 */

import { barTimes } from '#utils/music/timing.js';
import { renderSliced, toAudioBuffer } from './auditionRender.js';

/** @typedef {import('./loopVoices.js').Take} Take */

/** Rendered songs kept: the one playing and the ones just before it. */
const KEPT = 3;

/**
 * @param {any} ctx - The audio context the buffers are for
 * @param {(rendering: boolean) => void} onRendering - Told when a render starts and ends
 * @returns {{ take: (song: any) => Promise<Take|null>, peek: (song: any) => Take|null,
 *   cancel: () => void }} `take` resolves to null when a newer request (or
 *   `cancel`) took over; `peek` never renders
 */
export function createTakes(ctx, onRendering) {
  /** @type {Map<any, Take>} By song object: documents are never changed in place */
  const takes = new Map();
  let job = 0;
  return {
    peek: (song) => takes.get(song) || null,
    cancel() {
      job += 1;
      onRendering(false);
    },
    async take(song) {
      const id = ++job;
      if (takes.has(song)) return takes.get(song);
      onRendering(true);
      const signal = {
        /** @returns {boolean} True once a newer request was made */
        get aborted() {
          return id !== job;
        },
      };
      const rendered = await renderSliced(song, { signal });
      if (!rendered) return null;
      onRendering(false);
      const take = { buffer: toAudioBuffer(ctx, rendered), bars: barTimes(song) };
      takes.set(song, take);
      if (takes.size > KEPT) takes.delete(takes.keys().next().value);
      return take;
    },
  };
}
