#!/usr/bin/env node
/**
 * Write the "Made from nothing" document:
 *
 *   node examples/made-from-nothing/build.js [out.json]
 *
 * Then look at a frame of it, or render it:
 *
 *   node bin/nearedit.js frame  examples/made-from-nothing/made-from-nothing.json --time 2
 *   node bin/nearedit.js render examples/made-from-nothing/made-from-nothing.json -o piece.mp4
 * @module examples/made-from-nothing/build
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateEdl } from '#utils/edl/index.js';
import { buildPiece } from './piece.js';

const doc = buildPiece();
const check = validateEdl(doc);
if (!check.valid) {
  throw new Error(`The document is not valid: ${JSON.stringify(check.problems.slice(0, 5))}`);
}
const out = process.argv[2] || fileURLToPath(new URL('./made-from-nothing.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
const clips = doc.tracks.reduce((n, track) => n + track.clips.length, 0);
process.stdout.write(`${out}: ${clips} clips on ${doc.tracks.length} tracks\n`);
