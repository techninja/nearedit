import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeElements } from './testing/fakeMediaElement.js';

installFakeElements();
const { createVideoPool } = await import('./videoPool.js');
const { aimSlot, driveSlot, hasFrame, isSettled } = await import('./videoSlot.js');

describe('video pool', () => {
  let pool;
  let frames;
  beforeEach(() => {
    frames = 0;
    pool = createVideoPool(() => frames++);
  });

  it('gives each clip its own element, even for the same file', () => {
    const a = pool.acquire('a', '/v.mp4');
    const b = pool.acquire('b', '/v.mp4');
    assert.notEqual(a.el, b.el);
    assert.equal(a.el.src, '/v.mp4');
    assert.equal(pool.acquire('a', '/v.mp4'), a);
    assert.equal(pool.find('b'), b);
    assert.equal(pool.slots().length, 2);
  });

  it('recycles a freed element, preferring one that already holds the file', () => {
    const a = pool.acquire('a', '/one.mp4');
    const b = pool.acquire('b', '/two.mp4');
    pool.retain(new Set());
    assert.ok(a.el.paused && !a.clipId && !b.clipId);
    const c = pool.acquire('c', '/two.mp4');
    assert.equal(c, b);
    assert.equal(c.el.src, '/two.mp4');
    assert.equal(c.stale, true); // its frame still belongs to clip b
  });

  it('reloads a slot whose clip was relinked to another file', () => {
    const a = pool.acquire('a', '/one.mp4');
    a.el.finishLoad();
    const again = pool.acquire('a', '/two.mp4');
    assert.equal(again, a);
    assert.equal(a.el.src, '/two.mp4');
    assert.equal(a.el.readyState, 0);
    assert.equal(hasFrame(a), false);
  });

  it('keeps a few idle elements loaded and unloads the rest', () => {
    for (let i = 0; i < 6; i++) pool.acquire(`c${i}`, `/v${i}.mp4`);
    const elements = pool.slots().map((slot) => slot.el);
    pool.retain(new Set(['c0']));
    assert.equal(pool.slots().length, 4); // one in use + three idle
    assert.equal(elements.filter((el) => el.src === '').length, 2);
  });

  it('releases every element on destroy', () => {
    const elements = [pool.acquire('a', '/a.mp4').el, pool.acquire('b', '/b.mp4').el];
    pool.destroy();
    assert.equal(pool.slots().length, 0);
    assert.ok(elements.every((el) => el.src === '' && el.paused));
  });
});

describe('video slot: scrubbing while paused', () => {
  let pool;
  let frames;
  let slot;
  beforeEach(() => {
    frames = 0;
    pool = createVideoPool(() => frames++);
    slot = pool.acquire('a', '/v.mp4');
  });

  it('has no frame until its media has loaded and landed', () => {
    aimSlot(slot, 2);
    assert.equal(hasFrame(slot), false);
    assert.equal(isSettled(slot), false);
    slot.el.finishLoad();
    assert.equal(hasFrame(slot), true);
    assert.equal(isSettled(slot), true);
    assert.equal(frames, 1);
  });

  it('seeks to the requested time and reports the frame when it lands', () => {
    slot.el.finishLoad();
    aimSlot(slot, 5);
    assert.deepEqual(slot.el.seeks, [5]);
    assert.equal(isSettled(slot), false);
    slot.el.finishSeek();
    assert.equal(isSettled(slot), true);
    assert.equal(frames, 2);
  });

  it('under fast scrubbing never queues seeks: the latest request wins', () => {
    slot.el.finishLoad();
    aimSlot(slot, 1);
    for (const time of [2, 3, 4, 5, 6, 7]) aimSlot(slot, time); // while the first seek is in flight
    assert.deepEqual(slot.el.seeks, [1]);
    slot.el.finishSeek(); // lands on 1: chase the newest target, skipping 2…6
    assert.deepEqual(slot.el.seeks, [1, 7]);
    assert.equal(isSettled(slot), false);
    assert.equal(hasFrame(slot), true); // the frame of 1 may be shown meanwhile
    slot.el.finishSeek();
    assert.equal(isSettled(slot), true);
    assert.deepEqual(slot.el.seeks, [1, 7]);
  });

  it('does not seek again when already on the target', () => {
    slot.el.finishLoad();
    aimSlot(slot, 3);
    slot.el.finishSeek();
    aimSlot(slot, 3);
    aimSlot(slot, 3);
    assert.deepEqual(slot.el.seeks, [3]);
  });

  it('pauses a playing element when aimed', () => {
    slot.el.finishLoad();
    slot.el.play();
    slot.el.playbackRate = 1.05;
    aimSlot(slot, 4);
    assert.ok(slot.el.paused);
    assert.equal(slot.el.playbackRate, 1);
  });

  it('treats a recycled element as stale until it lands on its new clip', () => {
    slot.el.finishLoad();
    aimSlot(slot, 3);
    slot.el.finishSeek();
    pool.retain(new Set());
    const next = pool.acquire('b', '/v.mp4');
    assert.equal(next, slot);
    assert.equal(hasFrame(next), false);
    aimSlot(next, 9);
    next.el.finishSeek();
    assert.equal(hasFrame(next), true);
  });

  it('accepts a recycled element that is already on the right frame', () => {
    slot.el.finishLoad();
    aimSlot(slot, 3);
    slot.el.finishSeek();
    pool.retain(new Set());
    const next = pool.acquire('b', '/v.mp4');
    aimSlot(next, 3);
    assert.equal(isSettled(next), true);
  });

  it('counts a failed load as settled, with no frame', () => {
    slot.el.src = '/missing.mp4';
    slot.el.dispatchEvent(new Event('error'));
    assert.equal(slot.failed, true);
    assert.equal(hasFrame(slot), false);
    assert.equal(isSettled(slot), true);
    assert.equal(frames, 1);
  });
});

describe('video slot: playing', () => {
  it('starts a parked element without seeking and keeps its frame valid', () => {
    const pool = createVideoPool(() => {});
    const slot = pool.acquire('a', '/v.mp4');
    slot.el.finishLoad();
    aimSlot(slot, 2.001); // parked on the first frame of the clip
    slot.el.finishSeek();
    driveSlot(slot, 2.008, 1000);
    assert.ok(!slot.el.paused);
    assert.deepEqual(slot.el.seeks, [2.001]);
    assert.equal(hasFrame(slot), true);
  });

  it('does not chase the paused target once playing', () => {
    const pool = createVideoPool(() => {});
    const slot = pool.acquire('a', '/v.mp4');
    slot.el.finishLoad();
    aimSlot(slot, 2);
    slot.el.finishSeek();
    driveSlot(slot, 2, 1000);
    slot.el.time = 2.5;
    slot.el.finishSeek(); // a stray seeked while playing
    assert.deepEqual(slot.el.seeks, [2]);
  });

  it('nudges small drift and re-seeks large drift', () => {
    const pool = createVideoPool(() => {});
    const slot = pool.acquire('a', '/v.mp4');
    slot.el.finishLoad();
    driveSlot(slot, 0, 1000);
    slot.el.time = 1 - 0.04;
    driveSlot(slot, 1, 2000);
    assert.ok(slot.el.playbackRate > 1);
    slot.el.time = 1.5; // half a second behind: a stall, not a slow start
    driveSlot(slot, 2.016, 3016);
    assert.equal(slot.el.currentTime, 2.016);
  });
});
