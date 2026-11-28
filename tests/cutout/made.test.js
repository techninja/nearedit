/**
 * What a clip remembers of its cutout: reading a job's result, the whole
 * `cutout` block of a clip, where a cutout stands, which frame of the file
 * a moment is, and telling a packed frame from a plain picture.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as cutout from '../../src/utils/cutout/index.js';

const { cleanCutout, cleanMade, cutoutOf, cutoutShown, cutoutState, isPacked, shownSize } = cutout;
const KEY = '0a51bd39df6c629f93d1';
const FILE = '/p/selfie.mp4';
/** The cutout of 3 … 20 s of the file, 1280 × 720 at 30 fps. */
const made = (over = {}) => ({
  ...{ file: `/p/.nearedit/cutout/${KEY}.mp4`, key: KEY, source: FILE, start: 3, end: 20 },
  ...{ fps: 30, width: 1280, height: 720, frames: 510, ...over },
});
const clip = (sourceIn, sourceOut, block = { on: true, made: made() }, more = {}) => ({
  ...{ clipId: 'c', sourceFile: FILE, sourceIn, sourceOut, timelineStart: 0 },
  ...{ timelineEnd: sourceOut - sourceIn, cutout: block, ...more },
});

describe('what was made for a cutout', () => {
  it('reads a job result, a description and a stored block; nothing that is not whole', () => {
    const stored = made();
    assert.equal(cleanMade(stored), stored, 'a clean one is kept as it is');
    assert.deepEqual(cleanMade({ ...stored, cached: true, model: 'm' }), stored);
    const described = { ...stored, source: { path: FILE, size: 1, mtime: 2 }, version: 1 };
    assert.deepEqual(cleanMade(described), stored, 'a description names its source as an object');
    for (const bad of [
      ...[null, 'x', [], {}, made({ file: '' }), made({ key: 'abc' }), made({ source: 7 })],
      ...[made({ start: -1 }), made({ end: 3 }), made({ fps: 0 }), made({ fps: 500 })],
      ...[made({ width: 0 }), made({ height: 720.5 }), made({ frames: '510' }), made({ end: NaN })],
    ])
      assert.equal(cleanMade(bad), null, JSON.stringify(bad));
    const proto = Object.create({ key: KEY });
    assert.equal(cleanMade(Object.assign(proto, { ...stored, key: undefined })), null);
  });

  it('keeps a block that says something: on, a setting, or a cutout that was made', () => {
    const defaults = cutout.CUTOUT_DEFAULTS;
    for (const nothing of [undefined, null, {}, { on: false }, { ...defaults }, { made: {} }])
      assert.equal(cleanCutout(nothing), null, JSON.stringify(nothing));
    assert.deepEqual(cleanCutout({ on: true }), { ...defaults, on: true });
    assert.deepEqual(cleanCutout({ shrink: 9 }), { ...defaults, shrink: 3 });
    const whole = { ...defaults, on: true, made: made() };
    assert.equal(cleanCutout(whole), whole, 'a clean block is kept as it is');
    assert.deepEqual(cleanCutout({ made: made(), extra: 1 }), { ...defaults, made: made() });
    assert.deepEqual(cleanCutout({ on: true, made: made({ frames: 0 }) }), { ...defaults, on: true });
    const problems = [];
    const report = (path, message) => problems.push(`${path} ${message}`);
    cutout.checkCutout(whole, 'c', report);
    assert.deepEqual(problems, []);
    cutout.checkCutout({ ...whole, made: made({ key: 'no' }) }, 'c', report);
    cutout.checkCutout({ ...whole, made: { ...made(), cached: true } }, 'c', report);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /^c\.made must be \{ file, key, source, start, end, fps/);
  });

  it('says where a clip’s cutout stands', () => {
    assert.equal(cutoutState({}), 'off');
    assert.equal(cutoutState(clip(4, 19, { on: false, made: made() })), 'off');
    assert.equal(cutoutState(clip(4, 19, { on: true })), 'missing');
    assert.equal(cutoutState(clip(4, 19)), 'ready');
    assert.equal(cutoutState(clip(4, 19), 30), 'ready');
    assert.equal(cutoutState(clip(3 - 0.016, 20 + 0.016)), 'ready', 'half a frame of slack');
    assert.equal(cutoutState(clip(2, 19)), 'stale', 'trimmed beyond the start');
    assert.equal(cutoutState(clip(4, 21)), 'stale', 'trimmed beyond the end');
    assert.equal(cutoutState(clip(4, 19), 25), 'stale', 'made at another frame rate');
    assert.equal(cutoutState(clip(4, 19), 29.97), 'stale');
    assert.equal(cutoutState(clip(4, 19, undefined, { sourceFile: '/p/b.mp4' })), 'missing');
    assert.equal(cutoutOf(clip(4, 19, undefined, { sourceFile: '/p/b.mp4' })), null);
    assert.deepEqual(cutoutOf(clip(4, 19)), made());
  });

  it('names the frame a host plays for a moment, and no frame outside what was made', () => {
    const me = clip(2, 21);
    assert.deepEqual(cutoutShown(me, 3), { made: made(), frame: 0, time: 0 });
    assert.deepEqual(cutoutShown(me, 4), { made: made(), frame: 30, time: 1 });
    assert.equal(cutoutShown(me, 20 - 1 / 30).frame, 509);
    assert.equal(cutoutShown(me, 2.5), null, 'before it: the plain picture');
    assert.equal(cutoutShown(me, 20.5), null, 'after it');
    assert.equal(cutoutShown(me, 3 - 0.01).frame, 0, 'half a frame early: the first frame');
    assert.equal(cutoutShown(me, 20 + 0.01).frame, 509, 'half a frame late: the last');
    assert.equal(cutoutShown(clip(4, 19, { on: true }), 5), null);
    assert.equal(cutoutShown(clip(4, 19, { on: false, made: made() }), 5), null);
  });

  it('tells a packed frame from a plain picture by its shape, at any size', () => {
    const one = made();
    assert.equal(isPacked(one, { width: 2560, height: 720 }), true);
    assert.equal(isPacked(one, { width: 1280, height: 720 }), false);
    assert.equal(isPacked(one, { width: 1154, height: 325 }), true, 'reduced for a small clip');
    assert.equal(isPacked(one, { width: 577, height: 325 }), false);
    assert.equal(isPacked(one, { width: 6, height: 2 }), true);
    assert.equal(isPacked(one, { width: 4, height: 2 }), false);
    assert.equal(isPacked(one, { width: 0, height: 0 }), false);
    const tall = made({ width: 608, height: 1080 });
    assert.equal(isPacked(tall, { width: 1216, height: 1080 }), true);
    assert.equal(isPacked(tall, { width: 1080, height: 1920 }), false, 'the phone video itself');
  });

  it('gives the size of the picture a frame shows: the left half of a packed one', () => {
    const me = clip(4, 19);
    assert.deepEqual(shownSize(me, { width: 2560, height: 720 }), { width: 1280, height: 720 });
    assert.deepEqual(shownSize(me, { width: 1280, height: 720 }), { width: 1280, height: 720 });
    assert.deepEqual(shownSize(me, { width: 1155, height: 325 }), { width: 577, height: 325 });
    const plain = { width: 2560, height: 720 };
    assert.equal(shownSize(clip(4, 19, { on: false, made: made() }), plain), plain);
    assert.equal(shownSize(clip(4, 19, undefined, { sourceFile: '/p/wide.mp4' }), plain), plain);
    assert.equal(shownSize({ sourceFile: FILE }, plain), plain, 'a clip without a cutout');
  });
});
