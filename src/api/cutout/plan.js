/**
 * The plan of one cutout: the size of its picture and the FFmpeg arguments
 * of the two ends of the pipeline. Both ends open the media file the same
 * way and pick frames with the renderer's own rule (`render/conform.js`), so
 * frame `n` of the cutout is the frame a render shows at `start + n / fps`
 * — the decoder hands it to the matte program, the packer puts it beside
 * the matte that comes back. Pure.
 *
 * The file: H.264 High, yuv420p, limited range, `2 × width` by `height`,
 * the picture on the left and its matte on the right (white = person),
 * constant frame rate, a key frame every half second so it scrubs, no
 * sound. CRF 16 `veryfast` — the setting web recordings use: 44 to 45 dB
 * against the source as the renderer decodes it. The picture keeps the
 * colour matrix of its source when that is BT.601 (the file is tagged so):
 * converting a 4:2:0 picture to BT.709 costs it 6 dB along coloured edges.
 * The matte is softened a little (`matteSmoothing`).
 * @module api/cutout/plan
 */

import { conformFilters, holdFilters, openInput } from '../render/conform.js';
import { filter, num } from '../render/expr.js';
import { describeSource } from '../render/sources.js';
import { fpsRational } from '../render/timing.js';

/** The picture of a cutout is never larger than this: twice as wide a video still plays everywhere. */
export const MAX_WIDTH = 1920;
export const MAX_HEIGHT = 1080;
export const CRF = 16;
export const X264_PRESET = 'veryfast';
/** Seconds between key frames. */
export const KEYFRAME_SECONDS = 0.5;

const QUIET = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-nostats'];
const RAW_RGB = ['-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'];
/** FFmpeg's name for each matrix a cutout file may be in. */
const COLORSPACE = { bt709: 'bt709', bt601: 'smpte170m' };
/** The standard preset's scaler, as the compositor's footage is decoded. */
const SCALE_FLAGS = 'bicubic+accurate_rnd+full_chroma_int';

/**
 * @typedef {Object} CutoutPlan
 * @property {number} width - Of the picture; the file is twice as wide
 * @property {number} height
 * @property {number} frameBytes - One RGB frame for the matte program
 * @property {number} matteBytes - One matte back
 * @property {{ cmd: string, args: string[] }} decoder - Writes `frames` RGB frames to stdout
 * @property {(output: string) => { cmd: string, args: string[] }} packer - Reads
 *   the mattes from stdin and writes the cutout file
 */

/**
 * The size of a cutout's picture: the size the source is shown at, reduced
 * to fit 1920 × 1080, with even sides.
 * @param {{ width: number, height: number }} shown - Displayed size of the source
 * @returns {{ width: number, height: number }}
 */
export function pictureSize(shown) {
  const scale = Math.min(1, MAX_WIDTH / shown.width, MAX_HEIGHT / shown.height);
  const even = (/** @type {number} */ side) => Math.max(2, Math.round((side * scale) / 2) * 2);
  return { width: even(shown.width), height: even(shown.height) };
}

/**
 * How much the matte is blurred before it is packed, in pixels (a Gaussian's
 * sigma): a matte made at 512 on the long side and enlarged shows the
 * corners of that enlargement along slanted edges; a blur of a third of the
 * enlargement rounds them off and moves no edge.
 * @param {{ width: number, height: number }} size - Of the picture
 * @returns {number} 0 for a picture no larger than the matte was made at
 */
export function matteSmoothing(size) {
  const enlarged = Math.max(size.width, size.height) / 512;
  return enlarged > 1 ? Math.round((enlarged / 3) * 100) / 100 : 0;
}

/**
 * @param {Object} what
 * @param {string} what.file - The media file
 * @param {any} what.probe - `render/probe.js` `probeSource` of it
 * @param {number} what.start - Seconds into the file, on the frame grid
 * @param {number} what.frames
 * @param {number} what.fps
 * @returns {CutoutPlan}
 */
export function planCutout({ file, probe, start, frames, fps }) {
  const source = describeSource(probe);
  const timing = fpsRational(fps);
  const size = pictureSize(source);
  const { args: input, lead } = openInput(file, false, { seek: start, count: frames }, timing.fps);
  const pick = [...conformFilters({ lead }, timing), ...holdFilters(frames, timing.fps)];
  const scale = { w: size.width, h: size.height, in_color_matrix: source.matrix || undefined };
  const toRgb = [filter('scale', { ...scale, flags: SCALE_FLAGS }), 'setsar=1', 'format=rgb24'];
  const matrix = source.matrix === 'bt601' ? 'bt601' : 'bt709';
  const yuv = { out_color_matrix: matrix, out_range: 'tv', flags: SCALE_FLAGS };
  const picture = [...pick, filter('scale', { ...scale, ...yuv }), 'setsar=1', 'format=yuv420p'];
  const sigma = matteSmoothing(size);
  const matte = [
    ...(sigma ? [filter('gblur', { sigma: num(sigma, 2), steps: 2 })] : []),
    ...['scale=in_range=pc:out_range=tv', 'setsar=1', 'format=yuv420p'],
  ];
  const graph = `[0:v:0]${picture.join(',')}[p];[1:v:0]${matte.join(',')}[m];[p][m]hstack=inputs=2:shortest=1[v]`;
  const mattes = [
    '-f',
    'rawvideo',
    '-pix_fmt',
    'gray',
    '-video_size',
    `${size.width}x${size.height}`,
  ];
  const colour = [
    '-colorspace',
    COLORSPACE[matrix],
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
  ];
  const encode = [
    ...['-map', '[v]', '-an', '-c:v', 'libx264', '-preset', X264_PRESET, '-crf', String(CRF)],
    ...['-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', timing.fpsText],
    ...['-g', String(Math.max(1, Math.round(timing.fps * KEYFRAME_SECONDS)))],
    ...[...colour, '-color_range', 'tv', '-movflags', '+faststart', '-map_metadata', '-1'],
  ];
  return {
    ...size,
    frameBytes: size.width * size.height * 3,
    matteBytes: size.width * size.height,
    decoder: {
      cmd: 'ffmpeg',
      args: [...QUIET, ...input, '-map', '0:v:0', '-vf', [...pick, ...toRgb].join(','), ...RAW_RGB],
    },
    packer: (output) => ({
      cmd: 'ffmpeg',
      args: [
        ...[...QUIET, '-y', ...input, ...mattes, '-framerate', timing.fpsText, '-i', 'pipe:0'],
        ...['-filter_complex', graph, ...encode, '-f', 'mp4', output],
      ],
    }),
  };
}
