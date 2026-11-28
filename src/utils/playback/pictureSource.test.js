import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeElements } from './testing/fakeMediaElement.js';

installFakeElements();
const { createVideoPool } = await import('./videoPool.js');
const { createPictureSource, pictureAt } = await import('./pictureSource.js');

const FILE = '/p/me.mp4';
const CUT = '/p/.nearedit/cutout/0a51bd39df6c629f93d1.mp4';
const url = (path) => `/api/media/file?path=${encodeURIComponent(path)}`;
/** The cutout holds 2…8 s of the file at 30 fps. */
const made = {
  ...{ file: CUT, key: '0a51bd39df6c629f93d1', source: FILE, start: 2, end: 8 },
  ...{ fps: 30, width: 1280, height: 720, frames: 180 },
};
/** A clip that plays 3…7 s of the file from timeline 10 s. */
const clip = (cutout, over = {}) => ({
  ...{ clipId: 'me', sourceFile: FILE, sourceIn: 3, sourceOut: 7, timelineStart: 10 },
  ...{ timelineEnd: 14, ...(cutout && { cutout }), ...over },
});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual}`);

describe('pictureAt: the file a clip plays and where in it', () => {
  it('plays the clip’s own file without a cutout, and before one is made', () => {
    for (const cutout of [undefined, { on: true }, { on: false, made }]) {
      const at = pictureAt(clip(cutout), 4);
      assert.deepEqual([at.url, at.cutout, at.playing], [url(FILE), false, 4]);
      near(at.still, 4.001);
    }
    const other = pictureAt(clip({ on: true, made: { ...made, source: '/p/else.mp4' } }), 4);
    assert.equal(other.cutout, false, 'a cutout of another file is not this clip’s');
  });

  it('plays the cutout file at the frame that belongs to the moment', () => {
    const me = clip({ on: true, made });
    // 3 s of the source is 1 s into the cutout: frame 30, shown from its middle.
    const start = pictureAt(me, 3);
    assert.deepEqual([start.url, start.cutout], [url(CUT), true]);
    near(start.still, 30.5 / 30);
    near(start.playing, 1);
    // A moment inside frame 45 (3.5 s … 3.533 s of the source).
    near(pictureAt(me, 3.52).still, 45.5 / 30);
    near(pictureAt(me, 3.52).playing, 1.52);
    near(pictureAt(me, 6.98).still, 149.5 / 30);
    // A frame counts from a third of a frame before it starts, as in the render.
    near(pictureAt(me, 6.999).still, 150.5 / 30);
    // Rates the browser cannot count in: 29.97 is 30000/1001.
    const ntsc = pictureAt(clip({ on: true, made: { ...made, fps: 29.97 } }), 3);
    near(ntsc.still, 30.5 / (30000 / 1001));
  });

  it('plays the covered part of a clip trimmed beyond its cutout, the clip’s file for the rest', () => {
    const long = clip({ on: true, made }, { sourceIn: 1, sourceOut: 9 });
    assert.equal(pictureAt(long, 1.5).cutout, false, 'before what was made');
    assert.equal(pictureAt(long, 2).cutout, true);
    assert.equal(pictureAt(long, 7.99).cutout, true);
    assert.equal(pictureAt(long, 8.5).cutout, false, 'after it');
    // Half a frame of slack at either end holds the first and the last frame.
    near(pictureAt(long, 2 - 0.01).still, 0.5 / 30);
    near(pictureAt(long, 8 + 0.01).still, 179.5 / 30);
  });
});

describe('picture source', () => {
  let pool;
  let pictures;
  let clock;
  beforeEach(() => {
    clock = 1000;
    pool = createVideoPool(() => {});
    pictures = createPictureSource(pool, () => clock);
  });

  it('parks a paused element on the cutout’s frame and reloads when the cutout arrives', () => {
    pictures.park(clip({ on: true }), 4);
    const slot = pool.find('me');
    assert.equal(slot.el.src, url(FILE));
    slot.el.finishLoad();
    pictures.park(clip({ on: true, made }), 4);
    assert.equal(pool.find('me'), slot, 'the clip keeps its element');
    assert.equal(slot.el.src, url(CUT));
    assert.equal(slot.stale, true, 'the plain frame it held is not shown as a cutout');
    slot.el.finishLoad();
    near(slot.target, 60.5 / 30);
    near(slot.el.seeks.at(-1), 60.5 / 30);
    pictures.park(clip({ on: false, made }), 4);
    assert.equal(slot.el.src, url(FILE), 'switched off: the clip’s own file again');
  });

  it('keeps a playing element on the cutout’s clock', () => {
    const me = clip({ on: true, made });
    pictures.play(me, 3, 0);
    const { el } = pool.find('me');
    assert.equal(el.paused, false);
    near(el.seeks.at(-1), 1);
    el.finishLoad();
    el.finishSeek();
    el.advance(0.5);
    pictures.play(me, 3.5, 500);
    assert.equal(el.seeks.length, 1, 'in step: nothing to correct');
    // The clock loops back to the clip's start: the element follows at once.
    pictures.play(me, 3, 520);
    near(el.seeks.at(-1), 1);
  });

  it('falls back to the clip’s own file when the cutout file cannot be loaded', () => {
    const me = clip({ on: true, made });
    pictures.park(me, 4);
    const slot = pool.find('me');
    assert.equal(pictures.lost(), false);
    slot.el.dispatchEvent(new Event('error'));
    assert.equal(slot.failed, true);
    assert.equal(pictures.lost(), true, 'its clips need parking again');
    pictures.park(me, 4);
    assert.equal(slot.el.src, url(FILE));
    assert.equal(slot.failed, false);
    assert.equal(pictures.lost(), false);
    clock += 5000;
    pictures.park(me, 4);
    assert.equal(slot.el.src, url(FILE), 'not tried again at once');
    clock += 6000;
    pictures.park(me, 4);
    assert.equal(slot.el.src, url(CUT), 'tried again after a while');
    // While playing, a failed load is noticed on the next frame.
    slot.el.dispatchEvent(new Event('error'));
    pictures.play(me, 4, 0);
    assert.equal(slot.el.src, url(FILE));
  });
});
