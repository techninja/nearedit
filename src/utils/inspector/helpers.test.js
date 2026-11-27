import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClip } from '#utils/edl/factory.js';
import { animationSpan, unitCount } from './animationSpan.js';
import { imagesOf } from './imageChoices.js';
import { placeMenu } from './popup.js';
import { gapAt, indexAfterDrop, indexAfterKey } from './reorder.js';

describe('placeMenu', () => {
  const viewport = { width: 1000, height: 800 };
  const menu = { width: 200, height: 400 };

  it('opens under the button, lined up with its right edge', () => {
    const at = placeMenu({ left: 500, right: 520, top: 100, bottom: 120 }, menu, viewport);
    assert.deepEqual(at, { left: 320, top: 124, maxHeight: 400 });
  });

  it('flips above when there is no room below, and stays inside the window', () => {
    const low = placeMenu({ left: 500, right: 520, top: 700, bottom: 720 }, menu, viewport);
    assert.deepEqual(low, { left: 320, top: 296, maxHeight: 400 });
    const corner = placeMenu({ left: 10, right: 30, top: 10, bottom: 30 }, menu, viewport);
    assert.equal(corner.left, 4);
    const tight = placeMenu({ left: 500, right: 520, top: 150, bottom: 170 }, menu, {
      width: 1000,
      height: 400,
    });
    assert.ok(tight.maxHeight < 400 && tight.top + tight.maxHeight <= 400);
  });
});

describe('reordering a list', () => {
  const rects = [0, 40, 80].map((top) => ({ top, bottom: top + 40 }));

  it('finds the gap the pointer is nearest to', () => {
    assert.deepEqual(
      [-5, 10, 30, 70, 110, 500].map((y) => gapAt(y, rects)),
      [0, 0, 1, 2, 3, 3],
    );
  });

  it('turns a drop and a key press into a move', () => {
    assert.deepEqual(
      [0, 1, 2, 3].map((gap) => indexAfterDrop(0, gap)),
      [0, 0, 1, 2],
    );
    assert.deepEqual(
      [0, 1, 2, 3].map((gap) => indexAfterDrop(2, gap)),
      [0, 1, 2, 2],
    );
    assert.equal(indexAfterKey(1, 'ArrowUp', 3), 0);
    assert.equal(indexAfterKey(1, 'End', 3), 2);
    assert.equal(indexAfterKey(0, 'ArrowUp', 3), null, 'already at the top');
    assert.equal(indexAfterKey(0, 'x', 3), null);
  });
});

describe('animation preview span', () => {
  const title = (text) => createClip({ timelineStart: 10, timelineEnd: 20, text });

  it('counts the pieces an animation moves', () => {
    assert.equal(unitCount('One two\nthree', 'block'), 1);
    assert.equal(unitCount('One two\n\nthree', 'line'), 2);
    assert.equal(unitCount('One two\nthree', 'word'), 3);
    assert.equal(unitCount('One two', 'char'), 6);
    assert.equal(unitCount('', 'word'), 1);
  });

  it('covers the entrance from the clip start and the exit up to its end', () => {
    const animateIn = { type: 'fade', duration: 0.5, by: 'word', stagger: 0.1, ease: 'linear' };
    const clip = title({ content: 'a b c', animateIn, animateOut: { ...animateIn, by: 'block' } });
    const span = animationSpan(clip, 'in');
    assert.equal(span.from, 10);
    assert.ok(Math.abs(span.to - (10 + 0.5 + 0.2 + 0.6)) < 1e-9);
    const out = animationSpan(clip, 'out');
    assert.equal(out.to, 20);
    assert.ok(Math.abs(out.from - (20 - 0.5 - 0.6)) < 1e-9);
    const long = title({ content: 'a', animateIn: { ...animateIn, duration: 60 } });
    assert.deepEqual(animationSpan(long, 'in'), { from: 10, to: 20 }, 'never beyond the clip');
  });
});

describe('image choices', () => {
  it('offers the stills of a media list by name', () => {
    const items = [
      { type: 'video', filePath: '/m/a.mp4', filename: 'a.mp4' },
      { type: 'image', filePath: '/m/z.png', filename: 'z.png' },
      { type: 'image', filePath: '/m/b.jpg', filename: 'b.jpg' },
    ];
    assert.deepEqual(imagesOf(items), [
      { path: '/m/b.jpg', name: 'b.jpg' },
      { path: '/m/z.png', name: 'z.png' },
    ]);
  });
});
