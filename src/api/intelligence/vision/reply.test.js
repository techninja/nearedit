/**
 * The pure side of vision tagging: defensive reply parsing, aggregation and
 * frame selection.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, cleanTags, parseReply } from './reply.js';
import { pickFrameTimes } from './frames.js';

const scenes = [
  { start: 0, end: 2 },
  { start: 2, end: 3.5 },
  { start: 3.5, end: 6 },
  { start: 6, end: 8 },
];

test('replies are parsed defensively', () => {
  const clean = parseReply(
    '{"description": "A dog runs on grass.", "tags": ["Dog", "grass", "dog"]}',
  );
  assert.deepEqual(clean, { description: 'A dog runs on grass.', tags: ['dog', 'grass'] });
  const fenced = parseReply(
    'Sure!\n```json\n{"description": "Two kids", "tags": "park, Wide Shot ,sunny"}\n```\nHope it helps',
  );
  assert.deepEqual(fenced, { description: 'Two kids', tags: ['park', 'wide shot', 'sunny'] });
  const sloppy = parseReply("<think>hmm</think>{description: 'A beach', tags: ['sea', 'sand',]}");
  assert.deepEqual(sloppy, { description: 'A beach', tags: ['sea', 'sand'] });
  const cut = parseReply('{"description": "Cut off mid", "tags": ["one", "tw');
  assert.equal(cut.description, 'Cut off mid');
  assert.equal(cut.tags[0], 'one');
  assert.deepEqual(parseReply('{"caption": "Alt keys", "keywords": ["a"]}'), {
    description: 'Alt keys',
    tags: ['a'],
  });
  assert.deepEqual(parseReply('A plain sentence about a cat.'), {
    description: 'A plain sentence about a cat.',
    tags: [],
  });
  assert.deepEqual(parseReply(''), { description: '', tags: [] });
  assert.deepEqual(parseReply(undefined), { description: '', tags: [] });
  assert.deepEqual(cleanTags(['#Sunset ', '"beach".', '', 'x'.repeat(50), 42, null]), [
    'sunset',
    'beach',
    '42',
  ]);
  assert.equal(cleanTags(Array.from({ length: 30 }, (_, i) => `t${i}`)).length, 12);
});

test('frame results are aggregated: frequent tags first, distinct descriptions', () => {
  const result = aggregate([
    { time: 0, tags: ['park', 'dog'], description: 'A dog in a park.' },
    { time: 5, tags: ['dog', 'ball'], description: 'A dog chases a ball.' },
    { time: 9, tags: ['dog', 'park'], description: 'a dog in a park.' },
  ]);
  assert.deepEqual(result.tags, ['dog', 'park', 'ball']);
  assert.equal(result.description, 'A dog in a park. A dog chases a ball.');
  assert.equal(result.keyframes.length, 3);
  assert.deepEqual(aggregate([]), { tags: [], description: '', keyframes: [] });
});

test('frame times: scene starts when known, evenly spaced otherwise', () => {
  assert.deepEqual(pickFrameTimes({ duration: 10, count: 5 }), [1, 3, 5, 7, 9]);
  assert.deepEqual(pickFrameTimes({ duration: 8, scenes, count: 4 }), [0.5, 2.375, 4, 6.5]);
  // More scenes than frames: the longest scenes win, in time order.
  assert.deepEqual(pickFrameTimes({ duration: 8, scenes, count: 2 }), [0.5, 4]);
  // Fewer scenes than frames: the rest is filled in evenly, away from picks.
  const filled = pickFrameTimes({
    duration: 60,
    scenes: [
      { start: 0, end: 30 },
      { start: 30, end: 60 },
    ],
    count: 5,
  });
  assert.equal(filled.length, 5);
  assert.ok(filled.includes(0.5) && filled.includes(30.5));
  assert.deepEqual(
    filled,
    [...filled].sort((a, b) => a - b),
  );
  assert.deepEqual(pickFrameTimes({ duration: 0 }), [0]);
  assert.deepEqual(
    pickFrameTimes({ duration: 4, scenes: [{ start: 0, end: 4 }], count: 2 }),
    [1, 3],
  );
});
