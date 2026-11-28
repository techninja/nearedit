import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SONG_LIMITS } from '#utils/music/limits.js';
import { musicSeconds } from '#utils/music/timing.js';
import { MAX_SPAN, fitTempo, offGrid, usualTempo } from './fit.js';
import { STYLES, getStyle } from './styles.js';

const house = getStyle('house');
const barOf = (fit) => (fit.beatsPerBar * 60) / fit.bpm;

test('from twelve seconds to twelve minutes the span is whole bars at a tempo of the style', () => {
  let fitted = 0;
  for (const style of STYLES) {
    // Whole frames of 24, 25, 30 and 60 fps, and lengths that are no round number of anything.
    const lengths = [12, 15.04, 20, 24.5, 30, 36.2, 41 + 7 / 30, 59.96, 60, 75.6, 90, 133.3, 180];
    for (const seconds of [...lengths, 301.25, 487, 720]) {
      const fit = fitTempo(seconds, style);
      const at = `${style.id} ${seconds}s`;
      // Shorter than this, a range may hold no whole number of bars: the next test.
      if (seconds < (60 * style.beatsPerBar) / (style.bpm[1] - style.bpm[0])) continue;
      fitted++;
      assert.equal(fit.exact, 'bars', at);
      assert.ok(
        fit.bpm >= style.bpm[0] - 1e-9 && fit.bpm <= style.bpm[1] + 1e-9,
        `${at}: ${fit.bpm}`,
      );
      assert.ok(Number.isInteger(fit.bars) && fit.bars >= 1, at);
      assert.ok(Math.abs(fit.bars * barOf(fit) - seconds) < 1e-9, `${at}: ${fit.bars} bars`);
      assert.ok(Math.abs(fit.seconds - seconds) < 1e-9 && fit.rest < 1e-9, at);
      assert.equal(fit.beatsPerBar, style.beatsPerBar);
      // The engine agrees on how long that song is.
      const song = { bpm: fit.bpm, beatsPerBar: fit.beatsPerBar, bars: fit.bars };
      assert.ok(Math.abs(musicSeconds(song) - seconds) < 1e-9, at);
    }
  }
  assert.ok(fitted > 140, `${fitted} spans were long enough to be sure of`);
});

test('the tempo follows the energy inside the range, and an even number of bars is preferred', () => {
  assert.equal(usualTempo([100, 120]), 110);
  assert.equal(usualTempo([100, 120], 0), 105);
  assert.equal(usualTempo([100, 120], 1), 115);
  // 64 s of house (116–130 BPM): 31 bars (116.25), 32 (120), 33 (123.75), 34 (127.5) all fit.
  const calm = fitTempo(64, house, { energy: 0 });
  const lively = fitTempo(64, house, { energy: 1 });
  assert.deepEqual([calm.bars, calm.bpm], [32, 120]);
  assert.ok(lively.bpm > calm.bpm, `${lively.bpm}`);
  assert.equal(lively.bars % 2, 0, 'a whole number of two-bar phrases');
});

test('the tempo that puts the turning points on bar lines wins', () => {
  // 60 s of house is 29 to 32 bars; left alone it takes the tempo nearest its usual 123 BPM.
  assert.deepEqual([fitTempo(60, house).bars, fitTempo(60, house).bpm], [31, 124]);
  // A marker at 14 s is on a bar line only at 30 bars (2 s each).
  const marker = (time) => [{ time, weight: 3 }];
  assert.equal(fitTempo(60, house, { points: marker(14) }).bars, 30);
  // One at 15 s is on bar 8 of 32 bars (1.875 s each), and half a bar off at 30.
  assert.equal(fitTempo(60, house, { points: marker(15) }).bars, 32);
  assert.equal(offGrid(marker(15), 2), 1);
  assert.equal(offGrid(marker(15), 1.875), 0);
  assert.equal(offGrid([], 2), 0);
  // Weightier points count for more.
  const mixed = [
    { time: 15, weight: 1 },
    { time: 14, weight: 3 },
  ];
  assert.equal(fitTempo(60, house, { points: mixed }).bars, 30);
});

test('a span too short for whole bars is whole beats; shorter still, the usual tempo', () => {
  // 7 s of house: 3.5 bars at 120. No whole number of bars lies in 116–130 BPM.
  const beats = fitTempo(7, house);
  assert.equal(beats.exact, 'beats');
  assert.equal(beats.bpm, 120);
  assert.deepEqual([beats.bars, beats.seconds, beats.rest], [3, 6, 1]);
  for (const style of STYLES) {
    for (const seconds of [1, 1.5, 2.2, 3.1, 4.4, 5.3, 6.7, 8.9, 10.1, 11.3]) {
      const fit = fitTempo(seconds, style);
      const at = `${style.id} ${seconds}s`;
      assert.ok(fit.bars >= 1 && fit.rest >= -1e-9, at);
      assert.ok(
        fit.bpm >= style.bpm[0] - 1e-9 && fit.bpm <= style.bpm[1] + 1e-9,
        `${at}: ${fit.bpm}`,
      );
      const count = (seconds * fit.bpm) / 60;
      if (fit.exact === 'bars') assert.ok(Math.abs(fit.seconds - seconds) < 1e-9, at);
      if (fit.exact === 'beats') assert.ok(Math.abs(count - Math.round(count)) < 1e-9, at);
      // The music is whole bars and the rest of the span rings out — or, when the span is
      // shorter than a bar, one bar that the clip cuts short.
      const whole = seconds >= barOf(fit) - 1e-9;
      if (whole) assert.ok(Math.abs(fit.seconds + fit.rest - seconds) < 1e-9, at);
      else assert.deepEqual([fit.bars, fit.rest], [1, 0], at);
    }
  }
  // Less than one beat of the fastest house: nothing fits.
  const blip = fitTempo(0.3, house);
  assert.equal(blip.exact, 'free');
  assert.deepEqual([blip.bpm, blip.bars], [usualTempo(house.bpm), 1]);
  assert.equal(fitTempo(0, house).bars, 1);
  assert.equal(fitTempo(NaN, house).bars, 1);
});

test('a tempo that was asked for is kept: the music ends on its last whole bar', () => {
  const fit = fitTempo(31, house, { bpm: 120 });
  assert.deepEqual(
    [fit.exact, fit.bpm, fit.bars, fit.seconds, fit.rest],
    ['asked', 120, 15, 30, 1],
  );
  assert.equal(fitTempo(30, house, { bpm: 120 }).rest, 0);
  // Outside the style's range is the editor's business; outside the engine's is not.
  assert.equal(fitTempo(30, house, { bpm: 90 }).bpm, 90);
  assert.equal(fitTempo(30, house, { bpm: 12 }).bpm, SONG_LIMITS.bpm[0]);
  assert.equal(fitTempo(30, house, { bpm: 999 }).bpm, SONG_LIMITS.bpm[1]);
  assert.equal(fitTempo(1, house, { bpm: 60 }).bars, 1, 'never no bar at all');
});

test('a span longer than a song can be is scored as far as a song goes', () => {
  assert.equal(MAX_SPAN, SONG_LIMITS.seconds - SONG_LIMITS.tail[1]);
  for (const style of STYLES) {
    const fit = fitTempo(3000, style);
    assert.ok(fit.bars <= SONG_LIMITS.bars[1], style.id);
    assert.ok(fit.seconds <= MAX_SPAN + 1e-6, `${style.id}: ${fit.seconds}`);
    assert.ok(fit.bpm >= style.bpm[0] - 1e-9 && fit.bpm <= style.bpm[1] + 1e-9, style.id);
  }
  // Breakbeat is fast: 512 bars are over before the 19½ minutes are.
  const fast = fitTempo(MAX_SPAN, getStyle('breakbeat'));
  assert.deepEqual([fast.exact, fast.bars, fast.bpm], ['free', 512, 150]);
  assert.ok(fast.rest > 300);
});
