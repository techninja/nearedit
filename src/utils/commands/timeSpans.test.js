import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SHUTTLE_RATES, nextShuttleRate, shuttleLabel, shuttleStep } from './shuttle.js';
import { extendSpan, parseTimeEntry, recalled, remembered, spanAround } from './timeSpans.js';

const F = 1 / 30;

describe('shuttle', () => {
  it('starts at normal speed, steps up on each press, and turns round at normal speed', () => {
    assert.equal(nextShuttleRate(0, 1), 1);
    assert.equal(nextShuttleRate(1, 1), 2);
    assert.equal(nextShuttleRate(2, 1), 4);
    assert.equal(nextShuttleRate(SHUTTLE_RATES.at(-1), 1), SHUTTLE_RATES.at(-1), 'tops out');
    assert.equal(nextShuttleRate(4, -1), -1);
    assert.equal(nextShuttleRate(0, -1), -1);
    assert.equal(nextShuttleRate(-1, -1), -2);
    assert.equal(nextShuttleRate(-8, 1), 1);
  });

  it('moves at its rate and stops at either end of the timeline', () => {
    assert.deepEqual(shuttleStep(5, 2, 0.5, 20), { position: 6, ended: false });
    assert.deepEqual(shuttleStep(5, -4, 0.5, 20), { position: 3, ended: false });
    assert.deepEqual(shuttleStep(0.5, -4, 0.5, 20), { position: 0, ended: true });
    assert.deepEqual(shuttleStep(19.5, 2, 0.5, 20), { position: 20, ended: true });
    assert.deepEqual(
      shuttleStep(5, 2, -1, 20),
      { position: 5, ended: false },
      'time never runs back',
    );
    assert.deepEqual(
      [shuttleLabel(0), shuttleLabel(1), shuttleLabel(2), shuttleLabel(-4)],
      ['', '', '2×', '−4×'],
    );
  });
});

describe('time spans', () => {
  it('extends from the end the cursor is on, or starts anew', () => {
    assert.deepEqual(extendSpan({ start: 2, end: 7 }, 7, 8), { start: 2, end: 8, fresh: false });
    assert.deepEqual(extendSpan({ start: 2, end: 7 }, 2, 1), { start: 1, end: 7, fresh: false });
    assert.deepEqual(
      extendSpan({ start: 2, end: 7 }, 7, 1),
      { start: 1, end: 2, fresh: false },
      'crossing the anchor',
    );
    assert.deepEqual(extendSpan({ start: 2, end: 7 }, 4, 5), { start: 4, end: 5, fresh: true });
    assert.deepEqual(extendSpan(null, 4, 3), { start: 3, end: 4, fresh: true });
  });

  it('finds the span between the markers around a time', () => {
    assert.deepEqual(spanAround([3, 9, 6], 7, 20), { start: 6, end: 9 });
    assert.deepEqual(spanAround([3, 9], 1, 20), { start: 0, end: 3 });
    assert.deepEqual(spanAround([3, 9], 12, 20), { start: 9, end: 20 });
    assert.deepEqual(spanAround([], 12, 20), { start: 0, end: 20 });
    assert.deepEqual(
      spanAround([3], 3, 20),
      { start: 3, end: 20 },
      'on a marker: the span after it',
    );
  });

  it('remembers five selections and cycles through them', () => {
    let history = [];
    for (let i = 1; i <= 7; i++) history = remembered(history, { start: i, end: i + 1 });
    assert.deepEqual(
      history.map((span) => span.start),
      [3, 4, 5, 6, 7],
    );
    assert.equal(remembered(history, { start: 7, end: 8 }), history, 'not twice in a row');
    assert.equal(remembered(history, { start: 1, end: 1 }), history, 'nothing to remember');
    const first = recalled(history, { start: 9, end: 10 });
    assert.deepEqual(first.span, { start: 7, end: 8 });
    assert.deepEqual(
      first.history.map((span) => span.start),
      [9, 3, 4, 5, 6],
    );
    assert.deepEqual(recalled([], { start: 1, end: 2 }), { history: [], span: null });
    assert.equal(recalled(history, null).history.length, 4);
  });

  it('reads a typed time the ways an editor writes one', () => {
    const cases = {
      '1:02:03:04': 3723 + 4 * F,
      '10:00': 10,
      1000: 10,
      12: 12 * F,
      12.5: 12.5,
      '.5': 0.5,
    };
    for (const [text, seconds] of Object.entries(cases)) {
      assert.ok(Math.abs(parseTimeEntry(text, 30) - seconds) < 1e-9, text);
    }
    assert.equal(parseTimeEntry('+2:00', 30, 5), 7);
    assert.equal(parseTimeEntry('-10.', 30, 5), 0, 'never before the start');
    assert.equal(parseTimeEntry('1000', 24), 10);
    for (const text of ['', 'abc', '1:2:3:4:5', '1.2.3'])
      assert.ok(Number.isNaN(parseTimeEntry(text)));
  });
});
