#!/usr/bin/env node

/**
 * A matte program for tests: it speaks the cutout worker's protocol — raw
 * RGB frames in, raw 8-bit mattes out — without a model. What it answers is
 * known in advance (a centred ellipse, or the bright parts of the picture),
 * and it can be told to misbehave at a chosen frame. Not a test file itself.
 *
 *   node fakeMatte.js --width W --height H [--fps F] [--shape ellipse|luma]
 *     [--delay ms] [--hold n] [--die-after n] [--short-after n]
 *     [--garbage-after n] [--extra-after n] [--hang-after n] [--log file]
 *
 * @module tests/cutout/fakeMatte
 */

import { appendFileSync } from 'node:fs';
import { ellipse } from './shapes.js';

/** @type {Record<string, string>} */
const flags = {};
for (let i = 2; i < process.argv.length; i += 2)
  flags[process.argv[i].slice(2)] = process.argv[i + 1];
const [width, height] = [Number(flags.width), Number(flags.height)];
/** @type {(name: string) => number} A frame count; never when the flag is absent */
const at = (name) => (flags[name] === undefined ? Infinity : Number(flags[name]));
const sleep = (/** @type {number} */ ms) => new Promise((done) => setTimeout(done, ms));
if (flags.log) appendFileSync(flags.log, `${process.pid} ${width}x${height}\n`);
if (!(width > 0 && height > 0)) {
  process.stderr.write('fake matte: --width and --height are required\n');
  process.exit(2);
}

/**
 * @param {Buffer} frame - RGB
 * @returns {Buffer} 255 where the picture's green is in its upper half
 */
function bright(frame) {
  const matte = Buffer.alloc(width * height);
  for (let i = 0; i < matte.length; i++) matte[i] = frame[i * 3 + 1] >= 128 ? 255 : 0;
  return matte;
}

/** @param {Buffer|string} bytes @returns {Promise<void>} Once stdout has taken them */
const say = (bytes) => new Promise((done) => process.stdout.write(bytes, () => done()));

const fixed = flags.shape === 'luma' ? null : ellipse(width, height);
const size = width * height * 3;
/** @type {Buffer[]} Frames taken in and not answered yet */
const held = [];
let answered = 0;
let pending = Buffer.alloc(0);

/** @param {Buffer} frame */
async function answer(frame) {
  if (flags.delay) await sleep(Number(flags.delay));
  await say(fixed || bright(frame));
  answered++;
  if (answered === at('garbage-after')) await say('oops, a log line on stdout\n');
  if (answered === at('short-after')) {
    await say(Buffer.alloc(Math.floor((width * height) / 2)));
    process.exit(0);
  }
  if (answered === at('die-after')) {
    process.stderr.write('fake matte: out of memory on frame ' + (answered + 1) + '\n');
    process.exit(3);
  }
  if (answered === at('hang-after')) await sleep(3_600_000);
}

for await (const chunk of process.stdin) {
  pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
  while (pending.length >= size) {
    held.push(pending.subarray(0, size));
    pending = pending.subarray(size);
    // A late answer: nothing comes out until `hold` more frames have gone in.
    if (held.length > (Number(flags.hold) || 0)) await answer(/** @type {Buffer} */ (held.shift()));
  }
}
while (held.length) await answer(/** @type {Buffer} */ (held.shift()));
if (answered >= at('extra-after')) await say(fixed || Buffer.alloc(width * height));
if (pending.length) {
  process.stderr.write(`fake matte: the input ended in the middle of a frame\n`);
  process.exit(6);
}
