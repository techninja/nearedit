/**
 * Layer spec for a clip backed by a file: a video (its own trimmed input) or
 * a still image (decoded once, then held). Pure.
 * @module api/render/mediaLayer
 */

import { clipKind } from '#utils/edl/factory.js';
import { videoFadeOutWindow } from '#utils/edl/levels.js';
import { openInput } from './conform.js';
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
