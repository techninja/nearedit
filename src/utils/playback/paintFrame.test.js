import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, gen, media, title } from '../../../tests/compose/build.js';
import { createCanvas } from '../../api/compose/index.js';

/** A fake `document.fonts`: nothing is loaded until the test says so. */
const fonts = {
  loaded: new Set(),
  /** @type {{ font: string, text: string, finish: (ok?: boolean) => void }[]} */
  loads: [],
  check: (font, text) => fonts.loaded.has(`${font}|${text}`),
  load(font, text) {
    return new Promise((resolve, reject) => {
      const finish = (ok = true) => {
        if (ok) fonts.loaded.add(`${font}|${text}`);
        return ok ? resolve([]) : reject(new Error('404'));
      };
      fonts.loads.push({ font, text, finish });
    });
  },
};
globalThis.document = { fonts, createElement: () => createCanvas(1, 1) };
const { createFontLoader, createPainter } = await import('./paintFrame.js');

const tick = () => new Promise((resolve) => setImmediate(resolve));
const FONT = '700 72px "Inter", "Noto Color Emoji"';

describe('on-demand font loading', () => {
  let arrivals;
  let ready;
  beforeEach(() => {
    fonts.loaded.clear();
    fonts.loads.length = 0;
    arrivals = 0;
    ready = createFontLoader(() => arrivals++);
  });

  it('asks for a font once and reports it ready when it arrives', async () => {
    assert.equal(ready(FONT, 'Hi'), false);
    assert.equal(ready(FONT, 'Hi'), false);
    assert.equal(fonts.loads.length, 1, 'one load however often the frame is drawn');
    fonts.loads[0].finish();
    await tick();
    assert.equal(arrivals, 1, 'the arrival asks for a repaint');
    assert.equal(ready(FONT, 'Hi'), true);
  });

  it('is ready at once for a font the browser already has', () => {
    fonts.loaded.add(`${FONT}|Hi`);
    assert.equal(ready(FONT, 'Hi'), true);
    assert.equal(fonts.loads.length, 0);
  });

  it('gives up on a font that cannot be loaded, so the title still shows', async () => {
    const warn = console.warn;
    console.warn = () => {};
    assert.equal(ready(FONT, 'Hi'), false);
    fonts.loads[0].finish(false);
    await tick();
    console.warn = warn;
    assert.equal(arrivals, 1);
    assert.equal(ready(FONT, 'Hi'), true, 'drawn with the fallback from now on');
  });

  it('does not load again for another size of the same face and text', async () => {
    ready(FONT, 'Hi');
    fonts.loads[0].finish();
    await tick();
    assert.equal(ready(FONT.replace('72px', '31.5px'), 'Hi'), true);
    assert.equal(ready(FONT, 'Other text'), false, 'other text may need other files');
  });
});

describe('preview painter', () => {
  const plate = (color) => {
    const canvas = createCanvas(32, 18);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 32, 18);
    return canvas;
  };
  const pixel = (canvas, x, y) =>
    [...canvas.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3);
  /** The sources a compositor hands the painter, as fakes. */
  function sources(overrides = {}) {
    const asked = [];
    return {
      asked,
      onArrive() {},
      images: {
        get(url) {
          asked.push(url);
          return overrides.still || { ready: true, image: plate('#00ff00') };
        },
      },
      videos: {
        find: (clipId) =>
          clipId === 'v'
            ? { el: plate('#ff0000'), stale: false, failed: false, ...overrides.slot }
            : undefined,
      },
    };
  }
  // The fake video "element" is a canvas; give it what hasFrame() looks at.
  const loaded = { el: Object.assign(plate('#ff0000'), { readyState: 4 }) };
  const edl = doc([
    [media('s', '/m/pic.png', { transform: { fit: 'contain', scaleX: 0.5, scaleY: 0.5, x: 480 } })],
    [media('v', '/m/clip.mp4')],
  ]);

  it('draws the frame of each video slot and each decoded still', () => {
    const canvas = createCanvas(160, 90);
    const from = sources({ slot: loaded });
    createPainter(canvas, from).paint(edl, 1);
    assert.deepEqual(pixel(canvas, 20, 45), [255, 0, 0]);
    assert.deepEqual(pixel(canvas, 120, 45), [0, 255, 0]);
    assert.deepEqual(from.asked, ['/api/media/file?path=%2Fm%2Fpic.png']);
  });

  it('leaves out a still that is loading and a slot without a frame of its own', () => {
    const canvas = createCanvas(160, 90);
    const stale = { ...loaded, stale: true };
    createPainter(canvas, sources({ still: { ready: false }, slot: stale })).paint(edl, 1);
    assert.deepEqual(pixel(canvas, 20, 45), [0, 0, 0]);
    assert.deepEqual(pixel(canvas, 120, 45), [0, 0, 0]);
  });

  it('draws at the canvas size it finds, generators and all', () => {
    const canvas = createCanvas(160, 90);
    const painter = createPainter(canvas, sources());
    const solid = doc([[gen('g', 'solid', { color: '#3366cc' })]]);
    painter.paint(solid, 1);
    assert.deepEqual(pixel(canvas, 159, 89), [0x33, 0x66, 0xcc]);
    canvas.width = 80;
    canvas.height = 45;
    painter.paint(solid, 1);
    assert.deepEqual(pixel(canvas, 79, 44), [0x33, 0x66, 0xcc]);
  });

  it('starts loading the fonts of a whole document when it first sees it', () => {
    fonts.loaded.clear();
    fonts.loads.length = 0;
    const painter = createPainter(createCanvas(160, 90), sources());
    const titled = doc([
      [
        title('now', 'Now'),
        title('later', 'Later', { fontFamily: 'Caveat' }, { timelineStart: 60, timelineEnd: 64 }),
      ],
    ]);
    painter.paint(titled, 1);
    assert.deepEqual(fonts.loads.map((load) => load.text).sort(), ['Later', 'Now']);
    painter.paint(titled, 1.1);
    assert.equal(fonts.loads.length, 2, 'the same document asks once');
  });
});
