import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignToWords, wordRange } from './speech.js';
import { keepRuns, runsFromSilences, speechRuns } from './tighten.js';

/** "one two three" … pause … "four five" … long pause … "six" */
const WORDS = [
  { word: 'one', start: 1.0, end: 1.3 },
  { word: 'two', start: 1.35, end: 1.7 },
  { word: 'three', start: 1.75, end: 2.2 },
  { word: 'four', start: 3.6, end: 3.9 },
  { word: 'five', start: 3.95, end: 4.4 },
  { word: 'six', start: 8.0, end: 8.4 },
];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);

test('wordRange ignores words a rough boundary only grazes', () => {
  assert.deepEqual(wordRange(WORDS, 1.68, 4.0), { first: 2, last: 3 });
  assert.deepEqual(wordRange(WORDS, 1.5, 4.2), { first: 1, last: 4 });
  assert.equal(wordRange(WORDS, 4.5, 7.9), null);
});

test('wordRange keeps zero-length words that sit inside the range', () => {
  const words = [{ word: 'uh', start: 2, end: 2 }];
  assert.deepEqual(wordRange(words, 1, 3), { first: 0, last: 0 });
  assert.equal(wordRange(words, 2.5, 3), null);
});

test('alignToWords snaps outward to whole words and pads into the silence', () => {
  // Rough range starts mid "two" and ends mid "four".
  const out = alignToWords(WORDS, 1.5, 3.75, 0.1);
  assert.equal(out.snapped, true);
  // "one" ends 0.05s before "two": padding stops at the midpoint of that gap.
  near(out.start, 1.325);
  // "five" starts 0.05s after "four".
  near(out.end, 3.925);
});

test('alignToWords pads freely when the neighbours are far away', () => {
  const out = alignToWords(WORDS, 3.5, 4.5, 0.1);
  near(out.start, 3.5);
  near(out.end, 4.5);
  const first = alignToWords(WORDS, 0, 2.3, 0.2);
  near(first.start, 0.8);
  near(first.end, 2.4);
});

test('alignToWords never starts before zero and reports unsnapped ranges', () => {
  const words = [{ word: 'hi', start: 0.05, end: 0.4 }];
  assert.equal(alignToWords(words, 0, 1, 0.2).start, 0);
  assert.deepEqual(alignToWords(WORDS, 5, 7, 0.1), { start: 5, end: 7, snapped: false });
  assert.deepEqual(alignToWords([], 5, 7), { start: 5, end: 7, snapped: false });
});

test('speechRuns cuts pauses longer than the threshold and keeps padding', () => {
  const runs = speechRuns(WORDS, 0, 10, { threshold: 0.8, padding: 0.1 });
  assert.equal(runs.length, 3);
  near(runs[0].start, 0.9);
  near(runs[0].end, 2.3);
  near(runs[1].start, 3.5);
  near(runs[1].end, 4.5);
  near(runs[2].start, 7.9);
  near(runs[2].end, 8.5);
});

test('speechRuns keeps pauses shorter than the threshold', () => {
  const runs = speechRuns(WORDS, 0, 5, { threshold: 2, padding: 0.1 });
  assert.equal(runs.length, 1);
  near(runs[0].start, 0.9);
  near(runs[0].end, 4.5);
});

test('speechRuns cannot shorten a pause smaller than twice the padding', () => {
  // 1.4s pause, 0.75s padding each side: the runs meet and merge.
  const runs = speechRuns(WORDS, 0, 5, { threshold: 0.8, padding: 0.75 });
  assert.equal(runs.length, 1);
});

test('speechRuns is empty when the range holds no words', () => {
  assert.deepEqual(speechRuns(WORDS, 5, 7), []);
  assert.deepEqual(speechRuns([], 0, 7), []);
});

test('runsFromSilences removes long silences, leaving padding at each side', () => {
  const silences = [
    { start: 0, end: 1.5 },
    { start: 4, end: 6 },
    { start: 7, end: 7.3 },
    { start: 9, end: 10 },
  ];
  const runs = runsFromSilences(silences, 0, 10, { threshold: 0.8, padding: 0.1 });
  assert.equal(runs.length, 2);
  near(runs[0].start, 1.4);
  near(runs[0].end, 4.1);
  near(runs[1].start, 5.9);
  near(runs[1].end, 9.1);
});

test('runsFromSilences only looks inside the requested range', () => {
  const runs = runsFromSilences([{ start: 4, end: 6 }], 4.5, 8, { threshold: 0.8, padding: 0.1 });
  assert.equal(runs.length, 1);
  near(runs[0].start, 5.9);
  near(runs[0].end, 8);
});

test('keepRuns prefers words, then silences, then keeps the range whole', () => {
  assert.equal(keepRuns({ words: WORDS }, 0, 10).basis, 'words');
  const noWordsHere = keepRuns({ words: WORDS, silences: [{ start: 5, end: 7 }] }, 5, 7);
  assert.deepEqual(noWordsHere, { runs: [{ start: 5, end: 7 }], basis: 'none' });
  assert.equal(keepRuns({ silences: [{ start: 2, end: 4 }] }, 0, 10).basis, 'silences');
  assert.deepEqual(keepRuns({}, 3, 4), { runs: [{ start: 3, end: 4 }], basis: 'none' });
});
