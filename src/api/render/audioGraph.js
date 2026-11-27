/**
 * Audio graph. Only audio tracks make sound. Every clip is trimmed,
 * resampled to 48 kHz stereo, given its gain and fades, and padded with
 * silence up to the next clip of its lane; a lane is a plain concat, so
 * FFmpeg opens sources one after another however long the timeline is.
 * Lanes are summed without amix's level normalisation, limited, and cut to
 * the exact length. Pure.
 * @module api/render/audioGraph
 */

import { clipGain } from '#utils/edl/levels.js';
import { activeTracks } from '#utils/edl/query.js';
import { filter, num } from './expr.js';
import { SAMPLE_RATE, clipWindow, sampleAt } from './timing.js';

/** Peak ceiling of the mix: -1 dBFS, the usual headroom for lossy encoders. */
export const LIMIT = 0.891;
const STEREO = { sample_fmts: 'fltp', sample_rates: SAMPLE_RATE, channel_layouts: 'stereo' };

/**
 * Every audible clip as a span of output samples.
 * @param {any[]} tracks - Snapped tracks
 * @param {import('./videoGraph.js').GraphContext} ctx
 * @returns {any[]} Sorted by start
 */
function audibleSpans(tracks, ctx) {
  const { timing } = ctx;
  const at = (frame) => sampleAt(frame, timing.fps);
  const spans = [];
  for (const track of activeTracks(tracks, 'audio')) {
    for (const clip of track.clips) {
      const window = clip.sourceFile ? clipWindow(clip, timing) : null;
      if (!window) continue;
      const source = ctx.source(clip.sourceFile);
      // Static part of the shared gain rule; the fades become afade filters.
      const gain = clipGain(track, { ...clip, fadeIn: 0, fadeOut: 0 }, clip.timelineStart);
      if (!source.hasAudio || !(gain > 0)) continue;
      spans.push({
        ...{ clip, gain, seek: window.seek, mono: source.channels === 1 },
        start: at(window.first) - at(timing.startFrame),
        length: at(window.last) - at(window.first),
        offset: at(window.first) - at(clip.startFrame),
        clipLength: at(clip.endFrame) - at(clip.startFrame),
      });
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

/**
 * Filter chain of one clip, exactly `padTo` samples long.
 * @param {any} span
 * @param {number} index - FFmpeg input index
 * @param {number} padTo - Samples until the lane's next clip starts
 * @returns {string}
 */
function spanChain(span, index, padTo) {
  const { clip } = span;
  const seconds = (samples) => num(samples / SAMPLE_RATE);
  const fadeOutAt = span.clipLength - Math.round(clip.fadeOut * SAMPLE_RATE);
  const shown = [span.offset, span.offset + span.length];
  const filters = [
    // Resample; fill or trim so sample 0 is the seek point even if audio starts late.
    filter('aresample', { sample_rate: SAMPLE_RATE, async: 1, first_pts: 0 }),
    ...(span.mono ? ['pan=stereo|c0=c0|c1=c0'] : []),
    filter('aformat', STEREO),
    filter('atrim', { end_sample: span.length }),
    ...(span.offset ? [`asetpts=PTS+${span.offset}`] : []),
    ...(Math.abs(span.gain - 1) > 1e-6 ? [filter('volume', { volume: num(span.gain) })] : []),
  ];
  if (clip.fadeIn > 0 && shown[0] < clip.fadeIn * SAMPLE_RATE)
    filters.push(filter('afade', { t: 'in', st: 0, d: num(clip.fadeIn) }));
  if (clip.fadeOut > 0 && shown[1] > fadeOutAt)
    filters.push(filter('afade', { t: 'out', st: seconds(fadeOutAt), d: num(clip.fadeOut) }));
  filters.push(filter('apad', { whole_len: padTo }));
  return `[${index}:a:0]${filters.join(',')}[a${index}]`;
}

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
      chains.push(spanChain(span, index, next ? next.start - span.start : span.length));
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
  const limiter = filter('alimiter', { limit: LIMIT, level: 0, latency: 1 });
  chains.push(`${pads.join('')}${[...mix, limiter, ...exact].join(',')}[aout]`);
  return { chains, lanes: pads.length };
}
