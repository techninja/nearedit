/**
 * The plan of one canvas segment: the document as the compositor will see
 * it, the footage to decode (one FFmpeg per clip, at the size it is shown
 * at; the cutout file of a clip drawn through its matte in place of its
 * own), the stills to load — large ones reduced by FFmpeg first — and the
 * encoder to pipe frames into. No I/O
 * happens here, and the result is plain data. Pure.
 * Reference: docs/app-spec/RENDER.md § The canvas path.
 * @module api/render/canvas/plan
 */

import { layerKind } from '#utils/compose/layers.js';
import { requirements } from '#utils/compose/requirements.js';
import { cutoutState } from '#utils/cutout/index.js';
import { activeTracks } from '#utils/edl/query.js';
import { createContext } from '../context.js';
import { clipWindow } from '../timing.js';
import { cutoutDecodeArgs, decodeArgs, stillArgs } from './decodeArgs.js';
import { encodeArgs } from './encodeArgs.js';
import { decodeSize } from './sizes.js';

/**
 * @typedef {Object} Footage - One clip's frames, decoded by its own FFmpeg
 * @property {string} clipId
 * @property {string} file
 * @property {number} first - Timeline frame of its first frame in this segment
 * @property {number} count - Frames it is on screen for in this segment
 * @property {number} width - Size of the decoded frames
 * @property {number} height
 * @property {string[]} args - FFmpeg arguments; writes `count` RGBA frames to stdout
 * @typedef {Object} Still - A still that is shown smaller than it is
 * @property {string} file
 * @property {number} width - Size it is decoded at
 * @property {number} height
 * @property {string[]} args - FFmpeg arguments; writes one RGBA frame to stdout
 * @typedef {Object} CanvasPlan
 * @property {any} doc - The document with its clips on the frame grid
 * @property {number} width - Canvas (and output) size
 * @property {number} height
 * @property {number} fps
 * @property {number} startFrame - Timeline frame of the first frame drawn
 * @property {number} frames - Frames to draw
 * @property {Footage[]} footage
 * @property {string[]} images - Stills and sprites the segment draws
 * @property {Still[]} stills - Those of them FFmpeg reduces first
 * @property {string[]} encoderArgs - FFmpeg arguments; reads RGBA frames from stdin
 * @property {string} output
 */

/**
 * The frames of a clip that is drawn through its matte: its cutout file,
 * decoded as packed frames — the picture at the size the clip is shown at,
 * its matte beside it — from the frame that belongs to the clip's first.
 * @param {any} clip - Snapped; its cutout is ready
 * @param {import('../videoGraph.js').GraphContext} ctx
 * @param {{ width: number, height: number }} out - Canvas size
 * @returns {Footage}
 */
function cutoutFootage(clip, ctx, out) {
  const { made } = clip.cutout;
  const packed = ctx.source(made.file);
  const picture = { width: packed.width / 2, height: packed.height };
  const size = decodeSize(clip, picture, ctx.frame, out);
  const { first, count, seek } = clipWindow(clip, ctx.timing);
  const window = { count, seek: Math.max(0, seek - made.start) };
  const args = cutoutDecodeArgs(made.file, window, size, packed, ctx);
  const frame = { width: size.width * 2, height: size.height };
  return { clipId: clip.clipId, file: made.file, first, count, ...frame, args };
}

/**
 * @param {any[]} tracks - Snapped tracks
 * @param {import('../videoGraph.js').GraphContext} ctx
 * @param {{ width: number, height: number }} out - Canvas size
 * @param {(file: string) => boolean} probed - Whether a file has a probe
 * @returns {{ footage: Footage[], stills: Still[], images: string[] }} What
 *   the visible clips inside the rendered range read
 */
function segmentMedia(tracks, ctx, out, probed) {
  /** @type {Footage[]} */
  const footage = [];
  /** @type {Map<string, Still>} */
  const stills = new Map();
  const shown = [];
  for (const track of activeTracks(tracks, 'video')) {
    const clips = track.clips.filter((clip) => clipWindow(clip, ctx.timing));
    shown.push({ ...track, clips });
    for (const clip of clips) {
      const kind = layerKind(clip, track);
      const file = clip.sourceFile;
      // A clip whose cutout is ready plays its cutout file; any other, its own.
      const matted = kind === 'video' && cutoutState(clip, ctx.timing.fps) === 'ready';
      if (matted && probed(clip.cutout.made.file)) {
        footage.push(cutoutFootage(clip, ctx, out));
        continue;
      }
      // Footage must have been probed; a still without a probe is simply not reduced.
      const wanted = kind === 'video' || (kind === 'image' && probed(file));
      const source = wanted ? ctx.source(file) : null;
      // A file without a picture (sound dropped on a video track) draws nothing.
      if (!source?.hasVideo) continue;
      const size = decodeSize(clip, source, ctx.frame, out);
      if (kind === 'video') {
        const window = clipWindow(clip, ctx.timing);
        const args = decodeArgs(file, window, size, source, ctx);
        const { first, count } = window;
        footage.push({ clipId: clip.clipId, file, first, count, ...size, args });
      } else if (size.width < source.width && !(stills.get(file)?.width >= size.width)) {
        // A still shown smaller than it is: FFmpeg reduces it, at its largest use.
        stills.set(file, { file, ...size, args: stillArgs(file, size, source, ctx) });
      }
    }
  }
  return { footage, stills: [...stills.values()], images: requirements({ tracks: shown }).images };
}

/**
 * Build the plan of a canvas segment.
 * @param {{ fps?: number, resolution?: string, tracks?: any[] }} edl
 * @param {import('../context.js').PlanOptions & {
 *   size?: { width: number, height: number } }} [options] - `range` is the
 *   segment; `size` replaces the preset's output size (a single frame at
 *   another width)
 * @returns {CanvasPlan}
 * @throws {import('../errors.js').RenderError} 422 for an unknown preset, an
 *   empty range, or footage without a probe
 */
export function buildCanvasPlan(edl, options = {}) {
  const ctx = createContext(edl, options);
  const { timing } = ctx;
  const out = options.size || ctx.out;
  const output = options.outputPath || 'segment.mp4';
  return {
    doc: { ...edl, tracks: ctx.tracks },
    ...{ width: out.width, height: out.height, fps: timing.fps },
    ...{ startFrame: timing.startFrame, frames: timing.frames },
    ...segmentMedia(ctx.tracks, ctx, out, (file) => Boolean(options.probes?.[file])),
    encoderArgs: encodeArgs({ ...out, timing, preset: ctx.preset, output }, options.lossless),
    output,
  };
}
