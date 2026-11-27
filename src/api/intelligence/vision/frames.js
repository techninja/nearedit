/**
 * Choosing and extracting the frames that represent a file for tagging.
 * @module api/intelligence/vision/frames
 */

import { round3 } from '../steps/types.js';

const LONG_SIDE = 768; // plenty for llava-class models, keeps requests small

/**
 * Pick up to `count` timestamps. Detected scenes come first — one frame a
 * little after the start of each (longest scenes when there are too many) —
 * and any remaining slots are spread evenly over the file.
 * @param {{ duration: number, scenes?: { start: number, end: number }[]|null, count?: number }} input
 * @returns {number[]} Ascending times in seconds
 */
export function pickFrameTimes({ duration, scenes, count = 5 }) {
  if (!(duration > 0)) return [0];
  const times = [];
  const valid = (scenes || []).filter((s) => s.end > s.start);
  if (valid.length > 1) {
    const longest = [...valid].sort((a, b) => b.end - b.start - (a.end - a.start)).slice(0, count);
    for (const scene of longest) {
      // Just inside the shot: clear of the cut, but still its opening moment.
      times.push(scene.start + Math.min(0.5, (scene.end - scene.start) / 4));
    }
  }
  const spacing = duration / count;
  for (let i = 0; i < count && times.length < count; i++) {
    const time = (i + 0.5) * spacing;
    if (times.every((t) => Math.abs(t - time) >= spacing / 2)) times.push(time);
  }
  return times
    .map((t) => round3(Math.min(t, Math.max(0, duration - 0.05))))
    .sort((a, b) => a - b);
}

/**
 * Grab one frame as a JPEG, scaled so its long side is at most 768 px.
 * @param {import('../steps/types.js').Deps['run']} run
 * @param {string} filePath
 * @param {number|null} time - Seconds; null for still images
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<Buffer>}
 */
export async function extractFrame(run, filePath, time, options = {}) {
  const fit = `if(gt(iw,ih),min(${LONG_SIDE},iw),-2)`;
  const fitHeight = `if(gt(iw,ih),-2,min(${LONG_SIDE},ih))`;
  const args = ['-v', 'error', '-nostdin'];
  if (time !== null && time > 0) args.push('-ss', String(time));
  args.push('-i', filePath, '-map', '0:v:0', '-frames:v', '1');
  args.push('-vf', `scale='${fit}':'${fitHeight}'`, '-q:v', '4');
  args.push('-f', 'image2pipe', '-c:v', 'mjpeg', '-');
  const { stdout } = await run('ffmpeg', args, { signal: options.signal, binary: true });
  if (!stdout?.length) throw new Error(`No frame could be read at ${time ?? 0}s`);
  return stdout;
}
