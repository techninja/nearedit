/**
 * The filter chain of one audible clip: trim, resample, and give it its
 * level. The level follows `levels.js`: a constant gain and fades on
 * FFmpeg's matching fade curves, or — for a keyframed volume — a sampled
 * envelope multiplied in. Pure.
 * @module api/render/audioChain
 */

import {
  CONTROL_PAD,
  CONTROL_RATE,
  CONTROL_STEP,
  controlBytes,
  controlTrack,
} from './audioEnvelope.js';
import { filter, num } from './expr.js';
import { SAMPLE_RATE } from './timing.js';

export const STEREO = { sample_fmts: 'fltp', sample_rates: SAMPLE_RATE, channel_layouts: 'stereo' };
const BOTH = 'pan=stereo|c0=c0|c1=c0';

/**
 * FFmpeg `afade` curve for each fade curve of the document
 * (`#utils/edl/fadeCurves.js`). `afade` evaluates a fade-out on the time
 * remaining, which is why `fast` and `slow` trade places there.
 */
export const AFADE_IN = {
  linear: 'tri',
  smooth: 'hsin',
  fast: 'ipar',
  slow: 'qua',
  sharp: 'ihsin',
};
export const AFADE_OUT = {
  linear: 'tri',
  smooth: 'hsin',
  fast: 'qua',
  slow: 'ipar',
  sharp: 'ihsin',
};

/**
 * Gain and fade filters of a clip whose level is a constant with fades.
 * @param {any} span
 * @returns {string[]}
 */
function levelFilters(span) {
  const { clip } = span;
  const seconds = (samples) => num(samples / SAMPLE_RATE);
  const curve = (name) => (name === 'tri' ? undefined : name);
  const fadeOutAt = span.clipLength - Math.round(clip.fadeOut * SAMPLE_RATE);
  const filters =
    Math.abs(span.gain - 1) > 1e-6 ? [filter('volume', { volume: num(span.gain) })] : [];
  if (clip.fadeIn > 0 && span.offset < clip.fadeIn * SAMPLE_RATE) {
    const shape = curve(AFADE_IN[clip.fadeInCurve] || 'tri');
    filters.push(filter('afade', { t: 'in', st: 0, d: num(clip.fadeIn), curve: shape }));
  }
  if (clip.fadeOut > 0 && span.offset + span.length > fadeOutAt) {
    const shape = curve(AFADE_OUT[clip.fadeOutCurve] || 'tri');
    const out = { t: 'out', st: seconds(fadeOutAt), d: num(clip.fadeOut), curve: shape };
    filters.push(filter('afade', out));
  }
  return filters;
}

/**
 * Filter chains of one clip, ending in `[a<index>]`, exactly `padTo` samples long.
 * @param {any} span
 * @param {number} index - FFmpeg input index of the clip's file
 * @param {number} padTo - Samples until the lane's next clip starts
 * @param {number} [control] - Input index of its control track, when it has an envelope
 * @returns {string[]}
 */
export function spanChains(span, index, padTo, control) {
  const source = [
    // Resample; fill or trim so sample 0 is the seek point even if audio starts late.
    filter('aresample', { sample_rate: SAMPLE_RATE, async: 1, first_pts: 0 }),
    ...(span.mono ? [BOTH] : []),
    filter('aformat', STEREO),
    filter('atrim', { end_sample: span.length }),
  ];
  const pad = filter('apad', { whole_len: padTo });
  if (control === undefined) {
    const onClipClock = span.offset ? [`asetpts=PTS+${span.offset}`] : [];
    const filters = [...source, ...onClipClock, ...levelFilters(span), pad];
    return [`[${index}:a:0]${filters.join(',')}[a${index}]`];
  }
  const skip = CONTROL_PAD * CONTROL_STEP;
  const gain = [
    filter('aresample', { sample_rate: SAMPLE_RATE }),
    ...[BOTH, filter('aformat', STEREO)],
    filter('atrim', { start_sample: skip, end_sample: skip + span.length }),
    'asetpts=PTS-STARTPTS',
  ];
  return [
    `[${index}:a:0]${source.join(',')}[s${index}]`,
    `[${control}:a:0]${gain.join(',')}[g${index}]`,
    `[s${index}][g${index}]amultiply,${pad}[a${index}]`,
  ];
}

/**
 * The control track of an enveloped span, as an FFmpeg input and its file.
 * @param {any} span
 * @param {string} path - Where the file will be written
 * @returns {{ input: object, file: { path: string, content: Buffer } }}
 */
export function controlInput(span, path) {
  const format = ['-f', 'f32le', '-ar', String(CONTROL_RATE), '-ac', '1'];
  return {
    input: {
      file: path,
      kind: 'envelope',
      clipId: span.clip.clipId,
      args: [...format, '-i', path],
    },
    file: { path, content: controlBytes(controlTrack(span.track, span.clip, span.from, span.to)) },
  };
}
