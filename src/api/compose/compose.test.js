import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GlobalFonts, getTextRenderer } from '@napi-rs/canvas';
import { EMOJI_FAMILY, FONT_FAMILIES, fontString } from '#utils/compose/fonts.js';
import { doc, gen } from '../../../tests/compose/build.js';
import { writeFixtures } from '../../../tests/compose/fixtures.js';
import { FONT_DIR, fontFile } from './fonts.js';
import {
  createCanvas,
  createEnv,
  createFrameSource,
  loadImages,
  registerFonts,
  renderFrame,
} from './index.js';

const faces = JSON.parse(await readFile(join(FONT_DIR, 'fonts.json'), 'utf-8'));
const widthOf = (font, text = 'Hamburgefonstiv') => {
  const ctx = createCanvas(8, 8).getContext('2d');
  ctx.textRendering = 'geometricPrecision';
  ctx.font = font;
  return ctx.measureText(text).width;
};
/** Pixels with any ink, drawing `text` in `font` on a blank canvas. */
function inkOf(font, text) {
  const canvas = createCanvas(160, 160);
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 20, 80);
  const { data } = ctx.getImageData(0, 0, 160, 160);
  let ink = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) ink++;
  return ink;
}
/** True when a CSS unicode-range list contains a code point. */
const covers = (ranges, codePoint) =>
  ranges.split(',').some((range) => {
    const [from, to = from] = range.trim().slice(2).split('-');
    return codePoint >= parseInt(from, 16) && codePoint <= parseInt(to, 16);
  });
const quietly = (run) => {
  const warn = console.warn;
  const messages = [];
  console.warn = (...args) => messages.push(args.join(' '));
  return Promise.resolve(run()).then(
    (value) => ((console.warn = warn), { value, messages }),
    (err) => ((console.warn = warn), Promise.reject(err)),
  );
};

describe('bundled fonts on the server canvas', () => {
  it('registers every vendored face, once per process', () => {
    const result = registerFonts();
    assert.deepEqual(result.failed, []);
    assert.equal(result.registered, faces.length);
    assert.equal(registerFonts(), result);
    assert.equal(getTextRenderer(), 'system', 'text is drawn as Chrome draws it on this OS');
    for (const family of [...FONT_FAMILIES.map((f) => f.id), EMOJI_FAMILY]) {
      assert.ok(GlobalFonts.has(family), `${family} is not registered`);
    }
  });

  it('picks the face of the weight and style that was asked for', () => {
    const ink = (style) => inkOf(fontString({ fontSize: 60, ...style }), 'Hxg');
    for (const family of FONT_FAMILIES) {
      const amounts = family.weights.map((weight) => ink({ fontFamily: family.id, weight }));
      for (let i = 1; i < amounts.length; i++) {
        assert.ok(
          amounts[i] > amounts[i - 1] * 1.04,
          `${family.id} weights draw alike: ${amounts}`,
        );
      }
      if (!family.italics) continue;
      const upright = widthOf(fontString({ fontFamily: family.id, fontSize: 80 }));
      const italic = widthOf(fontString({ fontFamily: family.id, fontSize: 80, italic: true }));
      assert.notEqual(italic, upright, `${family.id} italic is the upright face`);
    }
  });

  it('covers other scripts with the same family and weight', () => {
    const regular = widthOf(fontString({ fontFamily: 'Inter', fontSize: 80 }), 'Привет Ελληνικά');
    const black = widthOf(
      fontString({ fontFamily: 'Inter', fontSize: 80, weight: 900 }),
      'Привет Ελληνικά',
    );
    assert.ok(black > regular * 1.03, `${regular} vs ${black}`);
  });

  it('uses an intact WOFF file for colour emoji and the vendored file otherwise', async () => {
    const emoji = faces.find((face) => face.family === EMOJI_FAMILY);
    const inter = faces.find((face) => face.family === 'Inter');
    assert.match(fontFile(FONT_DIR, emoji), /noto-color-emoji.*\.woff$/);
    assert.equal(fontFile(FONT_DIR, inter), join(FONT_DIR, inter.file));
    assert.ok(inkOf(`100px "${EMOJI_FAMILY}"`, '🎬') > 2000, 'the registered emoji font draws');
  });

  // The file the browser is given. Fix: scripts/vendor-fonts.js must vendor
  // the package's .woff files for this family (see fontFile).
  it('vendors emoji files that draw', { todo: 'the numbered WOFF2 subsets are blank' }, () => {
    const face = faces.find((f) => f.family === EMOJI_FAMILY && covers(f.unicodeRange, 0x1f3ac));
    assert.ok(GlobalFonts.registerFromPath(join(FONT_DIR, face.file), 'Vendored Emoji'));
    assert.ok(inkOf('100px "Vendored Emoji"', '🎬') > 2000);
  });

  it('reports a folder without fonts instead of failing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nearedit-fonts-'));
    try {
      const { value, messages } = await quietly(() => registerFonts(dir));
      assert.deepEqual(value, { registered: 0, failed: [] });
      assert.match(messages[0], /no bundled fonts/);
      await writeFile(
        join(dir, 'fonts.json'),
        JSON.stringify([{ family: 'Gone', style: 'normal', weight: 400, file: 'gone.woff2' }]),
      );
      const missing = await quietly(() => registerFonts(dir));
      assert.deepEqual(missing.value, { registered: 0, failed: ['gone.woff2'] });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('server host environment', () => {
  let fixtures;
  before(async () => (fixtures = await writeFixtures()));
  after(() => fixtures.remove());

  it('loads allow-listed stills from disk and leaves out what it cannot read', async () => {
    const { value: images, messages } = await quietly(() =>
      loadImages([
        fixtures.card,
        fixtures.card,
        join(fixtures.dir, 'missing.png'),
        'https://example.com/x.png',
      ]),
    );
    assert.deepEqual([...images.keys()], [fixtures.card]);
    assert.deepEqual(
      [images.get(fixtures.card).width, images.get(fixtures.card).height],
      [640, 360],
    );
    assert.equal(messages.length, 2, 'the missing file and the URL are reported');
  });

  it('hands the compositor canvases, stills and footage frames', async () => {
    const images = await loadImages([fixtures.logo]);
    const frame = createCanvas(4, 4);
    const env = createEnv({
      images,
      frameOf: (clip, time) => (clip.clipId === 'v' && time === 2 ? frame : null),
    });
    assert.equal(env.createCanvas(12, 7).width, 12);
    assert.equal(env.image(fixtures.logo), images.get(fixtures.logo));
    assert.equal(env.image('/not/loaded.png'), null);
    assert.equal(env.frameOf({ clipId: 'v' }, 2), frame);
    assert.equal(env.frameOf({ clipId: 'x' }, 2), null);
    assert.equal(env.fontReady('700 40px "Inter"', 'x'), true);
    assert.equal(createEnv().frameOf({}, 0), null);
  });

  it('turns raw RGBA footage into something the compositor can draw', () => {
    const source = createFrameSource(2, 2);
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 8, 7, 255]);
    const canvas = source.put(rgba);
    assert.equal(canvas, source.canvas);
    assert.deepEqual([...canvas.getContext('2d').getImageData(0, 0, 2, 2).data], [...rgba]);
  });
});

describe('renderFrame', () => {
  const edl = doc([[gen('g', 'solid', { color: '#204060' })]]);

  it('draws at the output size by default, or at a width keeping the aspect', () => {
    const full = renderFrame(edl, 1);
    assert.deepEqual([full.width, full.height], [1920, 1080]);
    const small = renderFrame(edl, 1, { width: 320 });
    assert.deepEqual([small.width, small.height], [320, 180]);
    assert.deepEqual(
      [...small.getContext('2d').getImageData(160, 90, 1, 1).data],
      [0x20, 0x40, 0x60, 255],
    );
    const odd = renderFrame({ ...edl, resolution: '1080x1920' }, 1, { width: 90, height: 100 });
    assert.deepEqual([odd.width, odd.height], [90, 100]);
  });

  it('draws footage and stills given to it, and reuses an environment', async () => {
    const plate = createCanvas(16, 9);
    plate.getContext('2d').fillRect(0, 0, 16, 9);
    const env = createEnv({ frameOf: () => plate });
    const footage = doc([[{ ...gen('v', ''), generator: undefined, sourceFile: '/m/a.mp4' }]], {
      background: '#ffffff',
    });
    const pixel = (canvas) => [...canvas.getContext('2d').getImageData(10, 10, 1, 1).data];
    assert.deepEqual(pixel(renderFrame(footage, 1, { width: 64, env })), [0, 0, 0, 255]);
    assert.deepEqual(
      pixel(renderFrame(footage, 1, { width: 64, frameOf: () => plate })),
      [0, 0, 0, 255],
    );
    assert.deepEqual(pixel(renderFrame(footage, 1, { width: 64 })), [255, 255, 255, 255]);
  });
});
