import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PREVIEW_PIXELS, fitPreview } from './previewSize.js';

describe('fitPreview', () => {
  it('letterboxes a wide frame in a tall container', () => {
    const size = fitPreview(400, 800, 1920, 1080);
    assert.deepEqual([size.cssWidth, size.cssHeight], [400, 225]);
  });

  it('pillarboxes a wide frame in a wider container', () => {
    const size = fitPreview(1000, 360, 1920, 1080);
    assert.deepEqual([size.cssWidth, size.cssHeight], [640, 360]);
  });

  it('fits a vertical 9:16 adaptation by height', () => {
    const size = fitPreview(800, 640, 1080, 1920);
    assert.deepEqual([size.cssWidth, size.cssHeight], [360, 640]);
  });

  it('multiplies the backing store by the device pixel ratio', () => {
    const size = fitPreview(640, 360, 1920, 1080, 2);
    assert.deepEqual([size.width, size.height], [1280, 720]);
  });

  it('never renders finer than the output resolution', () => {
    const size = fitPreview(1280, 720, 1280, 720, 3);
    assert.deepEqual([size.width, size.height], [1280, 720]);
    const small = fitPreview(1000, 1000, 320, 180, 2);
    assert.deepEqual([small.width, small.height], [320, 180]);
  });

  it('caps the backing store at the pixel budget, keeping the aspect', () => {
    const size = fitPreview(3840, 2160, 3840, 2160, 2);
    assert.ok(size.width * size.height <= MAX_PREVIEW_PIXELS * 1.01);
    assert.ok(Math.abs(size.width / size.height - 16 / 9) < 0.01);
    assert.deepEqual([size.cssWidth, size.cssHeight], [3840, 2160]);
  });

  it('honours a custom budget', () => {
    const size = fitPreview(1000, 1000, 1000, 1000, 1, 250_000);
    assert.deepEqual([size.width, size.height], [500, 500]);
  });

  it('stays at least one pixel for a collapsed container or bad input', () => {
    for (const size of [
      fitPreview(0, 0, 1920, 1080),
      fitPreview(NaN, 300, 1920, 1080),
      fitPreview(300, 300, 0, 0, 0),
    ]) {
      assert.ok(size.width >= 1 && size.height >= 1);
      assert.ok(size.cssWidth >= 1 && size.cssHeight >= 1);
      assert.ok(Number.isFinite(size.width) && Number.isFinite(size.height));
    }
  });
});
