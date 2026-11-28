/**
 * Pictures for the cutout tests: videos whose frames say their own number,
 * and readers that turn a video back into pixels — plainly, or as the
 * renderer decodes footage. Not a test file itself.
 * @module tests/cutout/pixels
 */

import { execFileSync } from 'node:child_process';
import { decodeArgs } from '../../src/api/render/canvas/decodeArgs.js';
import { getPreset } from '../../src/api/render/presets.js';
import { probeSource } from '../../src/api/render/probe.js';
import { describeSource } from '../../src/api/render/sources.js';
import { fpsRational } from '../../src/api/render/timing.js';

const MAX_BUFFER = 1 << 30;

/** @param {string[]} args @returns {Buffer} What FFmpeg wrote to stdout */
export function ffmpeg(args) {
  const quiet = ['-v', 'error', '-nostdin', '-y'];
  return execFileSync('ffmpeg', [...quiet, ...args], { maxBuffer: MAX_BUFFER });
}

/** Where the eight bits of a frame's number are drawn: `x` of bit k is 8 + 28 k. */
const BIT = { y: 8, side: 24, step: 28 };

/**
 * A video whose frames carry their own number as a row of white squares
 * (bit 0 leftmost) on black, over grey, with a white block that hops along
 * the bottom — so a frame can be read back, and bright and dark are known.
 * @param {string} file
 * @param {{ fps?: number, frames?: number, width?: number, height?: number }} [how]
 * @returns {string} The file
 */
export function numbered(file, { fps = 30, frames = 60, width = 320, height = 180 } = {}) {
  const boxes = ['drawbox=x=0:y=0:w=240:h=40:color=black:t=fill'];
  for (let k = 0; k < 8; k++) {
    const on = `eq(mod(floor(n/${2 ** k}),2),1)`;
    const box = `x=${8 + k * BIT.step}:y=${BIT.y}:w=${BIT.side}:h=${BIT.side}`;
    boxes.push(`drawbox=${box}:color=white:t=fill:enable='${on}'`);
  }
  for (let k = 0; k < 6; k++)
    boxes.push(
      `drawbox=x=${10 + k * 50}:y=110:w=40:h=40:color=white:t=fill:enable='eq(mod(n,6),${k})'`,
    );
  const source = `color=c=0x505050:s=${width}x${height}:r=${fps}:d=${frames / fps}`;
  const h264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-g', '12'];
  ffmpeg([
    '-f',
    'lavfi',
    '-i',
    source,
    '-vf',
    boxes.join(','),
    ...h264,
    '-pix_fmt',
    'yuv420p',
    file,
  ]);
  return file;
}

/**
 * Read the number a `numbered` frame carries.
 * @param {Buffer} pixels - One frame
 * @param {number} width - Of the frame in the buffer
 * @param {number} [bytes=3] - Per pixel
 * @returns {number}
 */
export function frameNumber(pixels, width, bytes = 3) {
  let n = 0;
  for (let k = 0; k < 8; k++) {
    const at = ((BIT.y + BIT.side / 2) * width + 8 + k * BIT.step + BIT.side / 2) * bytes;
    if (pixels[at + 1] >= 128) n += 2 ** k;
  }
  return n;
}

/**
 * Every frame of a video as RGB.
 * @param {string} file
 * @param {number} frameBytes - `width × height × 3` of the file
 * @returns {Buffer[]}
 */
export function decodeAll(file, frameBytes) {
  const raw = ffmpeg(['-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  return Array.from({ length: Math.floor(raw.length / frameBytes) }, (_, n) =>
    raw.subarray(n * frameBytes, (n + 1) * frameBytes),
  );
}

/**
 * Take a frame of a cutout file apart.
 * @param {Buffer} packed - `2 × width` wide
 * @param {number} width - Of the picture
 * @param {number} height
 * @param {number} [bytes=3] - Per pixel of `packed`: 3 for RGB, 4 for RGBA
 * @returns {{ picture: Buffer, matte: Buffer }} The left half as RGB, and the
 *   right half as one byte a pixel
 */
export function halves(packed, width, height, bytes = 3) {
  const picture = Buffer.alloc(width * height * 3);
  const matte = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width * 2 + x) * bytes;
      packed.copy(picture, (y * width + x) * 3, at, at + 3);
      matte[y * width + x] = packed[at + width * bytes + 1];
    }
  }
  return { picture, matte };
}

/**
 * How alike two pictures are.
 * @param {Buffer} a - RGB
 * @param {Buffer} b - RGB, or RGBA when `bytes` is 4
 * @param {number} [bytes=3] - Per pixel of `b`
 * @returns {number} Peak signal-to-noise ratio, decibels
 */
export function psnr(a, b, bytes = 3) {
  let error = 0;
  for (let i = 0, j = 0; i < a.length; i += 3, j += bytes) {
    for (let c = 0; c < 3; c++) error += (a[i + c] - b[j + c]) ** 2;
  }
  return error ? 10 * Math.log10((255 * 255 * a.length) / error) : Infinity;
}

/**
 * The frames the renderer's canvas path shows for a stretch of a file: its
 * own probe, its own description of the source and its own decode
 * (`render/canvas/decodeArgs.js`).
 * @param {string} file
 * @param {{ seek: number, count: number, fps: number, width: number, height: number }} what
 * @returns {Promise<Buffer[]>} RGBA frames
 */
export async function renderFrames(file, { seek, count, fps, width, height }) {
  const ctx = /** @type {any} */ ({ timing: fpsRational(fps), preset: getPreset('standard') });
  const source = describeSource(await probeSource(file));
  const args = decodeArgs(file, { seek, count }, { width, height }, source, ctx);
  const raw = execFileSync('ffmpeg', args, { maxBuffer: MAX_BUFFER });
  const size = width * height * 4;
  return Array.from({ length: raw.length / size }, (_, n) =>
    raw.subarray(n * size, (n + 1) * size),
  );
}
