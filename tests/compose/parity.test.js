/**
 * Cross-canvas parity — the guarantee the shared compositor rests on: the
 * same documents drawn by `drawFrame` on the server canvas and in real
 * Chromium come out as the same pixels.
 *
 * Chromium is launched through the project's Playwright (`CHROMIUM_PATH`
 * picks the binary when set) and imports the compositor from a throwaway
 * static server over `src/`. Without a browser every case is skipped.
 * Set `PARITY_OUT=<dir>` to save both renders and their difference as PNG.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { createEnv, loadImages, renderFrame } from '../../src/api/compose/index.js';
import { openBrowser } from './browser.js';
import { CASE_NAMES, emojiCase, referenceCases } from './cases/index.js';
import { writeFixtures } from './fixtures.js';
import { describe as report, difference, differenceImage } from './metrics.js';

const WIDTH = 640;
const HEIGHT = 360;
/** No channel of any pixel may differ by more than this many levels of 255. */
const MAX_LEVELS = 2;
/**
 * Glyphs. On Linux the server canvas draws text exactly as Chromium does
 * and the same bound applies. Elsewhere each side follows the operating
 * system's own glyph rasteriser, which may differ at glyph edges: there the
 * average and any 8×8 block (which a shifted, missing or wrong-weight glyph
 * would break) are bounded instead.
 */
const EXACT_TEXT = process.platform === 'linux';
const TEXT_MEAN = 1;
const TEXT_BLOCK = 20;

const OUT = process.env.PARITY_OUT;
let fixtures;
let browser;
let skipped = '';
let env;
/** clipId → picture standing in for its footage frame, for the case being drawn. */
let footage = {};
/** Source file → transcript words, for the case being drawn. */
let words = {};
const lines = [];

/** Save an RGBA buffer as PNG. */
async function save(name, rgba, width = WIDTH, height = HEIGHT) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  image.data.set(rgba);
  ctx.putImageData(image, 0, 0);
  await writeFile(join(OUT, `${name}.png`), canvas.toBuffer('image/png'));
}

/** Draw a case on both canvases and measure how far apart they are. */
async function compare(t, found) {
  if (skipped) return t.skip(skipped);
  const { name, edl, time } = found;
  footage = found.footage;
  words = found.words || {};
  // A document that is not 16:9 is drawn on a canvas of its own shape.
  const { width, height } = found.size || { width: WIDTH, height: HEIGHT };
  const canvas = renderFrame(edl, time, { width, height, env });
  const server = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const images = { [fixtures.card]: fixtures.card, [fixtures.logo]: fixtures.logo };
  const job = { edl, time, width, height, images, footage, words };
  const chrome = await browser.draw(job);
  const d = difference(server, chrome, width, height);
  lines.push(report(name, d));
  if (OUT) {
    await save(`${name}.server`, server, width, height);
    await save(`${name}.chromium`, chrome, width, height);
    await save(`${name}.diff`, differenceImage(server, chrome), width, height);
  }
  return d;
}

describe('compositor parity: server canvas vs Chromium', () => {
  before(async () => {
    fixtures = await writeFixtures();
    const images = await loadImages([fixtures.card, fixtures.logo]);
    env = createEnv({
      images,
      frameOf: (clip) => images.get(footage[clip.clipId]) || null,
      words: (clip) => words[clip.sourceFile] || null,
    });
    if (OUT) await mkdir(OUT, { recursive: true });
    try {
      browser = await openBrowser(fixtures.dir);
    } catch (err) {
      const why = String(err?.message || err).split('\n')[0];
      skipped = `no browser could be launched (${why}); set CHROMIUM_PATH to a Chromium binary`;
    }
  });

  after(async () => {
    await browser?.close();
    await fixtures?.remove();
    if (!lines.length) return;
    const head = `parity, ${WIDTH}×${HEIGHT}, levels of 255 (Chromium ${browser?.version})`;
    console.log(`\n${head}\n${lines.join('\n')}`);
  });

  for (const name of CASE_NAMES) {
    it(`draws "${name}" alike`, async (t) => {
      const found = referenceCases(fixtures).find((c) => c.name === name);
      const d = await compare(t, found);
      if (!d) return;
      if (found.text && !EXACT_TEXT) {
        assert.ok(d.mean <= TEXT_MEAN, `mean difference ${d.mean.toFixed(3)} levels`);
        assert.ok(d.blockMax <= TEXT_BLOCK, `an 8×8 block differs by ${d.blockMax.toFixed(2)}`);
        return;
      }
      assert.ok(d.max <= MAX_LEVELS, `differs by up to ${d.max} levels (${d.over2} channels > 2)`);
    });
  }

  it('tells different frames apart (the comparison is not vacuous)', async (t) => {
    if (skipped) return t.skip(skipped);
    const found = referenceCases(fixtures).find((c) => c.name === 'keyframes');
    const size = { width: WIDTH, height: HEIGHT };
    const server = renderFrame(found.edl, found.time, { ...size, env });
    const { data } = server.getContext('2d').getImageData(0, 0, WIDTH, HEIGHT);
    // One output frame later the shape has moved by a few pixels.
    const later = await browser.draw({ edl: found.edl, time: found.time + 1 / 30, ...size });
    const d = difference(data, later, WIDTH, HEIGHT);
    assert.ok(d.max > MAX_LEVELS, `one frame apart went unnoticed: max ${d.max}`);
    assert.ok(new Set(data).size > 50, 'the reference frame is not a flat colour');
  });

  // Depends on the vendored emoji files being ones that draw (see `emojiDoc`).
  it('draws colour emoji alike', async (t) => {
    const d = await compare(t, emojiCase());
    if (!d) return;
    assert.ok(d.blockMax <= TEXT_BLOCK, `an 8×8 block differs by ${d.blockMax.toFixed(2)}`);
  });
});
