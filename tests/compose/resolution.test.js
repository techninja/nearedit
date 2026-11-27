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
 * Cases whose modules multiply lengths by `frame.scale`: drawn with a scale
 * of 1 each must break the bounds. (Titles and noise never read the scale —
 * they draw in output pixels through the canvas transform — so they cannot
 * get it wrong this way.)
 */
const CONTROLS = ['shapes', 'pattern-stripes', 'effect-blur', 'effect-glow', 'keyframes'];

const OUT = process.env.RESOLUTION_OUT;
let fixtures;
let images;
let footage = {};
const envs = {};
const lines = [];

/** RGBA of a frame drawn `scale` times the small size. */
function frame(found, scale) {
  footage = found.footage;
  envs[scale] ||= createEnv({
    images,
    frameOf: (clip) => images.get(footage[clip.clipId]) || null,
  });
  const size = { width: SMALL.width * scale, height: SMALL.height * scale };
  const canvas = renderFrame(found.edl, found.time, { ...size, env: envs[scale] });
  return canvas.getContext('2d').getImageData(0, 0, size.width, size.height).data;
}

/** Average every FACTOR × FACTOR pixels of a large frame into one. */
function averaged(large) {
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
async function save(name, rgba) {
  const canvas = createCanvas(SMALL.width, SMALL.height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(SMALL.width, SMALL.height);
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
      const small = frame(found, 1);
      const large = averaged(frame(found, FACTOR));
      const d = difference(small, large, SMALL.width, SMALL.height);
      lines.push(report(name, d));
      if (OUT) {
        await save(`${name}.480`, small);
        await save(`${name}.1920`, large);
        await save(`${name}.diff`, differenceImage(small, large, 8));
      }
      const block = found.text ? TEXT_BLOCK : BLOCK;
      assert.ok(d.mean <= MEAN, `mean difference ${d.mean.toFixed(3)} levels`);
      assert.ok(d.blockMax <= block, `an 8×8 block differs by ${d.blockMax.toFixed(2)} levels`);
    });
  }

  it('would notice a length that ignores the scale', () => {
    for (const name of CONTROLS) {
      const found = referenceCases(fixtures).find((c) => c.name === name);
      // The small frame again, but telling every module that one output
      // pixel is one canvas pixel: what forgetting `frame.scale` looks like.
      const canvas = createCanvas(SMALL.width, SMALL.height);
      const ctx = canvas.getContext('2d');
      const unscaled = { ...frameInfo(found.edl, SMALL.width, SMALL.height), scale: 1 };
      drawFrame(ctx, found.edl, found.time, createEnv({ images }), unscaled);
      const wrong = ctx.getImageData(0, 0, SMALL.width, SMALL.height).data;
      const d = difference(wrong, averaged(frame(found, FACTOR)), SMALL.width, SMALL.height);
      assert.ok(d.mean > MEAN || d.blockMax > BLOCK, `${name} passed unscaled: ${report('', d)}`);
    }
  });
});
