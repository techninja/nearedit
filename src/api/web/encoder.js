/**
 * FFmpeg at the end of the recorder: PNG frames in, one H.264 MP4 out.
 *
 * The settings are chosen for pages, which are mostly text: constant
 * quality 16 keeps small type crisp (see the measurements in the tests'
 * notes), `veryfast` keeps the encoder ahead of the browser, and a key
 * frame every half second lets the editor scrub the clip. The stream is
 * yuv420p, BT.709, limited range, square pixels — what browsers play and
 * what the renderer's own segments use.
 * @module api/web/encoder
 */

import { openEncoder } from '../render/canvas/pipes.js';
import { fpsRational } from '../render/timing.js';
import { WebError } from './errors.js';

export const CRF = 16;
export const X264_PRESET = 'veryfast';
/** Seconds between key frames. */
export const KEYFRAME_SECONDS = 0.5;

/**
 * @param {Buffer} png
 * @returns {{ width: number, height: number }} The picture's size, from its header
 * @throws {WebError} When the browser handed over something that is not a PNG
 */
export function pngSize(png) {
  if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47)
    throw new WebError(500, 'The browser did not return a picture for a frame');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/**
 * @param {{ fps: number, output: string }} how
 * @returns {string[]} FFmpeg arguments reading a stream of PNGs from stdin
 */
export function encoderArgs({ fps, output }) {
  const rate = fpsRational(fps);
  // yuv420p needs even sides; a viewport × scale that is odd loses its last column or row.
  const chain = [
    'crop=trunc(iw/2)*2:trunc(ih/2)*2:0:0',
    'scale=out_color_matrix=bt709:out_range=tv:flags=bicubic+accurate_rnd+full_chroma_int',
    'setsar=1',
    'format=yuv420p',
  ].join(',');
  const bt709 = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];
  return [
    ...['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-nostats'],
    ...['-f', 'image2pipe', '-c:v', 'png', '-framerate', rate.fpsText, '-i', 'pipe:0'],
    ...['-vf', chain, '-an', '-c:v', 'libx264', '-preset', X264_PRESET, '-crf', String(CRF)],
    ...['-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', rate.fpsText],
    ...['-g', String(Math.max(1, Math.round(rate.fps * KEYFRAME_SECONDS)))],
    ...bt709,
    ...[
      '-color_range',
      'tv',
      '-movflags',
      '+faststart',
      '-map_metadata',
      '-1',
      '-f',
      'mp4',
      output,
    ],
  ];
}

/**
 * Start the encoder for a recording.
 * @param {{ fps: number, output: string }} how
 * @returns {ReturnType<typeof openEncoder>}
 */
export function startEncoder(how) {
  return openEncoder(encoderArgs(how));
}
