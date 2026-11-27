/**
 * Audio graph. Only audio tracks make sound. Every clip is trimmed,
 * resampled to 48 kHz stereo, given its level (`audioChain.js`), and padded
 * with silence up to the next clip of its lane; a lane is a plain concat, so
 * FFmpeg opens sources one after another however long the timeline is.
 * Lanes are summed without amix's level normalisation, limited, and cut to
 * the exact length. Pure.
 * @module api/render/audioGraph
 */

import { STEREO, controlInput, spanChains } from './audioChain.js';
import { audibleSpans } from './audioSpan.js';
import { filter, num } from './expr.js';
import { SAMPLE_RATE } from './timing.js';

/** Peak ceiling of the mix: -1 dBFS, the usual headroom for lossy encoders. */
export const LIMIT = 0.891;

/**
 * @param {any[]} tracks - Snapped tracks of the document
 * @param {import('./videoGraph.js').GraphContext} ctx
 * @returns {{ chains: string[], lanes: number }} Chains ending in `[aout]`
 */
export function buildAudioGraph(tracks, ctx) {
  const total = ctx.timing.samples;
  /** @type {any[][]} */
  const lanes = [];
  for (const span of audibleSpans(tracks, ctx)) {
    // Cross-fading clips overlap, so they go to different lanes.
    const free = lanes.find((lane) => {
      const last = lane[lane.length - 1];
      return last.start + last.length <= span.start;
    });
    if (free) free.push(span);
    else lanes.push([span]);
  }
  const silence = (samples) => [
    filter('anullsrc', { r: SAMPLE_RATE, cl: 'stereo' }),
    filter('aformat', STEREO),
    filter('atrim', { end_sample: samples }),
  ];
  const chains = [];
  const pads = lanes.map((lane, laneIndex) => {
    const parts = [];
    if (lane[0].start > 0) {
      chains.push(`${silence(lane[0].start).join(',')}[gap${laneIndex}]`);
      parts.push(`[gap${laneIndex}]`);
    }
    lane.forEach((span, i) => {
      const index = ctx.inputs.length;
      const read = ['-ss', num(span.seek), '-t', num(span.length / SAMPLE_RATE + 0.001, 4)];
      ctx.inputs.push({
        ...{ file: span.clip.sourceFile, kind: 'audio', clipId: span.clip.clipId },
        args: [...read, '-vn', '-sn', '-dn', '-i', span.clip.sourceFile],
      });
      const next = lane[i + 1];
      const padTo = next ? next.start - span.start : span.length;
      let control;
      if (span.enveloped) {
        // The clip's gain over time travels as a small audio file of its own.
        const name = `envelope-${index}.f32`;
        const made = controlInput(span, ctx.workDir ? `${ctx.workDir}/${name}` : name);
        control = ctx.inputs.length;
        ctx.inputs.push(made.input);
        ctx.files.push(made.file);
      }
      chains.push(...spanChains(span, index, padTo, control));
      parts.push(`[a${index}]`);
    });
    if (parts.length === 1) return parts[0];
    chains.push(`${parts.join('')}concat=n=${parts.length}:v=0:a=1[lane${laneIndex}]`);
    return `[lane${laneIndex}]`;
  });
  const exact = [filter('apad', { whole_len: total }), filter('atrim', { end_sample: total })];
  if (!pads.length) {
    chains.push(`${silence(total).join(',')}[aout]`);
    return { chains, lanes: 0 };
  }
  const mix = pads.length > 1 ? [`amix=inputs=${pads.length}:normalize=0:duration=longest`] : [];
  // Auto-levelling off: the limiter only acts on peaks. Its 5 ms look-ahead is compensated.
  const latency = ctx.limiterLatency ? 1 : undefined;
  const limiter = filter('alimiter', { limit: LIMIT, level: 0, latency });
  chains.push(`${pads.join('')}${[...mix, limiter, ...exact].join(',')}[aout]`);
  return { chains, lanes: pads.length };
}
