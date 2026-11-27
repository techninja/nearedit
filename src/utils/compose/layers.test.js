import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { doc, fx, gen, media, title } from '../../../tests/compose/build.js';
import { clipTime, frameInfo, timelineTime } from './frame.js';
import { composeFor, pictureSize } from './host.js';
import { layerKind, layersAt } from './layers.js';
import { requirements } from './requirements.js';

describe('frame, time and layers', () => {
  it('describes a canvas against the output size', () => {
    assert.deepEqual(frameInfo({ resolution: '1920x1080', fps: 24 }, 480, 270), {
      width: 480,
      height: 270,
      scale: 0.25,
      fps: 24,
      outWidth: 1920,
      outHeight: 1080,
    });
    assert.equal(frameInfo({}, 1920, 1080).fps, 30);
  });

  it('describes a moment in a clip and on the timeline', () => {
    const clip = { sourceIn: 10, timelineStart: 2, timelineEnd: 6 };
    assert.deepEqual(clipTime(clip, 3, 30), {
      t: 11,
      age: 1,
      remaining: 3,
      duration: 4,
      frame: 90,
    });
    const edl = doc([[gen('a', 'solid')]]);
    assert.deepEqual(timelineTime(edl, 1, 30), {
      t: 1,
      age: 1,
      remaining: 3,
      duration: 4,
      frame: 30,
    });
  });

  it('lists the layers of a frame back to front, with their source times', () => {
    const edl = doc([
      [title('t', 'Hi'), media('p', '', { placeholder: true })],
      { muted: true, clips: [gen('hidden', 'solid')] },
      [
        media('v', '/m/a.mp4', { sourceIn: 5, sourceOut: 9 }),
        media('late', '/m/b.png', { timelineStart: 4, timelineEnd: 8 }),
      ],
      [gen('g', 'solid')],
    ]);
    const layers = layersAt(edl, 1.5);
    assert.deepEqual(
      layers.map((l) => [l.clip.clipId, l.kind]),
      [
        ['g', 'generator'],
        ['v', 'video'],
        ['t', 'title'],
      ],
    );
    assert.equal(layers[1].sourceTime, 6.5);
    assert.equal(layerKind(media('a', '/m/song.mp3'), {}), null);
    assert.equal(layerKind(media('i', '/m/pic.JPG'), {}), 'image');
  });
});

describe('requirements', () => {
  it('lists every still and every font a document needs, once', () => {
    const edl = doc([
      [
        title('t1', 'One', { fontFamily: 'Caveat', bold: true }),
        title('t2', 'One', { fontFamily: 'Caveat', bold: true, fontSize: 90 }),
      ],
      [
        media('a', '/m/a.png'),
        media('b', '/m/a.png', { timelineStart: 5, timelineEnd: 6 }),
        media('v', '/m/v.mp4'),
      ],
      [gen('g', 'solid', {}, { effects: [fx('blur')] }), media('p', '', { placeholder: true })],
    ]);
    const needs = requirements(edl);
    assert.deepEqual(needs.images, ['/m/a.png']);
    assert.deepEqual(needs.fonts, [
      { font: '700 72px "Caveat", "Noto Color Emoji"', text: 'One' },
      { font: '700 90px "Caveat", "Noto Color Emoji"', text: 'One' },
    ]);
    assert.deepEqual(requirements({}), { images: [], fonts: [] });
  });
});

describe('module environment', () => {
  const made = [];
  const canvas = (width, height) => ({ width, height, getContext: () => ({ reset() {} }) });
  const sprite = { width: 8, height: 8 };
  const host = {
    createCanvas: (width, height) => made.push([width, height]) && canvas(width, height),
    image: (path) => (path === '/m/spark.png' ? sprite : undefined),
  };

  it('gives modules the host through one door, with gaps answered by "not there"', () => {
    const { env } = composeFor(host);
    assert.equal(env.image('/m/spark.png'), sprite, 'a generator can ask for an image by path');
    assert.equal(env.image('/m/missing.png'), null);
    assert.equal(env.image(''), null);
    assert.equal(env.frameOf({ clipId: 'a' }, 1), null, 'a host without footage');
    assert.equal(env.fontReady('700 72px "Inter"', 'x'), true, 'a host that never waits for fonts');
    assert.equal(composeFor(host), composeFor(host), 'one pool per host');
  });

  it('lends pooled scratch surfaces of any size', () => {
    const { env, pool } = composeFor(host);
    pool.begin(64, 36);
    const mark = pool.mark();
    const full = env.scratch();
    const grid = env.scratch(16, 9);
    assert.deepEqual([full.width, full.height, grid.width, grid.height], [64, 36, 16, 9]);
    pool.settle(mark);
    const before = made.length;
    assert.equal(env.scratch(16, 9), grid, 'the same canvas comes back');
    assert.equal(made.length, before);
    pool.settle(mark);
  });

  it('reads the size of anything drawImage takes', () => {
    assert.deepEqual(pictureSize({ videoWidth: 1280, videoHeight: 720, width: 0, height: 0 }), {
      width: 1280,
      height: 720,
    });
    assert.deepEqual(
      pictureSize({ naturalWidth: 800, naturalHeight: 600, width: 100, height: 75 }),
      { width: 800, height: 600 },
    );
    assert.deepEqual(pictureSize({ width: 64, height: 36 }), { width: 64, height: 36 });
    assert.deepEqual(pictureSize(null), { width: 0, height: 0 });
  });
});
