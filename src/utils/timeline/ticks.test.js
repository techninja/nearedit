import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickSteps, rulerTicks, stepCandidates, tickLabel } from './ticks.js';

describe('tick steps', () => {
  it('offers frame counts that divide a second, then seconds to hours', () => {
    assert.deepEqual(stepCandidates(30).slice(0, 9), [1, 2, 3, 5, 6, 10, 15, 30, 60]);
    assert.deepEqual(stepCandidates(24).slice(0, 8), [1, 2, 3, 4, 6, 8, 12, 24]);
    assert.equal(stepCandidates(25)[2], 25);
  });

  it('labels single frames when zoomed all the way in', () => {
    assert.deepEqual(pickSteps(4000, 30), { major: 1, minor: 1 });
  });

  it('labels seconds at zoom 1 with frame subdivisions', () => {
    const { major, minor } = pickSteps(100, 30);
    assert.equal(major, 60, 'a label every 2 s');
    assert.ok(major % minor === 0 && minor < major);
    assert.ok((minor / 30) * 100 >= 6, 'minor ticks at least 6 px apart');
  });

  it('labels minutes and hours when zoomed far out', () => {
    assert.equal(pickSteps(2, 30).major, 60 * 30);
    assert.equal(pickSteps(0.05, 30).major, 3600 * 30);
  });

  it('keeps labels at least the requested distance apart at every zoom', () => {
    for (let pps = 2; pps <= 4000; pps *= 1.37) {
      for (const fps of [24, 25, 30, 60, 29.97]) {
        const { major, minor } = pickSteps(pps, fps);
        const px = (frames) => (frames / fps) * pps;
        assert.ok(px(major) >= 104, `labels ${px(major)}px apart at ${pps}pps/${fps}fps`);
        assert.ok(px(major) < 104 * 6.1, `labels too sparse at ${pps}pps/${fps}fps`);
        assert.ok(px(minor) >= 6);
        assert.equal(major % minor, 0);
      }
    }
  });
});

describe('tick labels', () => {
  it('drops frames on whole-second steps and hours below one hour', () => {
    assert.equal(tickLabel(75, 30, 30), '01:15');
    assert.equal(tickLabel(75.5, 30, 15), '01:15:15');
    assert.equal(tickLabel(3725, 30, 300), '01:02:05');
    assert.equal(tickLabel(0, 30, 1), '00:00:00');
  });
});

describe('rulerTicks', () => {
  it('lists the ticks of the visible range only', () => {
    const ticks = rulerTicks(10, 20, 100, 30);
    assert.ok(ticks.length < 80);
    assert.equal(ticks[0].time, 10);
    assert.ok(ticks[0].major);
    assert.ok(ticks[ticks.length - 1].time <= 20 + 1e-9);
    const labels = ticks.filter((tick) => tick.major).map((tick) => tick.label);
    assert.deepEqual(labels, ['00:10', '00:12', '00:14', '00:16', '00:18', '00:20']);
  });

  it('starts at the label before the range so it can scroll out smoothly', () => {
    const ticks = rulerTicks(11, 13, 100, 30);
    assert.equal(ticks[0].time, 10);
    assert.equal(ticks[0].label, '00:10');
  });

  it('puts ticks exactly on frames at an hour into the timeline', () => {
    const ticks = rulerTicks(3600, 3600.25, 4000, 30);
    assert.deepEqual(
      ticks.map((tick) => Math.round(tick.time * 30)),
      [108000, 108001, 108002, 108003, 108004, 108005, 108006, 108007],
    );
    assert.equal(ticks[1].label, '01:00:00:01');
  });

  it('stays bounded for an hour-long view', () => {
    const ticks = rulerTicks(0, 3600, 0.4, 30);
    assert.ok(ticks.length < 300, `${ticks.length} ticks`);
    assert.ok(ticks.some((tick) => tick.label === '30:00'));
  });
});
