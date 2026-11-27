import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveSegments, groupPhrases, wrapLines } from './phrases.js';
import { matchScore, tokenMatch, tokenize } from './keywords.js';
import { clamp, ceilFrames, floorFrames, formatSeconds, nearestIndex, snapNear } from './snap.js';

/** Evenly spoken words, 0.4s each, from a sentence. */
function speak(sentence, start = 0, step = 0.4) {
  return sentence.split(' ').map((word, i) => ({
    word: ` ${word}`,
    start: start + i * step,
    end: start + i * step + step * 0.8,
  }));
}

test('groupPhrases respects the character limit and never splits a word', () => {
  const words = speak('the quick brown fox jumps over the lazy dog and keeps running far away');
  const phrases = groupPhrases(words, { maxChars: 20, maxDuration: 10 });
  assert.ok(phrases.length >= 3);
  for (const p of phrases) assert.ok(p.text.length <= 20, p.text);
  assert.equal(phrases.map((p) => p.text).join(' '), words.map((w) => w.word.trim()).join(' '));
  assert.equal(phrases[0].start, 0);
  assert.equal(phrases[0].first, 0);
  assert.equal(phrases.at(-1).last, words.length - 1);
});

test('groupPhrases breaks at pauses, sentence ends and the duration limit', () => {
  const pause = [...speak('hello there'), ...speak('after a pause', 3)];
  assert.deepEqual(
    groupPhrases(pause, { maxChars: 80 }).map((p) => p.text),
    ['hello there', 'after a pause'],
  );
  const sentence = speak('this sentence is long enough. next one');
  assert.deepEqual(
    groupPhrases(sentence, { maxChars: 60, maxDuration: 30 }).map((p) => p.text),
    ['this sentence is long enough.', 'next one'],
  );
  const slow = speak('one two three four five six', 0, 1);
  const byTime = groupPhrases(slow, { maxChars: 80, maxDuration: 2.5, maxGap: 5 });
  assert.ok(byTime.every((p) => p.end - p.start <= 2.5));
  assert.ok(byTime.length >= 3);
});

test('groupPhrases attaches punctuation tokens and skips blanks', () => {
  const words = [
    { word: 'it', start: 0, end: 0.2 },
    { word: "'s", start: 0.2, end: 0.3 },
    { word: '  ', start: 0.3, end: 0.35 },
    { word: 'fine', start: 0.4, end: 0.7 },
    { word: '.', start: 0.7, end: 0.7 },
  ];
  assert.deepEqual(
    groupPhrases(words).map((p) => p.text),
    ["it's fine."],
  );
});

test('deriveSegments yields numbered sidecar-style segments', () => {
  const words = [...speak('first thought here'), ...speak('second thought after a gap', 5)];
  const segments = deriveSegments(words);
  assert.equal(segments.length, 2);
  assert.deepEqual(Object.keys(segments[0]), ['id', 'start', 'end', 'text']);
  assert.equal(segments[1].id, 1);
  assert.equal(segments[1].start, 5);
});

test('wrapLines balances two lines and leaves short text alone', () => {
  assert.equal(wrapLines('short text', 20), 'short text');
  const wrapped = wrapLines('the quick brown fox jumps over the lazy dog', 30);
  const [a, b] = wrapped.split('\n');
  assert.ok(Math.abs(a.length - b.length) <= 6, wrapped);
  assert.equal(wrapped.replace('\n', ' '), 'the quick brown fox jumps over the lazy dog');
  assert.equal(wrapLines('unbreakablewordthatislong', 5), 'unbreakablewordthatislong');
});

test('tokenize drops stop words and editing chatter', () => {
  assert.deepEqual(tokenize('Insert a B-roll clip of the dog here'), ['dog']);
  assert.deepEqual(tokenize('Kids at the PARK, park!'), ['kids', 'park']);
  assert.deepEqual(tokenize(''), []);
});

test('tokenMatch forgives short endings but not unrelated words', () => {
  assert.equal(tokenMatch('dog', 'dog'), 1);
  assert.equal(tokenMatch('dog', 'dogs'), 0.6);
  assert.equal(tokenMatch('playing', 'play'), 0.6);
  assert.equal(tokenMatch('cat', 'category'), 0);
  assert.equal(tokenMatch('an', 'and'), 0);
  assert.equal(tokenMatch('beach', 'park'), 0);
});

test('matchScore sums the best match of each query token', () => {
  const q = tokenize('dogs playing on the beach');
  const hit = matchScore(q, 'A dog runs along the beach at sunset');
  assert.deepEqual(hit.matched, ['dogs', 'beach']);
  assert.equal(hit.score, 1.6);
  assert.equal(matchScore(q, ['office', 'meeting']).score, 0);
});

test('snap helpers: frames, nearest and formatting', () => {
  assert.equal(floorFrames(0.1, 30), 3);
  assert.equal(ceilFrames(0.1, 30), 3);
  assert.equal(floorFrames(0.99, 30), 29);
  assert.equal(ceilFrames(0.101, 30), 4);
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(nearestIndex([], 1), -1);
  assert.equal(nearestIndex([1, 2, 4], 2.9), 1);
  assert.equal(nearestIndex([1, 2, 4], 3.1), 2);
  assert.equal(nearestIndex([1, 2, 4], 9), 2);
  assert.equal(snapNear(2.2, [1, 2, 4], 0.25), 2);
  assert.equal(snapNear(2.6, [1, 2, 4], 0.25), 2.6);
  assert.equal(formatSeconds(58.44), '58.4s');
  assert.equal(formatSeconds(125), '2m 05s');
});
