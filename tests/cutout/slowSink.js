#!/usr/bin/env node

/**
 * A slow encoder for tests: it takes its input a piece at a time and waits
 * after each, as an encoder that cannot keep up would. Not a test file itself.
 *
 *   node slowSink.js --bytes <piece size> --delay <ms per piece>
 *
 * @module tests/cutout/slowSink
 */

/** @type {Record<string, string>} */
const flags = {};
for (let i = 2; i < process.argv.length; i += 2)
  flags[process.argv[i].slice(2)] = process.argv[i + 1];
const [bytes, delay] = [Number(flags.bytes), Number(flags.delay)];
let pending = 0;
for await (const chunk of process.stdin) {
  pending += chunk.length;
  for (; pending >= bytes; pending -= bytes) await new Promise((done) => setTimeout(done, delay));
}
