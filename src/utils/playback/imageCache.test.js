import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createImageCache, dropStill, stillAddress } from './imageCache.js';

/** Every image a cache made, in order; a test loads or fails them by hand. */
let made = [];
class FakeImage {
  constructor() {
    this.naturalWidth = 0;
    made.push(this);
  }
  /** The picture arrived. */
  load(width = 64) {
    this.naturalWidth = width;
    this.onload();
  }
}

describe('the still cache', () => {
  before(() => void (globalThis.Image = /** @type {any} */ (FakeImage)));
  after(() => void delete globalThis.Image);
  beforeEach(() => void (made = []));

  it('decodes a still once and says when it is drawable', () => {
    let arrived = 0;
    const cache = createImageCache(() => arrived++);
    const still = cache.get('/api/media/file?path=%2Fa.png');
    assert.equal(still.ready, false);
    assert.equal(made[0].src, '/api/media/file?path=%2Fa.png');
    made[0].load();
    assert.deepEqual([still.ready, still.failed, arrived], [true, false, 1]);
    assert.equal(cache.get('/api/media/file?path=%2Fa.png'), still);
    assert.equal(made.length, 1, 'asked for again: the same picture');
    cache.clear();
  });

  it('forgets a still whose file was replaced, tells its owner, and reads it afresh', () => {
    let arrived = 0;
    const cache = createImageCache(() => arrived++);
    const url = '/api/media/file?path=%2Fkit%2Flogo.png';
    const old = cache.get(url);
    made[0].load(64);
    const other = cache.get('/api/media/file?path=%2Fother.png');
    assert.equal(arrived, 1);

    dropStill(url);
    assert.equal(arrived, 2, 'the owner is told: a paused preview paints again');
    assert.equal(cache.size(), 1, 'only that still went');
    assert.equal(cache.get('/api/media/file?path=%2Fother.png'), other);

    const fresh = cache.get(url);
    assert.notEqual(fresh, old);
    assert.equal(fresh.ready, false, 'not drawable until the new picture has arrived');
    // An address the browser has not read: its own caches cannot answer with the old bytes.
    assert.match(made[2].src, /^\/api\/media\/file\?path=%2Fkit%2Flogo\.png&fresh=[a-z0-9]+\.\d+$/);
    assert.equal(stillAddress(url), made[2].src);
    assert.equal(
      stillAddress('/api/media/file?path=%2Fother.png'),
      other.image.src,
      'others as before',
    );
    made[2].load(128);
    assert.deepEqual([fresh.ready, fresh.image.naturalWidth, arrived], [true, 128, 3]);

    // Replaced once more: another address again.
    dropStill(url);
    cache.get(url);
    assert.notEqual(made[3].src, made[2].src);
    assert.match(made[3].src, /&fresh=/);
    cache.clear();
  });

  it('tells only the caches that held the still, and none that was cleared', () => {
    const told = { a: 0, b: 0, c: 0 };
    const [a, b, c] = ['a', 'b', 'c'].map((name) => createImageCache(() => told[name]++));
    a.get('/x.png');
    b.get('/y.png');
    c.get('/x.png');
    c.clear();
    dropStill('/x.png');
    assert.deepEqual(told, { a: 1, b: 0, c: 0 });
    // A cache made afterwards reads the new file too.
    const late = createImageCache(() => {});
    late.get('/x.png');
    assert.match(made[made.length - 1].src, /^\/x\.png\?fresh=[a-z0-9]+\.\d+$/);
    for (const cache of [a, b, late]) cache.clear();
  });

  it('is not disturbed by a picture that arrives after it was dropped', () => {
    let arrived = 0;
    const cache = createImageCache(() => arrived++);
    const stale = cache.get('/late.png');
    dropStill('/late.png');
    const fresh = cache.get('/late.png');
    made[0].load();
    assert.equal(stale.ready, true);
    assert.equal(fresh.ready, false, 'the new still waits for its own picture');
    assert.equal(cache.get('/late.png'), fresh);
    cache.clear();
  });
});
