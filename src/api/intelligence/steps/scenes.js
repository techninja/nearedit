/**
 * Scenes step — shot boundaries from FFmpeg's scene-change score. The result
 * always covers the whole file: N cuts give N + 1 back-to-back scenes.
 * @module api/intelligence/steps/scenes
 */

import { progressLines, round3 } from './types.js';

/** @typedef {import('./types.js').Step} Step */

export const SCENE_DEFAULTS = { threshold: 0.3, minLength: 0.3 };

/**
 * Read cut times from `metadata=print` output ("frame:0 pts:… pts_time:2").
 * @param {string} stdout
 * @returns {number[]}
 */
export function parseCuts(stdout) {
  const cuts = [];
  for (const match of stdout.matchAll(/pts_time:(-?[\d.]+)/g)) cuts.push(Number(match[1]));
  return cuts.filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
}

/**
 * Build contiguous scenes from cut times, ignoring cuts that would create a
 * scene shorter than `minLength` (flashes, the first/last frames).
 * @param {number[]} cuts - Seconds, ascending
 * @param {number} duration
 * @param {number} [minLength]
 * @returns {{ start: number, end: number }[]}
 */
export function buildScenes(cuts, duration, minLength = SCENE_DEFAULTS.minLength) {
  const edges = [0];
  for (const cut of cuts) {
    if (cut - edges[edges.length - 1] >= minLength && duration - cut >= minLength) edges.push(cut);
  }
  return edges.map((start, i) => ({
    start: round3(start),
    end: round3(i + 1 < edges.length ? edges[i + 1] : duration),
  }));
}

/** @type {Step} */
export const scenesStep = {
  name: 'scenes',
  jobType: 'scenes',

  unsuitable(type, sidecar) {
    if (type !== 'video') return `not applicable to ${type} files`;
    return sidecar?.hasVideo === false ? 'no video stream' : '';
  },

  done(sidecar, options) {
    if (!Array.isArray(sidecar?.scenes)) return false;
    return options.threshold === undefined || options.threshold === sidecar.sceneThreshold;
  },

  async run(filePath, ctx) {
    const threshold = ctx.options.threshold ?? SCENE_DEFAULTS.threshold;
    let duration = ctx.sidecar?.duration;
    if (!(duration > 0)) duration = (await ctx.deps.probe(filePath, { signal: ctx.signal }))?.duration;
    if (!(duration > 0)) throw new Error('Could not determine the video duration');

    // Output 1 prints the frames whose scene score passes the threshold.
    // Output 2 is a one-frame-per-second trickle whose only job is to make
    // FFmpeg's progress clock advance (output 1 emits almost nothing).
    const detect = `scale=320:-2,select='gt(scene,${threshold})',metadata=print:file=-`;
    const stream = ['-map', '0:v:0', '-an', '-sn', '-dn'];
    const args = ['-hide_banner', '-nostdin', '-nostats', '-progress', 'pipe:2', '-i', filePath];
    args.push(...stream, '-vf', detect, '-f', 'null', '-');
    args.push(...stream, '-vf', 'fps=1,scale=16:16', '-f', 'null', '-');
    const { stdout } = await ctx.deps.run('ffmpeg', args, {
      signal: ctx.signal,
      onStderr: progressLines(duration, ctx.progress),
    });
    return { scenes: buildScenes(parseCuts(stdout), duration), sceneThreshold: threshold };
  },

  summary: (patch) => ({ scenes: patch.scenes.length }),
};
