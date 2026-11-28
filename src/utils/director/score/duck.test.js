import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveClip } from '#utils/edl/animate.js';
import { createClip } from '#utils/edl/factory.js';
import {
  HOLD,
  JOIN,
  LEAD,
  RAMP,
  coverage,
  duckKeys,
  duckSpans,
  gainOf,
  joinSpans,
} from './duck.js';
import { clipSpeech } from './speech.js';

const span = (start, end) => ({ start, end });
const times = (keys) => keys.map((key) => [key.t, key.v]);
/** The volume a clip with these keys has at a time, as the editor and the render resolve it. */
function volumeAt(keys, time, level = 0.8) {
  const clip = createClip({ timelineEnd: 60, volume: level, keyframes: { volume: keys } });
  return resolveClip(clip, time).volume;
}

test('spans that touch, overlap or lie close together are joined', () => {
  assert.deepEqual(joinSpans([span(5, 6), span(1, 2), span(1.5, 3)]), [span(1, 3), span(5, 6)]);
  assert.deepEqual(joinSpans([span(1, 2), span(2, 3)]), [span(1, 3)]);
  assert.deepEqual(joinSpans([span(1, 2), span(2.5, 3)], 0.5), [span(1, 3)]);
  assert.deepEqual(joinSpans([span(1, 2), span(2.6, 3)], 0.5), [span(1, 2), span(2.6, 3)]);
  assert.deepEqual(joinSpans([span(1, 5), span(2, 3)]), [span(1, 5)], 'one inside the other');
  assert.deepEqual(joinSpans([span(3, 3), span(4, 2)]), [], 'spans without length are dropped');
  const given = [span(1, 2)];
  joinSpans(given, 5);
  assert.deepEqual(given, [span(1, 2)], 'the input is left alone');
  assert.equal(coverage([span(0, 2), span(1, 4), span(8, 12)], 10), 0.6);
  assert.equal(coverage([], 10), 0);
});

test('speech in the middle: down just before the first word, up a moment after the last', () => {
  const keys = duckKeys([span(10, 14)], { length: 60, level: 0.8, depth: 12 });
  const low = 0.201; // 0.8 × 10^(−12/20)
  assert.deepEqual(times(keys), [
    [10 - LEAD - RAMP, 0.8],
    [10 - LEAD, low],
    [14 + HOLD, low],
    [14 + HOLD + RAMP, 0.8],
  ]);
  assert.deepEqual(
    keys.map((key) => key.ease),
    ['sine', 'linear', 'sine', 'linear'],
  );
  assert.equal(RAMP, 0.25, 'ramps of a quarter of a second');
  // What the clip plays at: full before and after, low under every word, half-way mid-ramp.
  assert.equal(volumeAt(keys, 0), 0.8);
  assert.equal(volumeAt(keys, 9), 0.8);
  for (const t of [10, 11.5, 14, 14.2]) assert.equal(volumeAt(keys, t), low, `at ${t}s`);
  assert.ok(Math.abs(volumeAt(keys, 10 - LEAD - RAMP / 2) - (0.8 + low) / 2) < 1e-9);
  assert.equal(volumeAt(keys, 20), 0.8);
  assert.ok(Math.abs(20 * Math.log10(low / 0.8) + 12) < 0.01, 'twelve decibels down');
});

test('the depth is a parameter; none, or no speech, leaves the clip without keyframes', () => {
  assert.equal(gainOf(6).toFixed(3), '0.501');
  assert.equal(gainOf(20), 0.1);
  assert.equal(gainOf(-3), 1);
  const at = (depth) => duckKeys([span(10, 14)], { length: 60, level: 1, depth })[1]?.v;
  assert.deepEqual([at(6), at(12), at(24)], [0.5012, 0.2512, 0.0631]);
  assert.deepEqual(duckKeys([span(10, 14)], { length: 60, level: 1, depth: 0 }), []);
  assert.deepEqual(duckKeys([], { length: 60, level: 1, depth: 12 }), []);
  assert.deepEqual(duckKeys([span(70, 80)], { length: 60, level: 1, depth: 12 }), []);
});

test('speech at the very start begins low; speech to the very end stays low', () => {
  const opening = duckKeys([span(0.1, 3)], { length: 20, level: 1, depth: 12 });
  assert.deepEqual(times(opening), [
    [0, 0.2512],
    [3 + HOLD, 0.2512],
    [3 + HOLD + RAMP, 1],
  ]);
  assert.equal(volumeAt(opening, 0, 1), 0.2512);
  const closing = duckKeys([span(15, 19.9)], { length: 20, level: 1, depth: 12 });
  assert.deepEqual(times(closing), [
    [15 - LEAD - RAMP, 1],
    [15 - LEAD, 0.2512],
  ]);
  assert.equal(volumeAt(closing, 19.99, 1), 0.2512);
  // Speech that runs past either end of the clip is ducked as far as the clip goes.
  const whole = duckKeys([span(-5, 30)], { length: 20, level: 1, depth: 12 });
  assert.deepEqual(times(whole), [[0, 0.2512]]);
  assert.deepEqual(duckSpans([span(-5, 4), span(18, 30)], 20), [span(0, 4), span(18, 20)]);
});

test('sentences close together are ducked as one; the music comes back in a real gap', () => {
  const pause = (gap) =>
    duckKeys([span(5, 8), span(8 + gap, 12)], { length: 30, level: 1, depth: 12 });
  assert.equal(pause(JOIN - 0.01).length, 4, 'one duck');
  assert.equal(pause(JOIN + 0.01).length, 8, 'two');
  // Whatever the gaps, the keys are in order and the level never jumps.
  for (const gap of [0, 0.3, 0.86, 1.19, 1.21, 1.5, 3]) {
    const keys = pause(gap);
    keys.forEach((key, i) => {
      if (i) assert.ok(key.t > keys[i - 1].t, `gap ${gap}: keys out of order`);
    });
    for (let t = 0; t < 30; t += 0.01) {
      assert.ok(Math.abs(volumeAt(keys, t + 0.01, 1) - volumeAt(keys, t, 1)) < 0.08, `${gap}/${t}`);
    }
  }
  // Clips that overlap on the timeline are one stretch of speech.
  const overlapping = duckKeys([span(5, 9), span(7, 12), span(6, 8)], {
    ...{ length: 30, level: 1, depth: 12 },
  });
  assert.deepEqual(
    times(overlapping).map(([t]) => t),
    [4.7, 4.95, 12.3, 12.55],
  );
});

const words = (...starts) => starts.map((start) => ({ word: 'w', start, end: start + 0.3 }));
const media = (more) => ({ words: [], segments: [], silences: [], ...more });
const clipAt = (timelineStart, sourceIn, sourceOut) => ({
  ...{ timelineStart, sourceIn, sourceOut, timelineEnd: timelineStart + sourceOut - sourceIn },
});

test('a clip speaks where the words it plays fall, mapped through its source window', () => {
  const file = media({ words: words(1, 1.4, 1.8, 5, 5.4, 9) });
  // The whole file from the start of the timeline.
  assert.deepEqual(clipSpeech(clipAt(0, 0, 10), file, false), {
    spans: [span(1, 2.1), span(5, 5.7), span(9, 9.3)],
    from: 'words',
  });
  // Trimmed to 4…8 s of the file and placed at 20 s: only the middle words, moved.
  assert.deepEqual(clipSpeech(clipAt(20, 4, 8), file, false).spans, [span(21, 21.7)]);
  // A word the trim cuts through counts for the part that is played.
  assert.deepEqual(clipSpeech(clipAt(0, 1.5, 5.2), file, false).spans, [
    span(0, 0.6),
    span(3.5, 3.7),
  ]);
  // A window with no word in it: nothing is said there, even for a voice.
  assert.deepEqual(clipSpeech(clipAt(0, 2.5, 4.5), file, true), { spans: [], from: 'words' });
});

test('without word times: transcript segments; without a transcript: what is not silence', () => {
  const segmented = media({ segments: [span(1, 4), span(6, 9)] });
  assert.deepEqual(clipSpeech(clipAt(10, 2, 7), segmented, false), {
    spans: [span(10, 12), span(14, 15)],
    from: 'segments',
  });
  const memo = media({ silences: [span(1.5, 3.5), span(5, 6)] });
  // Only a clip known to be a voice is taken for speech by its sound.
  assert.deepEqual(clipSpeech(clipAt(0, 0, 8), memo, false), { spans: [], from: '' });
  assert.deepEqual(clipSpeech(clipAt(0, 0, 8), memo, true), {
    spans: [span(0, 1.5), span(3.5, 5), span(6, 8)],
    from: 'sound',
  });
  assert.deepEqual(clipSpeech(clipAt(30, 2, 5.5), memo, true).spans, [span(31.5, 33)]);
  // A voice with no analysis at all: the whole clip.
  assert.deepEqual(clipSpeech(clipAt(4, 1, 6), media({}), true).spans, [span(4, 9)]);
});
