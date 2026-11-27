/**
 * Remove silences from a chain of clips: which pauses go, how much time
 * that saves, and the edit itself. Pauses come from word timestamps (or
 * detected silences when a file has no words) through the shared helpers in
 * `#utils/director/tighten.js`. Isomorphic and pure.
 * @module utils/transcript/silences
 */

import { ceilFrames, floorFrames } from '#utils/director/snap.js';
import { keepRuns } from '#utils/director/tighten.js';
import { applyCuts } from './cutRange.js';

/** @typedef {import('#utils/edl/types.js').Edl} Edl */
/** @typedef {import('./usage.js').Chain} Chain */
/** @typedef {{ start: number, end: number }} Span */

/**
 * @typedef {Object} SilenceSource
 * @property {{ start: number, end: number }[]} [words] - Transcript units
 * @property {Span[]} [silences] - Detected silences of the file
 */

/**
 * @typedef {Object} SilencePlan
 * @property {{ clipId: string, from: number, to: number }[]} cuts - Timeline ranges
 * @property {number} count
 * @property {number} seconds - Time the cuts save
 * @property {'words'|'silences'|'none'} basis - What the pauses were found from
 */

export const SILENCE_DEFAULTS = { threshold: 0.8, padding: 0.1 };

/**
 * The stretches of a source range to remove: every pause longer than
 * `threshold`, less `padding` kept on each side of it.
 * @param {SilenceSource} source
 * @param {number} start - Source range of the clip
 * @param {number} end
 * @param {{ threshold?: number, padding?: number }} [opts]
 * @returns {{ spans: Span[], basis: 'words'|'silences'|'none' }}
 */
export function silenceSpans(source, start, end, opts = {}) {
  const { threshold, padding } = { ...SILENCE_DEFAULTS, ...opts };
  const { runs, basis } = keepRuns(source, start, end, { threshold, padding });
  if (basis === 'none') return { spans: [], basis };
  const spans = [];
  let cursor = start;
  for (const run of [...runs, { start: end, end }]) {
    const edge = cursor === start || run.start === end;
    // With word timings the head and tail of a clip count as pauses too,
    // but only when they are long enough to be one.
    const pause = run.start - cursor + (basis === 'words' ? (edge ? 1 : 2) * padding : 0);
    const wanted = basis === 'silences' || !edge || pause > threshold;
    if (wanted && run.start - cursor > 1e-6) spans.push({ start: cursor, end: run.start });
    cursor = Math.max(cursor, run.end);
  }
  return { spans, basis };
}

/**
 * Plan the removal for every piece of a chain. Cuts are rounded inward to
 * whole frames (no speech is lost) and pauses shorter than two frames are
 * left alone.
 * @param {Chain} chain
 * @param {SilenceSource} source
 * @param {{ threshold?: number, padding?: number, fps?: number }} [opts]
 * @returns {SilencePlan}
 */
export function planSilenceRemoval(chain, source, opts = {}) {
  const fps = opts.fps > 0 ? opts.fps : 30;
  /** @type {SilencePlan} */
  const plan = { cuts: [], count: 0, seconds: 0, basis: 'none' };
  for (const seg of chain.segments) {
    const { spans, basis } = silenceSpans(source, seg.sourceIn, seg.sourceOut, opts);
    if (basis !== 'none') plan.basis = basis;
    for (const span of spans) {
      const from = ceilFrames(seg.timelineStart + (span.start - seg.sourceIn), fps);
      const to = floorFrames(seg.timelineStart + (span.end - seg.sourceIn), fps);
      if (to - from < 2) continue;
      plan.cuts.push({ clipId: seg.clipId, from: from / fps, to: to / fps });
      plan.seconds += (to - from) / fps;
    }
  }
  plan.count = plan.cuts.length;
  return plan;
}

/**
 * Remove the planned pauses. One call is one edit: commit the result as a
 * single undo step.
 * @param {Edl} edl
 * @param {SilencePlan} plan
 * @param {{ autoCrossfade?: boolean }} [opts]
 * @returns {Edl}
 */
export function removeSilences(edl, plan, opts = {}) {
  return applyCuts(edl, plan.cuts, opts);
}
