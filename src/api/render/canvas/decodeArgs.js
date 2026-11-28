/**
 * FFmpeg arguments that turn a file into the raw RGBA frames the compositor
 * is handed: footage frame by frame, a cutout file as its packed frames, a
 * still once. Rotation metadata is
 * applied by FFmpeg, non-square pixels are squared by the scale, and colour
 * is converted from the source's own matrix. Pure.
 * @module api/render/canvas/decodeArgs
 */

import { conformFilters, holdFilters, openInput } from '../conform.js';
import { filter } from '../expr.js';

const QUIET = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-nostats'];
const RAW = ['-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'];

/**
 * Scale to the decoded size and convert to RGBA in one step.
 * @param {{ width: number, height: number }} size
 * @param {import('../sources.js').SourceInfo} source
 * @param {import('../presets.js').RenderPreset} preset
 * @returns {string[]}
 */
function toRgba(size, source, preset) {
  const scale = filter('scale', {
    ...{ w: size.width, h: size.height, in_color_matrix: source.matrix || undefined },
    flags: `${preset.scaleFlags}+full_chroma_int`,
  });
  return [scale, 'setsar=1', 'format=rgba'];
}

/**
 * Decode a clip's part of a file as exactly the frames the output shows:
 * seek, pick frames with the shared rule (`conform.js`), hold the last one
 * if the source runs short, then scale and convert colour once.
 * @param {string} file
 * @param {{ seek: number, count: number }} window
 * @param {{ width: number, height: number }} size - Decoded frame size
 * @param {import('../sources.js').SourceInfo} source
 * @param {import('../videoGraph.js').GraphContext} ctx
 * @returns {string[]} Writes `count` RGBA frames to stdout
 */
export function decodeArgs(file, window, size, source, ctx) {
  const { timing, preset } = ctx;
  const { args, lead } = openInput(file, false, window, timing.fps);
  const chain = [
    ...conformFilters({ lead }, timing),
    ...holdFilters(window.count, timing.fps),
    ...toRgba(size, source, preset),
  ];
  return [...QUIET, ...args, '-map', '0:v:0', '-vf', chain.join(','), ...RAW];
}

/**
 * Decode a clip's part of its cutout file — the picture on the left, its
 * matte on the right — as the frames the output shows. The two halves are
 * cut apart, reduced each on its own and put side by side again, so that
 * no pixel of the matte is ever mixed into the picture's edge, or of the
 * picture into the matte's.
 * @param {string} file - The cutout file
 * @param {{ seek: number, count: number }} window - `seek` in the cutout file's own time
 * @param {{ width: number, height: number }} size - Decoded size of the
 *   picture: the frames are twice as wide
 * @param {import('../sources.js').SourceInfo} source - Of the cutout file
 * @param {import('../videoGraph.js').GraphContext} ctx
 * @returns {string[]} Writes `count` RGBA frames, `2 × width` by `height`, to stdout
 */
export function cutoutDecodeArgs(file, window, size, source, ctx) {
  const { timing, preset } = ctx;
  const { args, lead } = openInput(file, false, window, timing.fps);
  const picked = [...conformFilters({ lead }, timing), ...holdFilters(window.count, timing.fps)];
  const [scale, squared] = toRgba(size, source, preset);
  const side = (/** @type {string} */ x) => `crop=iw/2:ih:${x}:0,${scale},${squared}`;
  const graph =
    `${picked.join(',')},split[a][b];[a]${side('0')}[left];[b]${side('iw/2')}[right];` +
    '[left][right]hstack=inputs=2,format=rgba';
  return [...QUIET, ...args, '-map', '0:v:0', '-vf', graph, ...RAW];
}

/**
 * Decode a still at a reduced size.
 * @param {string} file
 * @param {{ width: number, height: number }} size
 * @param {import('../sources.js').SourceInfo} source
 * @param {import('../videoGraph.js').GraphContext} ctx
 * @returns {string[]} Writes one RGBA frame to stdout
 */
export function stillArgs(file, size, source, ctx) {
  const { args } = openInput(file, true, { seek: 0, count: 1 }, ctx.timing.fps);
  const chain = toRgba(size, source, ctx.preset).join(',');
  return [...QUIET, ...args, '-map', '0:v:0', '-frames:v', '1', '-vf', chain, ...RAW];
}
