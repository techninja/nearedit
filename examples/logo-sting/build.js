#!/usr/bin/env node
/**
 * Write the logo sting's documents — the opening and the logo wipe, each
 * for a wide and for a tall frame:
 *
 *   node examples/logo-sting/build.js
 *
 * Then look at a frame, or render:
 *
 *   node bin/nearedit.js frame  examples/logo-sting/opening.json --time 1.1
 *   node bin/nearedit.js render examples/logo-sting/opening.json -o opening.mp4
 *   node bin/nearedit.js render examples/logo-sting/wipe.json -o wipe.mp4
 * @module examples/logo-sting/build
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { normalizeEdl, validateEdl } from '#utils/edl/index.js';
import { buildOpening } from './opening.js';
import { printDocument } from './print.js';
import { buildWipe } from './wipe.js';

const WIDE = { width: 1920, height: 1080 };
const TALL = { width: 1080, height: 1920 };

/**
 * Every document of the example, by file name.
 * @returns {Record<string, Record<string, any>>}
 */
export function documents() {
  return {
    'opening.json': buildOpening(WIDE),
    'opening-tall.json': buildOpening(TALL),
    'wipe.json': buildWipe(WIDE),
    'wipe-tall.json': buildWipe(TALL),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [name, doc] of Object.entries(documents())) {
    const check = validateEdl(normalizeEdl(doc));
    if (!check.valid) {
      throw new Error(`${name} is not valid: ${JSON.stringify(check.problems.slice(0, 5))}`);
    }
    const out = fileURLToPath(new URL(`./${name}`, import.meta.url));
    writeFileSync(out, printDocument(doc));
    const clips = doc.tracks.reduce((n, track) => n + track.clips.length, 0);
    process.stdout.write(`${out}: ${clips} clips on ${doc.tracks.length} tracks\n`);
  }
}
