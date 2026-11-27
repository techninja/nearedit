import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clipGain } from '#utils/edl/levels.js';
import { gainAt, gainEvents, gainPoints } from './envelope.js';

const track = { volume: 0.8 };
const clip = (extra = {}) => ({
  timelineStart: 2,
  timelineEnd: 10,
  fadeIn: 0,
  fadeOut: 0,
  volume: 0.5,
  ...extra,
});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

describe('gainPoints', () => {
  it('is flat at track × clip volume without fades', () => {
    assert.deepEqual(gainPoints(track, clip()), [
      { time: 2, value: 0.4 },
      { time: 10, value: 0.4 },
    ]);
  });

  it('ramps up over fadeIn and down over fadeOut', () => {
    const points = gainPoints(track, clip({ fadeIn: 1, fadeOut: 2 }));
    assert.deepEqual(
      points.map((p) => p.time),
      [2, 3, 8, 10],
    );
    assert.deepEqual(
      points.map((p) => p.value),
      [0, 0.4, 0.4, 0],
    );
  });

  it('matches clipGain everywhere, including broken overlapping fades', () => {
    for (const c of [
      clip({ fadeIn: 1, fadeOut: 2 }),
      clip({ fadeIn: 6, fadeOut: 6 }),
      clip({ fadeIn: 8 }),
    ]) {
      const points = gainPoints(track, c);
      for (let t = 2; t < 10; t += 0.125) near(gainAt(points, t), clipGain(track, c, t));
    }
  });

  it('defaults missing volumes to unity', () => {
    const points = gainPoints({}, { timelineStart: 0, timelineEnd: 1 });
    assert.deepEqual(points, [
      { time: 0, value: 1 },
      { time: 1, value: 1 },
    ]);
  });
});

describe('gainAt', () => {
  const points = gainPoints(track, clip({ fadeIn: 1, fadeOut: 2 }));

  it('interpolates inside a fade', () => {
    near(gainAt(points, 2.5), 0.2);
    near(gainAt(points, 9), 0.2);
    near(gainAt(points, 5), 0.4);
  });

  it('is silent outside the clip', () => {
    assert.equal(gainAt(points, 1.99), 0);
    assert.equal(gainAt(points, 10), 0);
    assert.equal(gainAt([], 3), 0);
  });
});

describe('gainEvents', () => {
  const points = gainPoints(track, clip({ fadeIn: 1, fadeOut: 2 }));

  it('holds silence, then opens exactly at the clip start when cued early', () => {
    assert.deepEqual(gainEvents(points, 1.5), [
      { type: 'set', time: 1.5, value: 0 },
      { type: 'set', time: 2, value: 0 },
      { type: 'ramp', time: 3, value: 0.4 },
      { type: 'ramp', time: 8, value: 0.4 },
      { type: 'ramp', time: 10, value: 0 },
      { type: 'set', time: 10, value: 0 },
    ]);
  });

  it('picks up mid-fade at the interpolated level', () => {
    const events = gainEvents(points, 2.25);
    assert.equal(events[0].type, 'set');
    near(events[0].value, 0.1);
    assert.deepEqual(events.slice(1), [
      { type: 'ramp', time: 3, value: 0.4 },
      { type: 'ramp', time: 8, value: 0.4 },
      { type: 'ramp', time: 10, value: 0 },
      { type: 'set', time: 10, value: 0 },
    ]);
  });

  it('starts at full level mid-clip and closes hard at the end without a fade', () => {
    assert.deepEqual(gainEvents(gainPoints(track, clip()), 5), [
      { type: 'set', time: 5, value: 0.4 },
      { type: 'ramp', time: 10, value: 0.4 },
      { type: 'set', time: 10, value: 0 },
    ]);
  });

  it('is plain silence after the clip and for an empty envelope', () => {
    assert.deepEqual(gainEvents(points, 11), [{ type: 'set', time: 11, value: 0 }]);
    assert.deepEqual(gainEvents([], 4), [{ type: 'set', time: 4, value: 0 }]);
  });

  it('never schedules an event before the position, in time order', () => {
    for (const position of [0, 2, 2.5, 3, 7.9, 9.5]) {
      const events = gainEvents(points, position);
      for (let i = 0; i < events.length; i++) {
        assert.ok(events[i].time >= position);
        if (i) assert.ok(events[i].time >= events[i - 1].time);
      }
    }
  });

  it('gives an equal-gain cross-fade: both clips sum to unity mid-overlap', () => {
    const out = gainPoints({}, { timelineStart: 0, timelineEnd: 4, fadeOut: 1 });
    const into = gainPoints({}, { timelineStart: 3, timelineEnd: 8, fadeIn: 1 });
    for (const t of [3.1, 3.5, 3.9]) near(gainAt(out, t) + gainAt(into, t), 1);
  });
});
