/**
 * Layer spec for a clip backed by a file: a video (its own trimmed input) or
 * a still image (decoded once, then held). Pure.
 * @module api/render/mediaLayer
 */

import { clipKind } from '#utils/edl/factory.js';
import { videoFadeOutWindow } from '#utils/edl/levels.js';
import { num } from './expr.js';
import { clipGeometry } from './placement.js';
import { clipWindow } from './timing.js';

/** @typedef {import('./layer.js').LayerSpec} LayerSpec */

/**
 * Fades of a video-track clip, on the clip's own clock. The fade-out comes
 * from the shared dissolve rule: none while another clip fades in over it.
 * @param {{ clips: any[] }} track - Snapped track
 * @param {any} clip - Snapped clip
 * @returns {{ fadeIn: number, fadeOut: { start: number, duration: number } | null }}
 */
export function layerFades(track, clip) {
  const out = videoFadeOutWindow(track, clip);
  return {
    fadeIn: clip.fadeIn,
    fadeOut: out && { start: out.start - clip.timelineStart, duration: out.end - out.start },
  };
}

/**
 * Seconds of video decoded ahead of a clip's first frame, so the frame that
 * is on screen at that moment (it may have started earlier) is available.
 * @param {number} fps - Output frame rate
 * @returns {number}
 */
const preRoll = (fps) => Math.max(3 / fps, 0.1);

/**
 * Input options for a file. Videos are seeked and bounded so only the used
 * part is decoded; images are read once.
 * @param {string} file
 * @param {boolean} still
 * @param {{ seek: number, count: number }} window
 * @param {number} fps
 * @returns {{ args: string[], lead: number }} `lead` is how long before the
 *   clip's first frame the input starts
 */
function openInput(file, still, window, fps) {
  if (!still) {
    const from = Math.max(0, window.seek - preRoll(fps));
    const lead = window.seek - from;
    const read = ['-ss', num(from), '-t', num(window.count / fps + lead + 0.001, 4)];
    return { args: [...read, '-an', '-sn', '-dn', '-i', file], lead };
  }
  // A literal % or glob character would otherwise be read as a sequence pattern.
  const literal = /[%*?[\]{}]/.test(file) ? ['-f', 'image2', '-pattern_type', 'none'] : [];
  return { args: [...literal, '-i', file], lead: 0 };
}

/**
 * Describe the layer of a video or image clip and the input it reads.
 * @param {any} clip - Snapped clip
 * @param {any} track - Snapped track that owns it
 * @param {import('./sources.js').SourceInfo} source
 * @param {number} index - FFmpeg input index the clip will get
 * @param {{ timing: import('./timing.js').Timing, frame: { width: number, height: number },
 *   out: { width: number, height: number } }} ctx
 * @returns {{ spec: LayerSpec, input: object } | null} null when the clip is
 *   outside the range or its file has no picture
 */
export function mediaLayer(clip, track, source, index, ctx) {
  const window = clipWindow(clip, ctx.timing);
  if (!window || !source.hasVideo) return null;
  const still = clipKind(clip, track) === 'image';
  const { width, height, anamorphic, matrix } = source;
  const { args, lead } = openInput(clip.sourceFile, still, window, ctx.timing.fps);
  const spec = {
    id: `c${index}`,
    pad: `[${index}:v:0]`,
    ...{ still, lead, window },
    source: { width, height, anamorphic, matrix },
    geometry: clipGeometry(clip, source, ctx.frame, ctx.out),
    ...layerFades(track, clip),
  };
  const kind = still ? 'image' : 'video';
  return { spec, input: { file: clip.sourceFile, kind, clipId: clip.clipId, args } };
}
