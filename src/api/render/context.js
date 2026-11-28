/**
 * Shared state of one FFmpeg pass while its graph is being built: timing,
 * sizes, the inputs and files collected so far, and source lookups. Pure.
 * @module api/render/context
 */

import { parseResolution } from '#utils/edl/factory.js';
import { RenderError } from './errors.js';
import { outputSize } from './presets.js';
import { documentNeeds } from './route.js';
import { checkRenderable } from './scope.js';
import { describeSource } from './sources.js';
import { snapTrack } from './timing.js';

/**
 * @typedef {Object} PlanOptions
 * @property {Record<string, any>} [probes] - Probe result per source file path
 * @property {string} [preset] - Preset id (default "standard")
 * @property {{ start?: number, end?: number } | null} [range] - Seconds; omit for everything
 * @property {string} [outputPath]
 * @property {string} [workDir] - Directory for the graph script. When given,
 *   the graph is passed as a script file instead of an argument
 * @property {{ graphFlag?: string, limiterLatency?: boolean }} [capabilities] - What
 *   this FFmpeg can do (default: 6.1+)
 * @property {'av'|'video'} [streams] - "video" leaves the sound out (a segment of a long render)
 * @property {string} [graphName] - File name of the graph script inside workDir
 * @property {import('./route.js').EngineChoice} [engine] - Overrides `RENDER_ENGINE`
 * @property {boolean} [lossless] - Tests only: encode canvas segments without
 *   loss (RGB), so decoded frames can be compared bit for bit
 * @property {import('./words.js').WordTable} [words] - Transcripts of the
 *   captioned clips' files (`prepareRender`): what the captions are drawn from
 */

export const GLOBAL_ARGS = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-nostats'];
export const PROGRESS_ARGS = ['-progress', 'pipe:2', '-stats_period', '0.5'];

/**
 * @param {{ fps?: number, resolution?: string, tracks?: any[], background?: string }} edl
 * @param {PlanOptions} [options]
 * @returns {import('./videoGraph.js').GraphContext & { tracks: any[],
 *   graphArgs: (filterComplex: string) => string[] }}
 * @throws {RenderError} 422 when there is nothing to render; `source()`
 *   throws 422 for a file that has no probe
 */
export function createContext(edl, options = {}) {
  const { preset, timing } = checkRenderable(edl, options);
  const frame = parseResolution(edl.resolution);
  const { graphFlag, limiterLatency = true } = options.capabilities || {};
  const workDir = options.workDir || '';
  const sources = new Map();
  const files = [];
  return {
    ...{ timing, frame, preset, workDir, files, limiterLatency },
    out: outputSize(frame, preset),
    needs: documentNeeds(edl),
    tracks: (edl.tracks || []).map((track) => snapTrack(track, timing)),
    inputs: [],
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
    // Long graphs go to a script file: no argv limit, and easy to inspect.
    graphArgs(filterComplex) {
      if (!workDir) return ['-filter_complex', filterComplex];
      const path = `${workDir}/${options.graphName || 'graph.txt'}`;
      files.push({ path, content: filterComplex });
      return [graphFlag || '-filter_complex_script', path];
    },
  };
}
