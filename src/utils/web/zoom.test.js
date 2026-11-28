import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { zoomKeyframes } from './index.js';
import { BUTTON, CORNER, FRAME, stateAt, trackOf } from './testkit.js';

describe('zoomKeyframes: when', () => {
  it('eases in during the duration, holds, and releases over 0.6 s', () => {
    const keys = zoomKeyframes(trackOf([{ rect: BUTTON }]), FRAME);
    assert.deepEqual(keys['transform.scaleX'], [
      { t: 1, v: 1, ease: 'ease-in-out' },
      { t: 1.6, v: 2.2, ease: 'linear' },
      { t: 3.1, v: 2.2, ease: 'ease-in-out' },
      { t: 3.7, v: 1, ease: 'linear' },
    ]);
    assert.deepEqual(keys['transform.scaleY'], keys['transform.scaleX']);
    // The button's middle is 160 right of and 50 below the page's: × 1.5 (fit) × 2.2.
    assert.deepEqual(
      keys['transform.x'].map((key) => [key.t, key.v]),
      [
        [1, 0],
        [1.6, -528],
        [3.1, -528],
        [3.7, 0],
      ],
    );
    assert.deepEqual(
      keys['transform.y'].map((key) => key.v),
      [0, -165, -165, 0],
    );
    assert.deepEqual(stateAt(keys, 0), [1, 0, 0]);
    assert.deepEqual(stateAt(keys, 2.5), [2.2, -528, -165]);
    assert.ok(stateAt(keys, 1.3)[0] > 1 && stateAt(keys, 1.3)[0] < 2.2);
    assert.deepEqual(stateAt(keys, 9), [1, 0, 0]);
  });

  it("takes the release and the easing from the options, on the track's frame grid", () => {
    const track = trackOf([{ rect: BUTTON }], { fps: 24 });
    const keys = zoomKeyframes(track, FRAME, { release: 1, ease: 'ease-out' });
    assert.deepEqual(
      keys['transform.scaleX'].map((key) => [key.t, key.ease]),
      [
        [1, 'ease-out'],
        [1.6, 'linear'],
        [3.1, 'ease-out'],
        [Math.round(4.1 * 24) / 24, 'linear'],
      ],
    );
    const cut = zoomKeyframes(trackOf([{ rect: BUTTON }]), FRAME, { release: 0 });
    assert.deepEqual(
      cut['transform.scaleX'].map((key) => [key.t, key.v, key.ease]),
      [
        [1, 1, 'ease-in-out'],
        [1.6, 2.2, 'hold'],
        [3.1, 1, 'linear'],
      ],
    );
  });

  it('glides straight to the next zoom when it starts within the join', () => {
    const track = trackOf([{ rect: BUTTON }, { rect: CORNER, start: 4 }]);
    const keys = zoomKeyframes(track, FRAME);
    assert.deepEqual(
      keys['transform.x'].map((key) => [key.t, key.v]),
      [
        [1, 0],
        [1.6, -528],
        [3.1, -528],
        [4, -528],
        [4.6, 1152],
        [6.1, 1152],
        [6.7, 0],
      ],
    );
    assert.ok(
      keys['transform.scaleX'].slice(1, 6).every((key) => key.v === 2.2),
      'never back to 1 between',
    );
    const [scale, x] = stateAt(keys, 4.3);
    assert.equal(scale, 2.2);
    assert.ok(x > -528 && x < 1152);
  });

  it('releases in between when the next zoom is further away', () => {
    const track = trackOf([{ rect: BUTTON }, { rect: CORNER, start: 5 }]);
    const keys = zoomKeyframes(track, FRAME);
    assert.deepEqual(
      keys['transform.scaleX'].map((key) => [key.t, key.v]),
      [
        [1, 1],
        [1.6, 2.2],
        [3.1, 2.2],
        [3.7, 1],
        [5, 1],
        [5.6, 2.2],
        [7.1, 2.2],
        [7.7, 1],
      ],
    );
    const joined = zoomKeyframes(track, FRAME, { join: 2 });
    assert.equal(joined['transform.scaleX'].length, 7);
    const apart = zoomKeyframes(trackOf([{ rect: BUTTON }, { rect: CORNER, start: 4 }]), FRAME, {
      join: 0.5,
    });
    assert.equal(apart['transform.scaleX'].length, 8);
  });

  it('a release never runs into the next zoom', () => {
    const track = trackOf([{ rect: BUTTON }, { rect: CORNER, start: 3.4 }]);
    const keys = zoomKeyframes(track, FRAME, { join: 0.1, release: 2 });
    const times = keys['transform.scaleX'].map((key) => key.t);
    assert.deepEqual(times, [1, 1.6, 3.1, 3.4, 4, 5.5, 7.5]);
    assert.equal(keys['transform.scaleX'][3].v, 1);
  });

  it('a step without duration is a cut', () => {
    const keys = zoomKeyframes(trackOf([{ rect: BUTTON, duration: 0 }]), FRAME);
    assert.deepEqual(
      keys['transform.scaleX'].map((key) => [key.t, key.v, key.ease]),
      [
        [0, 1, 'hold'],
        [1, 2.2, 'linear'],
        [2.5, 2.2, 'ease-in-out'],
        [3.1, 1, 'linear'],
      ],
    );
    assert.deepEqual(stateAt(keys, 0.99), [1, 0, 0]);
    assert.deepEqual(stateAt(keys, 1), [2.2, -528, -165]);
    const atStart = zoomKeyframes(trackOf([{ rect: BUTTON, duration: 0, start: 0 }]), FRAME);
    assert.deepEqual(
      atStart['transform.scaleX'].map((key) => [key.t, key.v]),
      [
        [0, 2.2],
        [1.5, 2.2],
        [2.1, 1],
      ],
    );
  });

  it('keys are strictly ordered and equal in number on all four paths', () => {
    const steps = Array.from({ length: 30 }, (_, i) => ({
      rect: {
        x: (i * 97) % 1100,
        y: (i * 53) % 650,
        width: 40 + (i % 5) * 60,
        height: 30 + (i % 3) * 40,
      },
      duration: [0, 0.3, 0.6][i % 3],
      hold: [0, 0.5, 2][i % 3],
      start: 1 + i * 1.9,
    }));
    for (const options of [{}, { join: 0 }, { release: 0 }, { join: 9, release: 3 }]) {
      const keys = zoomKeyframes(trackOf(steps), FRAME, options);
      const counts = Object.values(keys).map((list) => list.length);
      assert.equal(new Set(counts).size, 1);
      for (const list of Object.values(keys)) {
        assert.ok(list.every((key, i) => i === 0 || key.t - list[i - 1].t > 1e-6));
        assert.ok(list.every((key) => Number.isFinite(key.v) && Number.isFinite(key.t)));
      }
    }
  });
});

describe('zoomKeyframes: which steps', () => {
  const steps = [
    { do: 'click', rect: BUTTON },
    { do: 'type', rect: CORNER, start: 10 },
    { do: 'hover', rect: BUTTON, start: 20 },
    { do: 'focus', rect: BUTTON, start: 30 },
    { do: 'focus', rect: BUTTON, start: 40, missing: true },
    { do: 'focus', start: 50 },
    { do: 'type', start: 55 },
  ];

  it('focus steps always; clicks and typed-into fields only when asked', () => {
    const plain = zoomKeyframes(trackOf(steps), FRAME);
    assert.deepEqual(
      plain['transform.scaleX'].map((key) => key.t),
      [30, 30.6, 32.1, 32.7],
    );
    const clicks = zoomKeyframes(trackOf(steps), FRAME, { clicks: true });
    assert.deepEqual(
      clicks['transform.scaleX']
        .filter((key) => key.v === 1 && key.ease !== 'linear')
        .map((key) => key.t),
      [1, 10, 30],
    );
  });

  it('ignores steps that are missing or have no rectangle', () => {
    const keys = zoomKeyframes(trackOf(steps), FRAME, { clicks: true });
    assert.ok(keys['transform.scaleX'].every((key) => key.t < 40));
  });
});
