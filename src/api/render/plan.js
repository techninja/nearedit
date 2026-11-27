/**
 * The render plan: EDL → FFmpeg arguments and filter graph. No I/O happens
 * here — sources are described by the probes passed in and files the graph
 * needs (title text, the graph script) are returned for the caller to write.
 * @module api/render/plan
 */

import { clipKind, parseResolution } from '#utils/edl/factory.js';
import { activeTracks } from '#utils/edl/query.js';
import { buildAudioGraph } from './audioGraph.js';
import { RenderError } from './errors.js';
import { encodeArgs, getPreset, outputSize } from './presets.js';
import { describeSource } from './sources.js';
import { createTiming, snapTrack } from './timing.js';
import { buildVideoGraph } from './videoGraph.js';

/**
 * @typedef {Object} PlanOptions
 * @property {Record<string, any>} [probes] - Probe result per source file path
 * @property {string} [preset] - Preset id (default "standard")
 * @property {{ start?: number, end?: number } | null} [range] - Seconds; omit for everything
 * @property {string} [outputPath]
 * @property {string} [workDir] - Directory for the graph script and title text.
 *   When given, the graph is passed as a script file instead of an argument
 * @property {import('./title.js').TextSupport & { graphFlag?: string }} [capabilities]
 * @typedef {Object} RenderPlan
 * @property {string[]} args - Complete FFmpeg argument list
 * @property {string} filterComplex
 * @property {number} duration - Seconds of output
 * @property {{ index: number, file: string, kind: string, clipId: string, args: string[] }[]} inputs
 * @property {{ path: string, content: string }[]} files - To write before running
 * @property {string[]} warnings - Things the render could not honour
 * @property {number} width
 * @property {number} height
 * @property {number} fps
 * @property {number} frames
 */

const GLOBAL_ARGS = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-nostats'];
const PROGRESS_ARGS = ['-progress', 'pipe:2', '-stats_period', '0.5'];
const MODERN = { drawtext: true, textAlign: true, fontconfig: true };

/**
 * Clips that produce picture or sound: on a track that is not muted (or is
 * solo), and not a placeholder.
 * @param {{ tracks?: any[] }} edl
 * @returns {{ clip: any, track: any, kind: string }[]}
 */
export function renderableClips(edl) {
  const tracks = edl?.tracks || [];
  const active = [...activeTracks(tracks, 'video'), ...activeTracks(tracks, 'audio')];
  return active.flatMap((track) =>
    (track.clips || [])
      .map((clip) => ({ clip, track, kind: clipKind(clip, track) }))
      .filter(({ clip, kind }) => kind !== 'placeholder' && clip.timelineEnd > clip.timelineStart)
      .filter(({ kind }) => track.type !== 'audio' || kind !== 'title'),
  );
}

/**
 * Source files a render reads.
 * @param {{ tracks?: any[] }} edl
 * @returns {string[]} Unique paths
 */
export function renderSources(edl) {
  const files = renderableClips(edl).map(({ clip }) => clip.sourceFile);
  return [...new Set(files.filter(Boolean))];
}

/**
 * Resolve the preset and the rendered span, refusing what cannot be rendered.
 * @param {{ fps?: number, tracks?: any[] }} edl
 * @param {{ preset?: string, range?: { start?: number, end?: number } | null }} [options]
 * @returns {{ preset: import('./presets.js').RenderPreset, timing: import('./timing.js').Timing }}
 * @throws {RenderError} 422 for an unknown preset, an empty timeline or an empty range
 */
export function checkRenderable(edl, options = {}) {
  const preset = getPreset(options.preset);
  if (!preset) throw new RenderError(422, `Unknown preset "${options.preset}"`);
  const timing = createTiming(edl, options.range);
  if (!timing.totalFrames || !renderableClips(edl).length)
    throw new RenderError(422, 'Timeline is empty: there is nothing to render');
  if (!timing.frames) throw new RenderError(422, 'Range is outside the timeline');
  return { preset, timing };
}

/**
 * Build the plan for an EDL.
 * @param {{ fps?: number, resolution?: string, tracks?: any[] }} edl
 * @param {PlanOptions} [options]
 * @returns {RenderPlan}
 * @throws {RenderError} 422 for an unknown preset, an empty timeline or range,
 *   or a source without a probe
 */
export function buildRenderPlan(edl, options = {}) {
  const { preset, timing } = checkRenderable(edl, options);
  const frame = parseResolution(edl.resolution);
  const { graphFlag, ...text } = { ...MODERN, ...options.capabilities };
  const sources = new Map();
  const ctx = {
    ...{ timing, frame, preset, text },
    out: outputSize(frame, preset),
    workDir: options.workDir || '',
    inputs: [],
    files: [],
    warnings: [],
    source(file) {
      if (!sources.has(file)) {
        const probe = options.probes?.[file];
        if (!probe)
          throw new RenderError(422, `Cannot read source file: ${file}`, { detail: file });
        sources.set(file, describeSource(probe));
      }
      return sources.get(file);
    },
  };
  const tracks = (edl.tracks || []).map((track) => snapTrack(track, timing));
  const video = buildVideoGraph(tracks, ctx);
  const audio = buildAudioGraph(tracks, ctx);
  const filterComplex = [...video.chains, ...audio.chains].join(';\n');

  const args = [...GLOBAL_ARGS, ...PROGRESS_ARGS, ...ctx.inputs.flatMap((input) => input.args)];
  if (ctx.workDir) {
    const path = `${ctx.workDir}/graph.txt`;
    ctx.files.push({ path, content: filterComplex });
    args.push(graphFlag || '-filter_complex_script', path);
  } else {
    args.push('-filter_complex', filterComplex);
  }
  args.push('-map', '[vout]', '-map', '[aout]', ...encodeArgs(preset, timing));
  args.push(options.outputPath || 'output.mp4');
  return {
    ...{ args, filterComplex, duration: timing.duration },
    inputs: ctx.inputs.map((input, index) => ({ index, ...input })),
    files: ctx.files,
    warnings: ctx.warnings,
    ...{ width: ctx.out.width, height: ctx.out.height, fps: timing.fps, frames: timing.frames },
  };
}
