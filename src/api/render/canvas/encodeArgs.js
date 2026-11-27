/**
 * FFmpeg arguments that encode the frames the compositor draws. The encoder
 * settings are the filter-graph path's own (`presets.js` `videoArgs`), and
 * the frames reach the encoder in the same shape — yuv420p, BT.709, limited
 * range, square pixels — so both kinds of segment carry identical H.264
 * parameter sets and join without re-encoding. Pure.
 * @module api/render/canvas/encodeArgs
 */

import { GLOBAL_ARGS } from '../context.js';
import { filter } from '../expr.js';
import { SEGMENT_ARGS, videoArgs } from '../presets.js';

/**
 * @param {Object} how
 * @param {number} how.width - Canvas size
 * @param {number} how.height
 * @param {import('../timing.js').Timing} how.timing
 * @param {import('../presets.js').RenderPreset} how.preset
 * @param {string} how.output - Segment file
 * @param {boolean} [lossless] - Tests only: keep the canvas's RGB bit for
 *   bit (H.264 High 4:4:4 Predictive, `libx264rgb -qp 0`). Such a segment
 *   does not join with filter-graph segments
 * @returns {string[]} Reads `width × height × 4` bytes per frame from stdin
 */
export function encodeArgs({ width, height, timing, preset, output }, lossless = false) {
  // The canvas is opaque once the background is filled: the fourth byte is padding.
  const input = [
    ...['-f', 'rawvideo', '-pix_fmt', 'rgb0', '-video_size', `${width}x${height}`],
    ...['-framerate', timing.fpsText, '-i', 'pipe:0'],
  ];
  const container = ['-an', ...SEGMENT_ARGS, output];
  if (lossless) {
    const exact = ['-c:v', 'libx264rgb', '-preset', 'ultrafast', '-qp', '0', '-pix_fmt', 'rgb24'];
    return [
      ...GLOBAL_ARGS,
      ...input,
      '-vf',
      'setsar=1',
      ...exact,
      '-r',
      timing.fpsText,
      ...container,
    ];
  }
  // Without the matrix swscale would write BT.601; without setsar the stream
  // would lack the 1:1 pixel shape the filter-graph segments declare.
  const toYuv = filter('scale', {
    ...{ out_color_matrix: 'bt709', out_range: 'tv' },
    flags: `${preset.scaleFlags}+full_chroma_inp`,
  });
  const chain = [toYuv, 'setsar=1', 'format=yuv420p'].join(',');
  return [...GLOBAL_ARGS, ...input, '-vf', chain, ...videoArgs(preset, timing), ...container];
}
