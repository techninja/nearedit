import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignPicture, shotsOf, usablePart } from '../assemble/usable.js';
import { toMediaInfo } from '../context/mediaInfo.js';
import { beatGrid, say } from '../testing/fixtures.js';
import { allotShots, planMontage, shotLength, takesFrom } from './montagePlan.js';
import { chooseMusic, musicStart } from './music.js';
import { planSpeech } from './speechPlan.js';
import { bestWindow, speechUnits } from './speechWindow.js';

let n = 0;
/** A MediaInfo built from sidecar fields alone (no file needed for planning). */
function media(name, type, sidecar, global = false) {
  const entry = {
    filename: name,
    filePath: `/p/${name}`,
    relativePath: name,
    root: '/p',
    global,
    type,
  };
  const info = toMediaInfo(entry, { hasAudio: type !== 'image', ...sidecar });
  info.handle = `m${++n}`;
  return info;
}
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('usablePart takes the middle of the best shot and rotates on reuse', () => {
  const clip = media('a.mp4', 'video', {
    duration: 20,
    scenes: [
      { start: 0, end: 3 },
      { start: 3, end: 13 },
      { start: 13, end: 20 },
    ],
  });
  assert.deepEqual(usablePart(clip, 4), { start: 6, end: 10 });
  assert.deepEqual(usablePart(clip, 4, { use: 1 }), { start: 14.5, end: 18.5 });
  // Only one shot can hold 9s; a shorter one is used whole when its turn comes.
  assert.deepEqual(usablePart(clip, 9, { use: 1 }), { start: 13, end: 20 });
  assert.deepEqual(usablePart(clip, 9, { use: 2 }), { start: 0, end: 3 });
  // A hinted moment is kept inside the part, a quarter of the way in.
  assert.deepEqual(usablePart(clip, 4, { near: 9 }), { start: 8, end: 12 });
  assert.deepEqual(usablePart(clip, 4, { near: 3.2 }), { start: 3.5, end: 7.5 });
  const unknown = media('b.mp4', 'video', { duration: null });
  assert.deepEqual([shotsOf(unknown), usablePart(unknown, 4)], [[], { start: 0, end: 4 }]);
});

test('alignPicture snaps close ends, stays inside the file, never collapses', () => {
  const clip = media('a.mp4', 'video', {
    duration: 10,
    scenes: [
      { start: 0, end: 4 },
      { start: 4, end: 10 },
    ],
  });
  assert.deepEqual(alignPicture(clip, 3.7, 9.8), { start: 4, end: 10, snapped: 2 });
  assert.deepEqual(alignPicture(clip, 1, 3), { start: 1, end: 3, snapped: 0 });
  assert.deepEqual(alignPicture(clip, 8, 14), { start: 8, end: 10, snapped: 0 });
  // Both ends would land on the same boundary: leave the range alone.
  assert.deepEqual(alignPicture(clip, 3.8, 4.3), { start: 3.8, end: 4.3, snapped: 0 });
});

test('shotLength stretches to whole, even numbers of beats', () => {
  assert.equal(shotLength(3.5, null), 3.5);
  assert.equal(shotLength(3.5, 120), 4); // 7 beats → 8
  assert.equal(shotLength(2, 120), 2); // 4 beats
  near(shotLength(0.4, 100), 0.6); // never less than one beat
});

test('allotShots gives every file a turn before any gets two', () => {
  assert.deepEqual(allotShots([3, 3, 3, 3, 3], 1), [1, 0, 0, 0, 0]);
  assert.deepEqual(allotShots([3, 3, 3, 3, 3], 3), [1, 0, 1, 0, 1]);
  assert.deepEqual(allotShots([1, 4, 2], 5), [1, 3, 1]);
  assert.deepEqual(allotShots([1, 1], 9), [1, 1]);
});

test('takesFrom uses the longest shots, or samples a single take evenly', () => {
  const shots = media('a.mp4', 'video', {
    duration: 30,
    scenes: [
      { start: 0, end: 4 },
      { start: 4, end: 16 },
      { start: 16, end: 30 },
    ],
  });
  assert.deepEqual(takesFrom(shots, 2, 4), [
    { start: 8, end: 12 },
    { start: 21, end: 25 },
  ]);
  const take = media('b.mp4', 'video', { duration: 30 });
  assert.deepEqual(takesFrom(take, 3, 4), [
    { start: 3, end: 7 },
    { start: 13, end: 17 },
    { start: 23, end: 27 },
  ]);
  assert.deepEqual(takesFrom(media('c.mp4', 'video', { duration: 2 }), 1, 4), [
    { start: 0, end: 2 },
  ]);
});

test('planMontage lands on the target and says when material is short', () => {
  const sources = [1, 2, 3].map((i) => media(`c${i}.mp4`, 'video', { duration: 20 }));
  const plan = planMontage(sources, { duration: 30, shot: 3.5, still: 4.5, role: 'broll' });
  near(plan.seconds, 30, 0.01);
  assert.equal(plan.picks.length, 9);
  assert.ok(plan.picks.every((p) => p.role === 'broll' && p.end > p.start));
  const short = planMontage([media('only.mp4', 'video', { duration: 5 })], {
    duration: 60,
    shot: 3.5,
    still: 4.5,
    role: 'primary',
  });
  assert.equal(short.picks.length, 1);
  assert.match(short.notes[0], /only enough picture for about 5s of the 60s target/);
});

test('speechUnits come from segments, else silences, else the whole file', () => {
  const talk = media('t.wav', 'audio', {
    duration: 10,
    transcript: say('one two three | four five'),
  });
  assert.deepEqual(
    speechUnits(talk, 0.8).map((u) => u.words),
    [3, 2],
  );
  const quiet = media('q.wav', 'audio', { duration: 10, silences: [{ start: 3, end: 6 }] });
  assert.deepEqual(speechUnits(quiet, 0.8), [
    { start: 0, end: 3, words: 0 },
    { start: 6, end: 10, words: 0 },
  ]);
  assert.deepEqual(speechUnits(media('w.wav', 'audio', { duration: 7 }), 0.8), [
    { start: 0, end: 7, words: 0 },
  ]);
});

test('bestWindow fits the share and prefers fluent speech among equal fits', () => {
  const unit = (start, words) => ({ start, end: start + 5, words });
  // Six 5s units, 1s apart; the pause between them is longer than the threshold.
  const units = [unit(0, 6), unit(6, 6), unit(12, 15), unit(18, 15), unit(24, 6), unit(30, 6)];
  const window = bestWindow(units, 10, 0.8);
  assert.deepEqual([window.from, window.to, window.seconds], [2, 3, 10]);
  assert.deepEqual([bestWindow(units, 4, 0.8).from, bestWindow(units, 4, 0.8).to], [2, 2]);
  assert.equal(bestWindow(units, 100, 0.8).seconds, 30);
});

test('planSpeech shares the target between files in proportion', () => {
  const sentence = 'this is one complete sentence of the talk';
  const words = (count) =>
    Array.from({ length: count }, (_, i) => say(sentence, { start: 1 + i * 4.2 })).flat();
  const long = media('long.mp4', 'video', { duration: 130, transcript: words(30) });
  const short = media('short.wav', 'audio', { duration: 45, transcript: words(10) });
  const plan = planSpeech([long, short], { duration: 40, threshold: 0.8 });
  assert.deepEqual(
    plan.picks.map((p) => [p.file, p.role]),
    [
      [long.handle, 'primary'],
      [short.handle, 'narration'],
    ],
  );
  const lengths = plan.picks.map((p) => p.end - p.start);
  assert.ok(lengths[0] > lengths[1] * 2, lengths.join(' vs '));
  near(plan.seconds, 40, 6);
  // Everything fits a generous target: whole files, first word to last.
  const all = planSpeech([long, short], { duration: 600, threshold: 0.8 });
  assert.deepEqual(
    all.picks.map((p) => [p.start, p.end]),
    [
      [1, 125.9],
      [1, 41.9],
    ],
  );
});

test('chooseMusic prefers the project’s own analysed, long-enough track', () => {
  const beats = beatGrid(120, 60, 0.25);
  const lib = media('lib.wav', 'audio', { duration: 300, beats, bpm: 120 }, true);
  const plain = media('song.wav', 'audio', { duration: 200 });
  const short = media('jingle.wav', 'audio', { duration: 8, beats: beats.slice(0, 16), bpm: 120 });
  const good = media('theme.wav', 'audio', { duration: 90, beats, bpm: 120 });
  assert.equal(chooseMusic([lib, plain, short, good], 60).filename, 'theme.wav');
  assert.equal(chooseMusic([lib, plain, short], 60).filename, 'jingle.wav');
  assert.equal(chooseMusic([lib, plain], 60).filename, 'song.wav');
  assert.equal(chooseMusic([lib], 60).filename, 'lib.wav');
  assert.equal(chooseMusic([], 60), null);
  assert.deepEqual([musicStart(good), musicStart(plain)], [0.25, 0]);
});
