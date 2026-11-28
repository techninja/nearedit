/**
 * Resolution independence — every length in a document is in output pixels,
 * so the same document drawn on a 480-pixel-wide canvas (a small preview)
 * and on a 1920-pixel-wide one (the render) must be the same picture. Each
 * reference document is drawn at both sizes; the large frame is averaged
 * down 4 × 4 and compared with the small one.
 *
 * The two cannot be identical: a small frame antialiases each edge once,
 * the averaged large frame sixteen times over, and glyphs sit on whole
 * pixel rows of whichever canvas they are drawn on (up to half a small
 * pixel apart). So the bounds are on the mean and on 8×8 blocks — and the
 * last test shows they are tight enough that a length which ignores the
 * scale (a radius, an outline, a font size, an offset) breaks them.
 * Set `RESOLUTION_OUT=<dir>` to save the frames and their difference.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { createEnv, loadImages, renderFrame } from '../../src/api/compose/index.js';
import { drawFrame, frameInfo } from '../../src/utils/compose/index.js';
import { CASE_NAMES, referenceCases } from './cases/index.js';
import { writeFixtures } from './fixtures.js';
import { describe as report, difference, differenceImage } from './metrics.js';

const SMALL = { width: 480, height: 270 };
const FACTOR = 4;
/** Mean difference allowed, levels of 255. */
const MEAN = 1.5;
/** Mean difference allowed in any 8×8 block… */
const BLOCK = 12;
/** …and in one that holds glyphs, which may sit half a pixel row apart. */
const TEXT_BLOCK = 40;
/**
 * …and in one that holds small outlined type — captions. An outlined
 * letter has two edges where a plain one has one (picture to outline,
 * outline to letter), so the same half row weighs up to twice as much, at
 * any size: measured over the sub-pixel places a caption can land on, such
 * a block differs by up to 57 levels, a plain title's by 30.
 */
const OUTLINED_BLOCK = 64;
/**
 * Cases whose modules multiply lengths by `frame.scale`: drawn with a scale
 * of 1 each must break the bounds. (Titles and noise never read the scale —
 * they draw in output pixels through the canvas transform — so they cannot
 * get it wrong this way.) Captions measure in units of the frame, which
 * they scale themselves: two of them stand for the outlined bound.
 */
const CONTROLS = ['shapes', 'pattern-stripes', 'effect-blur', 'effect-glow', 'keyframes'];
const CAPTION_CONTROLS = ['captions-clean-wide', 'captions-minimal-tall'];

const OUT = process.env.RESOLUTION_OUT;
let fixtures;
let images;
let footage = {};
let words = {};
const envs = {};
const lines = [];

/**
 * The small canvas of a case: 480 × 270, or — for a document that is not
 * 16:9 — its own shape with the same shorter side (three quarters of the
 * size the parity test draws it at).
 */
const smallOf = (found) =>
  found.size ? { width: found.size.width * 0.75, height: found.size.height * 0.75 } : SMALL;

/** RGBA of a frame drawn `scale` times the small size. */
function frame(found, scale) {
  footage = found.footage;
  words = found.words || {};
  envs[scale] ||= createEnv({
    images,
    frameOf: (clip) => images.get(footage[clip.clipId]) || null,
    words: (clip) => words[clip.sourceFile] || null,
  });
  const small = smallOf(found);
  const size = { width: small.width * scale, height: small.height * scale };
  const canvas = renderFrame(found.edl, found.time, { ...size, env: envs[scale] });
  return canvas.getContext('2d').getImageData(0, 0, size.width, size.height).data;
}

/** Average every FACTOR × FACTOR pixels of a large frame into one. */
function averaged(large, SMALL = { width: 480, height: 270 }) {
  const out = new Uint8ClampedArray(SMALL.width * SMALL.height * 4);
  const stride = SMALL.width * FACTOR * 4;
  for (let y = 0; y < SMALL.height; y++) {
    for (let x = 0; x < SMALL.width; x++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let dy = 0; dy < FACTOR; dy++) {
          const row = (y * FACTOR + dy) * stride + x * FACTOR * 4 + c;
          for (let dx = 0; dx < FACTOR; dx++) sum += large[row + dx * 4];
        }
        out[(y * SMALL.width + x) * 4 + c] = sum / (FACTOR * FACTOR);
      }
    }
  }
  return out;
}

/** Save an RGBA buffer of the small size as PNG. */
async function save(name, rgba, size = SMALL) {
  const canvas = createCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size.width, size.height);
  image.data.set(rgba);
  ctx.putImageData(image, 0, 0);
  await writeFile(join(OUT, `${name}.png`), canvas.toBuffer('image/png'));
}

describe('resolution independence: 480 px wide vs 1920 px wide', () => {
  before(async () => {
    fixtures = await writeFixtures();
    images = await loadImages([fixtures.card, fixtures.logo]);
    if (OUT) await mkdir(OUT, { recursive: true });
  });

  after(async () => {
    await fixtures.remove();
    console.log(`\n480 px vs 1920 px averaged 4×4, levels of 255\n${lines.join('\n')}`);
  });

  for (const name of CASE_NAMES) {
    it(`draws "${name}" the same picture at both sizes`, async () => {
      const found = referenceCases(fixtures).find((c) => c.name === name);
      const size = smallOf(found);
      const small = frame(found, 1);
      const large = averaged(frame(found, FACTOR), size);
      const d = difference(small, large, size.width, size.height);
      lines.push(report(name, d));
      if (OUT) {
        await save(`${name}.480`, small, size);
        await save(`${name}.1920`, large, size);
        await save(`${name}.diff`, differenceImage(small, large, 8), size);
      }
      const block = found.outlined ? OUTLINED_BLOCK : found.text ? TEXT_BLOCK : BLOCK;
      assert.ok(d.mean <= MEAN, `mean difference ${d.mean.toFixed(3)} levels`);
      assert.ok(d.blockMax <= block, `an 8×8 block differs by ${d.blockMax.toFixed(2)} levels`);
    });
  }

  it('would notice a length that ignores the scale', () => {
    for (const name of [...CONTROLS, ...CAPTION_CONTROLS]) {
      const found = referenceCases(fixtures).find((c) => c.name === name);
      const size = smallOf(found);
      // The small frame again, but telling every module that one output
      // pixel is one canvas pixel: what forgetting `frame.scale` looks like.
      const canvas = createCanvas(size.width, size.height);
      const ctx = canvas.getContext('2d');
      const unscaled = { ...frameInfo(found.edl, size.width, size.height), scale: 1 };
      const large = averaged(frame(found, FACTOR), size);
      const env = createEnv({ images, words: (clip) => words[clip.sourceFile] || null });
      drawFrame(ctx, found.edl, found.time, env, unscaled);
      const wrong = ctx.getImageData(0, 0, size.width, size.height).data;
      const d = difference(wrong, large, size.width, size.height);
      const block = found.outlined ? OUTLINED_BLOCK : BLOCK;
      assert.ok(d.mean > MEAN || d.blockMax > block, `${name} passed unscaled: ${report('', d)}`);
    }
  });
});
