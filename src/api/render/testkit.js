/**
 * Helpers for the render integration tests: generate tiny sources with
 * FFmpeg's lavfi, render an EDL through the real plan, and read the result
 * back as raw pixels and samples so tests assert numbers, not impressions.
 * @module api/render/testkit
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClip, createEdl, createTrack } from '#utils/edl/factory.js';
import { run } from '../lib/ffmpeg.js';
import { getCapabilities } from './capabilities.js';
import { buildRenderPlan, renderSources } from './plan.js';
import { probeSources } from './probe.js';

export { createClip, createEdl, createTrack };

const QUIET = ['-hide_banner', '-loglevel', 'error', '-y'];
export const RATE = 48000;

/**
 * Create a scratch directory and return it with its cleanup.
 * @param {string} [name]
 * @returns {{ dir: string, cleanup: () => void }}
 */
export function scratch(name = 'nearedit-render-') {
  const dir = mkdtempSync(join(tmpdir(), name));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * Generate a media file from lavfi sources.
 * @param {string} path - Output file
 * @param {string[]} sources - lavfi graphs, e.g. "color=red:s=320x180:r=30:d=3"
 * @param {string[]} [options] - Output options placed before the path
 * @returns {Promise<string>} The path
 */
export async function generate(path, sources, options = []) {
  const inputs = sources.flatMap((source) => ['-f', 'lavfi', '-i', source]);
  const video = path.endsWith('.mp4') ? ['-c:v', 'libx264', '-pix_fmt', 'yuv420p'] : [];
  await run('ffmpeg', [...QUIET, ...inputs, ...video, ...options, path]);
  return path;
}

/**
 * Render an EDL for real: probe, plan, write the plan's files, run FFmpeg.
 * @param {object} edl
 * @param {string} dir - Scratch directory; each render gets its own subfolder
 * @param {object} [options] - Extra plan options (preset, range, capabilities)
 * @returns {Promise<{ output: string, plan: import('./plan.js').RenderPlan }>}
 */
export async function render(edl, dir, options = {}) {
  const workDir = mkdtempSync(join(dir, 'work-'));
  mkdirSync(workDir, { recursive: true });
  const probes = await probeSources(renderSources(edl));
  const capabilities = await getCapabilities();
  const output = join(workDir, 'out.mp4');
  const plan = buildRenderPlan(edl, {
    ...{ probes, capabilities, workDir, outputPath: output },
    ...options,
  });
  for (const file of plan.files) writeFileSync(file.path, file.content);
  await run('ffmpeg', plan.args);
  return { output, plan };
}

/**
 * Decode a video into raw RGB and return a pixel reader.
 * @param {string} file
 * @param {number} width
 * @param {number} height
 * @returns {Promise<{ count: number, at: (frame: number, x: number, y: number) => number[],
 *   box: (frame: number, test: (rgb: number[]) => boolean) => number[] | null }>}
 *   `box` is the bounding box [x0, y0, x1, y1] of the pixels passing a test
 */
export async function readFrames(file, width, height) {
  const args = [...QUIET, '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'];
  const { stdout } = await run('ffmpeg', args, { binary: true });
  const size = width * height * 3;
  const at = (frame, x, y) => {
    const i = frame * size + (y * width + x) * 3;
    return [stdout[i], stdout[i + 1], stdout[i + 2]];
  };
  const box = (frame, test) => {
    let found = null;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!test(at(frame, x, y))) continue;
        found = found ? [Math.min(found[0], x), found[1], Math.max(found[2], x), y] : [x, y, x, y];
      }
    }
    return found;
  };
  return { count: stdout.length / size, at, box };
}

/**
 * Decode the audio of a file into float samples.
 * @param {string} file
 * @returns {Promise<{ left: Float32Array, right: Float32Array }>}
 */
export async function readAudio(file) {
  const args = [...QUIET, '-i', file, '-vn', '-f', 'f32le', '-ac', '2', '-ar', String(RATE), '-'];
  const { stdout } = await run('ffmpeg', args, { binary: true });
  const all = new Float32Array(stdout.buffer, stdout.byteOffset, stdout.length / 4);
  return { left: all.filter((_, i) => i % 2 === 0), right: all.filter((_, i) => i % 2 === 1) };
}

/**
 * Amplitude of one frequency in a stretch of samples (single-bin DFT).
 * @param {Float32Array} samples
 * @param {number} frequency - Hz
 * @param {number} from - Seconds
 * @param {number} to - Seconds
 * @returns {number} Peak amplitude of that sine component
 */
export function tone(samples, frequency, from, to) {
  const a = Math.round(from * RATE);
  const b = Math.min(samples.length, Math.round(to * RATE));
  let sin = 0;
  let cos = 0;
  for (let i = a; i < b; i++) {
    const phase = (2 * Math.PI * frequency * i) / RATE;
    sin += samples[i] * Math.sin(phase);
    cos += samples[i] * Math.cos(phase);
  }
  return (2 * Math.hypot(sin, cos)) / Math.max(1, b - a);
}

/**
 * ffprobe a rendered file.
 * @param {string} file
 * @returns {Promise<{ video: any, audio: any, duration: number }>}
 */
export async function inspect(file) {
  const args = ['-v', 'error', '-show_streams', '-show_format', '-count_frames', '-of', 'json'];
  const { stdout } = await run('ffprobe', [...args, file]);
  const data = JSON.parse(stdout);
  const stream = (type) => data.streams.find((s) => s.codec_type === type);
  return { video: stream('video'), audio: stream('audio'), duration: Number(data.format.duration) };
}
