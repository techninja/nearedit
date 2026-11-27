import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, gen, media, title } from '../../../tests/compose/build.js';
import { createCanvas } from '../../api/compose/index.js';

/** A fake `document.fonts`: one unloaded face per family, loaded on demand. */
const face = (family) => ({
  family,
  weight: '700',
  style: 'normal',
  unicodeRange: 'U+0-FF',
  status: 'unloaded',
});
const fonts = {
  faces: [face('Inter'), face('Caveat')],
  /** @type {string[]} Text of every load that was asked for */
  loads: [],
  [Symbol.iterator]: () => fonts.faces[Symbol.iterator](),
  check: () => true,
  load(font, text) {
    fonts.loads.push(text);
    return new Promise(() => {});
  },
};
globalThis.document = { fonts, createElement: () => createCanvas(1, 1) };
const { createPainter } = await import('./paintFrame.js');

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
    const canvas = createCanvas(160, 90);
    const painter = createPainter(canvas, sources());
    const titled = doc([
      [
        title('now', 'Now', { fontSize: 200, background: '#ffffff' }),
        title('later', 'Later', { fontFamily: 'Caveat' }, { timelineStart: 60, timelineEnd: 64 }),
      ],
    ]);
    painter.paint(titled, 1);
    assert.deepEqual([...fonts.loads].sort(), ['Later', 'Now']);
    assert.deepEqual(pixel(canvas, 80, 45), [0, 0, 0], 'a title waits for its font');
    painter.paint(titled, 1.1);
    assert.equal(fonts.loads.length, 2, 'the same document asks once');
    for (const loaded of fonts.faces) loaded.status = 'loaded';
    painter.paint(titled, 1.2);
    assert.ok(pixel(canvas, 80, 45)[0] > 200, 'and is drawn once it is there');
  });
});
