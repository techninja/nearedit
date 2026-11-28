import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { clipKind, normalizeEdl, validateEdl } from '#utils/edl/index.js';
import { requirements } from '#utils/compose/index.js';
import { renderFrame } from '../../src/api/compose/index.js';
import { documents } from './build.js';
import { WORDMARK } from './logo.js';
import { OPENING_SECONDS } from './opening.js';
import { printDocument } from './print.js';
import { WIPE, WIPE_SECONDS } from './wipe.js';

const built = documents();
const NAVY = [15, 23, 42];

/** Pixels of a frame of a document, at its own size. */
async function pixels(doc, time) {
  const [width, height] = doc.resolution.split('x').map(Number);
  const canvas = await renderFrame(normalizeEdl(doc), time, { width, height });
  return { width, height, data: canvas.getContext('2d').getImageData(0, 0, width, height).data };
}

/** Share of pixels that are a colour, give or take `slack` per channel. */
function share({ data }, [r, g, b], slack = 6) {
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const near = (/** @type {number} */ a, /** @type {number} */ c) => Math.abs(a - c) <= slack;
    if (near(data[i], r) && near(data[i + 1], g) && near(data[i + 2], b)) count++;
  }
  return count / (data.length / 4);
}

/** The wordmark's SVG file, drawn on navy where the opening puts the logo. */
async function wordmarkOnNavy(width, height, unit) {
  const box = [WORDMARK.width / 2 - width / (2 * unit), 50 - height / (2 * unit)];
  const head = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" `;
  const file = new URL('../../src/logo/wordmark-on-dark.svg', import.meta.url);
  const svg = readFileSync(file, 'utf8').replace(
    /<svg [^>]*>/,
    `${head}viewBox="${box.join(' ')} ${width / unit} ${height / unit}">`,
  );
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `rgb(${NAVY.join(' ')})`;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(await loadImage(Buffer.from(svg)), 0, 0);
  return ctx.getImageData(0, 0, width, height).data;
}

describe('example: logo sting', () => {
  it('builds the documents saved beside it (run build.js after a change)', () => {
    for (const [name, doc] of Object.entries(built)) {
      const saved = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
      assert.equal(printDocument(doc), saved, name);
      assert.deepEqual(JSON.parse(saved), JSON.parse(JSON.stringify(doc)), name);
    }
  });

  it('builds valid documents made of shapes and text only: no picture, no footage', () => {
    for (const [name, doc] of Object.entries(built)) {
      const edl = normalizeEdl(doc);
      assert.deepEqual(validateEdl(edl).problems, [], name);
      const clips = edl.tracks.flatMap((track) => track.clips.map((clip) => ({ clip, track })));
      assert.ok(
        clips.every(({ clip }) => !clip.sourceFile),
        name,
      );
      const kinds = new Set(clips.map(({ clip, track }) => clipKind(clip, track)));
      assert.deepEqual([...kinds].sort(), ['generator', 'title'], name);
      assert.deepEqual(requirements(edl).images, [], name);
      const drawn = clips.filter(({ clip }) => clip.generator.type).map((c) => c.clip.generator);
      assert.ok(
        drawn.every((g) => name.startsWith('wipe') || g.type === 'shape'),
        name,
      );
    }
  });

  it('runs as long as an opening and a wipe should', () => {
    assert.ok(OPENING_SECONDS >= 3 && OPENING_SECONDS <= 4);
    assert.ok(WIPE_SECONDS >= 1 && WIPE_SECONDS <= 1.2 + 1e-9);
    for (const [name, doc] of Object.entries(built)) {
      const end = Math.max(...doc.tracks.flatMap((t) => t.clips.map((c) => c.timelineEnd)));
      const wanted = name.startsWith('wipe') ? WIPE_SECONDS : OPENING_SECONDS;
      assert.ok(Math.abs(end - wanted) < 1e-9, name);
    }
  });

  for (const name of ['opening.json', 'opening-tall.json']) {
    it(`${name} starts on the bare navy ground`, async () => {
      assert.equal(share(await pixels(built[name], 0), NAVY, 0), 1);
    });

    it(`${name} ends on the logo: the frame is the wordmark's own drawing`, async () => {
      const frame = await pixels(built[name], OPENING_SECONDS - 0.2);
      // The unit the opening chose, read back from the size of its letters.
      const fontSize = built[name].tracks.at(-1).clips[0].text.fontSize;
      const unit = fontSize / ((2048 / 1490) * 100);
      const wanted = await wordmarkOnNavy(frame.width, frame.height, unit);
      let sum = 0;
      let off = 0;
      for (let i = 0; i < wanted.length; i += 4) {
        const d =
          Math.abs(frame.data[i] - wanted[i]) +
          Math.abs(frame.data[i + 1] - wanted[i + 1]) +
          Math.abs(frame.data[i + 2] - wanted[i + 2]);
        sum += d / 3;
        if (d / 3 > 64) off++;
      }
      const count = wanted.length / 4;
      // Text and outlines meet within the soft edge of a letter, nowhere more.
      assert.ok(sum / count < 0.5, `mean difference ${sum / count} of 255`);
      assert.ok(off / count < 0.002, `${off} pixels differ by more than a quarter`);
      assert.ok(share(frame, [255, 255, 255]) > 0.01, 'the letters are there');
    });
  }

  for (const name of ['wipe.json', 'wipe-tall.json']) {
    /** The wipe alone, over a ground that is none of its colours. */
    const alone = {
      ...built[name],
      background: '#ff00ff',
      tracks: built[name].tracks.filter((track) => !track.name.startsWith('Scene')),
    };
    const MAGENTA = [255, 0, 255];

    it(`${name} covers the whole frame around the cut`, async () => {
      assert.equal(alone.tracks.length, 4);
      const [from, to] = WIPE.covered;
      assert.ok(WIPE.cut >= from && WIPE.cut <= to);
      for (let frame = from; frame <= to; frame++) {
        assert.equal(share(await pixels(alone, frame / 30), MAGENTA, 40), 0, `frame ${frame}`);
      }
    });

    it(`${name} shows the picture before and after`, async () => {
      assert.equal(share(await pixels(alone, 0), MAGENTA, 0), 1, 'nothing on the first frame');
      const last = (WIPE.frames - 1) / 30;
      assert.equal(share(await pixels(alone, last), MAGENTA, 0), 1, 'nothing on the last');
      const cut = WIPE.cut / 30;
      const sceneA = built[name].tracks.at(-1).clips[0];
      assert.ok(Math.abs(sceneA.timelineEnd - cut) < 1e-9, 'the cut lies under the cover');
    });
  }
});
