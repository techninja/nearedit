/**
 * Cross-canvas parity for captions — the same caption drawn by the library
 * on the server canvas and in real Chromium must come out as the very same
 * pixels: every preset, as a group arrives, in the middle of a word's
 * motion and at rest, in a wide, a tall and a square frame, and a set of
 * styles that exercise what the presets do not.
 *
 * Chromium is launched through the project's Playwright (`CHROMIUM_PATH`
 * picks the binary when set) and imports the library from a throwaway
 * static server over `src/`. Without a browser every case is skipped.
 * Set `CAPTIONS_OUT=<dir>` to save both renders of every case as PNG.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createCanvas, registerFonts } from '../../src/api/compose/index.js';
import * as captions from '../../src/utils/captions/index.js';
import { openBrowser } from './browser.js';
import { WORDS, backdrop, drawScene, frameOf, timed } from './scenes.js';

const OUT = process.env.CAPTIONS_OUT;
const WIDTHS = { wide: 480, tall: 270, square: 360 };
const KINDS = ['photo', 'bright', 'dark'];
let browser;
let skipped = '';
const lines = [];

/** The instants a group is compared at: arriving, mid-motion of its second word, at rest. */
function instants(style) {
  const groups = captions.captionGroups(WORDS, style);
  const group = captions.captionAt(groups, 3.9).group;
  const second = group.words[Math.min(1, group.words.length - 1)];
  return {
    entrance: group.start + 1 / 30,
    'mid-word': second.start + 2 / 30,
    rest: group.end + 0.05,
  };
}

/** Draw a scene on the server canvas. */
function onServer(scene) {
  const canvas = createCanvas(scene.frame.width, scene.frame.height);
  const ctx = canvas.getContext('2d');
  drawScene(ctx, captions, scene);
  return { canvas, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}

/** How many colour channels differ between two RGBA buffers, and by how much at most. */
function differing(a, b) {
  let [count, max] = [0, 0];
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d) count++;
    if (d > max) max = d;
  }
  return { count, max };
}

/** Draw a scene on both canvases and require the same pixels. */
async function alike(t, name, scene) {
  if (skipped) return t.skip(skipped);
  const server = onServer(scene);
  const chrome = await browser.draw(scene);
  assert.equal(chrome.length, server.data.length, 'both frames have one size');
  const d = differing(server.data, chrome);
  lines.push(`${name.padEnd(34)} differing channels ${String(d.count).padStart(6)}  max ${d.max}`);
  if (OUT) {
    const { width, height } = scene.frame;
    const other = createCanvas(width, height);
    const image = other.getContext('2d').createImageData(width, height);
    image.data.set(chrome);
    other.getContext('2d').putImageData(image, 0, 0);
    await writeFile(join(OUT, `${name}.server.png`), server.canvas.toBuffer('image/png'));
    await writeFile(join(OUT, `${name}.chromium.png`), other.toBuffer('image/png'));
  }
  assert.equal(d.count, 0, `${d.count} channels differ, by up to ${d.max} levels of 255`);
  // The caption is there: the frame is not just its backdrop.
  const bare = createCanvas(scene.frame.width, scene.frame.height);
  backdrop(bare.getContext('2d'), scene.kind, bare.width, bare.height);
  const plain = bare.getContext('2d').getImageData(0, 0, bare.width, bare.height).data;
  assert.ok(differing(server.data, plain).count > 200, 'a caption was drawn');
}

/** Styles beyond the presets, each at a time that shows what it is for. */
const EXTRAS = {
  'hide-pop': [{ preset: 'clean', unspoken: 'hide' }, 3.75 + 2 / 30, 'wide'],
  'hide-fill': [{ preset: 'karaoke', unspoken: 'hide' }, 3.2, 'tall'],
  'dim-glide': [
    { preset: 'clean', unspoken: 'dim', motion: { word: 'glide' } },
    3.75 + 1 / 30,
    'square',
  ],
  'scale-glide-top': [
    {
      preset: 'pop',
      position: { anchor: 'top', offset: 8 },
      motion: { word: 'glide', in: 'slide' },
    },
    3.54 + 1 / 30,
    'tall',
  ],
  'box-fill-middle': [
    { preset: 'boxed', position: { anchor: 'middle' }, motion: { word: 'fill' } },
    3.2,
    'wide',
  ],
  'underline-pop-plate': [
    {
      preset: 'minimal',
      plate: { on: true },
      motion: { word: 'pop' },
      highlight: { color: '#f97316' },
    },
    2.5 + 1 / 30,
    'square',
  ],
  'bebas-upper-hard-shadow': [
    {
      preset: 'pop',
      font: { family: 'Bebas Neue', weight: 400 },
      size: 11,
      shadow: { blur: 0, x: 0.5, y: 0.5, opacity: 1, color: '#be123c' },
    },
    7.0,
    'tall',
  ],
  'playfair-no-outline': [
    { preset: 'clean', font: { family: 'Playfair Display', weight: 700 }, stroke: { width: 0 } },
    13.0,
    'wide',
  ],
  'one-word-none': [
    { preset: 'clean', group: { words: 1 }, motion: { in: 'none', word: 'none' } },
    7.0,
    'tall',
  ],
  'emoji-group': ['boxed', 13.1, 'square'],
};

describe('captions parity: server canvas vs Chromium', () => {
  before(async () => {
    registerFonts();
    if (OUT) await mkdir(OUT, { recursive: true });
    try {
      browser = await openBrowser();
    } catch (err) {
      const why = String(err?.message || err).split('\n')[0];
      skipped = `no browser could be launched (${why}); set CHROMIUM_PATH to a Chromium binary`;
    }
  });

  after(async () => {
    await browser?.close();
    if (lines.length)
      console.log(`\ncaptions parity (Chromium ${browser?.version})\n${lines.join('\n')}`);
  });

  for (const [p, preset] of captions.PRESET_NAMES.entries()) {
    for (const [f, format] of Object.keys(WIDTHS).entries()) {
      for (const [i, moment] of ['entrance', 'mid-word', 'rest'].entries()) {
        it(`draws "${preset}" alike: ${moment}, ${format}`, async (t) => {
          const scene = {
            kind: KINDS[(p + f + i) % 3],
            frame: frameOf(format, WIDTHS[format]),
            style: preset,
            time: instants(preset)[moment],
          };
          await alike(t, `${preset}-${format}-${moment}`, scene);
        });
      }
    }
  }

  for (const [n, [name, [style, time, format]]] of Object.entries(EXTRAS).entries()) {
    it(`draws "${name}" alike`, async (t) => {
      const frame = frameOf(format, WIDTHS[format]);
      await alike(t, name, { kind: KINDS[n % 3], frame, style, time });
    });
  }

  it('draws two voices at once alike, one stacked clear of the other', async (t) => {
    const voices = [WORDS, timed('Wait, what? Are you sure about that number?', 3.4)];
    const frame = frameOf('wide', WIDTHS.wide);
    await alike(t, 'two-voices', { kind: 'photo', frame, style: 'boxed', time: 3.9, voices });
  });

  it('tells different frames apart (the comparison is not vacuous)', async (t) => {
    if (skipped) return t.skip(skipped);
    const scene = { kind: 'dark', frame: frameOf('wide', WIDTHS.wide), style: 'pop' };
    const { data } = onServer({ ...scene, time: 3.6 });
    const later = await browser.draw({ ...scene, time: 3.6 + 1 / 30 });
    assert.ok(differing(data, later).count > 0, 'one frame apart went unnoticed');
  });
});
