import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_WORDS,
  MAX_WORD_CHARS,
  normalizeCaptions,
  repairWords,
  wordsFromTranscript,
} from './index.js';

/** Words are in order, each has a length, none overlaps the next. */
function sound(words) {
  words.forEach(([start, end, text], i) => {
    assert.ok(Number.isFinite(start) && Number.isFinite(end), `times of "${text}" are numbers`);
    assert.ok(end > start, `"${text}" has a length (${start}..${end})`);
    if (i) assert.ok(start >= words[i - 1][1] - 1e-9, `"${text}" starts after the word before`);
  });
}

const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is ${expected}`);

describe('normalizeCaptions', () => {
  it('keeps whether captions are on, and nothing else, when a clip has no words of its own', () => {
    assert.deepEqual(normalizeCaptions({ on: true }), { on: true });
    assert.deepEqual(normalizeCaptions({ on: true, words: [], style: 'pop', x: 1 }), { on: true });
    for (const raw of [undefined, null, 5, 'on', [], { on: 'yes' }, { on: 1 }, { words: 'hi' }]) {
      assert.deepEqual(normalizeCaptions(raw), { on: false });
    }
  });

  it('stores words as sorted triples with millisecond times', () => {
    const block = normalizeCaptions({
      on: true,
      words: [
        [2.00049, 2.5, 'world'],
        [1, 1.4, '  Hello '],
        { start: 3, end: 3.2, word: ' again' },
        { start: 4, end: 4.1, text: 'text' },
      ],
    });
    assert.deepEqual(block, {
      on: true,
      words: [
        [1, 1.4, 'Hello'],
        [2, 2.5, 'world'],
        [3, 3.2, 'again'],
        [4, 4.1, 'text'],
      ],
    });
  });

  it('drops what cannot be a word and bounds the rest', () => {
    const long = 'é'.repeat(300);
    const block = normalizeCaptions({
      on: false,
      words: [
        [NaN, 1, 'no start'],
        ['1', 2, 'a string start'],
        [1, 2, ''],
        [1, 2, '   '],
        [1, 2, { text: 'x' }],
        [1, 2],
        null,
        7,
        [5, 'x', 'no end'],
        [6, 2, 'ends before it starts'],
        [7, 8, long],
        [9, 9.5, 42],
        [10, 11, 'two\n words'],
      ],
    });
    assert.equal(block.on, false);
    assert.deepEqual(
      block.words.map((word) => [word[0], word[1], word[2].slice(0, 12)]),
      [
        [5, 5, 'no end'],
        [6, 6, 'ends before '],
        [7, 8, 'ééééééééé'.padEnd(12, 'é')],
        [9, 9.5, '42'],
        [10, 11, 'two words'],
      ],
    );
    assert.equal([...block.words[2][2]].length, MAX_WORD_CHARS);
    const many = Array.from({ length: MAX_WORDS + 500 }, (_, i) => [i, i + 0.5, 'w']);
    assert.equal(normalizeCaptions({ on: true, words: many }).words.length, MAX_WORDS);
  });
});

describe('repairWords', () => {
  it('leaves well-timed words as they are, and never changes its input', () => {
    const words = [
      [0.5, 0.8, 'Hello'],
      [0.9, 1.4, 'there'],
    ];
    const copy = JSON.parse(JSON.stringify(words));
    assert.deepEqual(repairWords(words), copy);
    assert.deepEqual(words, copy);
    assert.notEqual(repairWords(words), words);
  });

  it('gives a word of no length a length: up to the next word, or what its size suggests', () => {
    const [first, second, last] = repairWords([
      [1, 1, 'zero'],
      [1.1, 1.1, 'also'],
      [5, 5, 'last'],
    ]);
    assert.deepEqual([first[0], first[1]], [1, 1.1], 'ends where the next word starts');
    assert.ok(second[1] > 1.1 && second[1] <= 1.7, 'a guess when the next word is far away');
    assert.ok(last[1] > 5 && last[1] <= 5.6);
  });

  it('ends a word where the next one begins when they overlap', () => {
    const repaired = repairWords([
      [1, 2.5, 'long'],
      [1.5, 1.9, 'inside'],
      [1.8, 3, 'over'],
    ]);
    assert.deepEqual(repaired, [
      [1, 1.5, 'long'],
      [1.5, 1.8, 'inside'],
      [1.8, 3, 'over'],
    ]);
  });

  it('puts words in time order', () => {
    const repaired = repairWords([
      [2, 2.4, 'two'],
      [1, 1.4, 'one'],
      [3, 3.4, 'three'],
    ]);
    assert.deepEqual(
      repaired.map((word) => word[2]),
      ['one', 'two', 'three'],
    );
    sound(repaired);
  });

  it('fills in missing and unusable times', () => {
    const repaired = repairWords([
      [1, NaN, 'no-end'],
      [2, undefined, 'none'],
      { start: 3, word: 'object' },
      [NaN, NaN, 'nowhere'],
      [NaN, 6, 'only-an-end'],
      [7, -1, 'backwards'],
      [8, Infinity, 'forever'],
    ]);
    sound(repaired);
    assert.deepEqual(
      repaired.map((word) => word[2]),
      ['no-end', 'none', 'object', 'nowhere', 'only-an-end', 'backwards', 'forever'],
    );
    assert.equal(repaired[3][0], repaired[2][1], 'a word without times follows the one before');
    assert.ok(repaired[4][1] === 6 && repaired[4][0] < 6, 'an end alone still places a word');
    assert.ok(repaired[6][1] - repaired[6][0] <= 0.6, 'an endless word gets a usual length');
  });

  it('shares the time among words that start together, by their length', () => {
    const repaired = repairWords([
      [1, 1.9, 'a'],
      [1, 1.9, 'bcd'],
      [1.005, 1.9, 'ef'],
      [2.5, 3, 'next'],
    ]);
    sound(repaired);
    assert.equal(repaired[0][0], 1);
    near(repaired[0][1], 1.2); // 2 of 9 shares of 0.9 s
    near(repaired[1][1], 1.6);
    near(repaired[2][1], 1.9);
    assert.deepEqual(repaired[3], [2.5, 3, 'next']);
  });

  it('never throws, drops what says nothing, and bounds the count', () => {
    for (const raw of [undefined, null, 'words', 5, {}, [[]], [null, 3, 'x', [1]], [[1, 2, '']]]) {
      assert.deepEqual(repairWords(raw), []);
    }
    const many = Array.from({ length: MAX_WORDS + 10 }, (_, i) => [i, i, 'w']);
    assert.equal(repairWords(many).length, MAX_WORDS);
  });
});

describe('wordsFromTranscript', () => {
  const sidecar = {
    transcript: [
      { word: ' Hello', start: 0.52, end: 0.84, probability: 0.98 },
      { word: ' and', start: 0.84, end: 0.84 },
      { word: ' welcome.', start: 1.0, end: 1.6 },
    ],
    segments: [{ id: 0, start: 0.52, end: 3.1, text: 'Hello and welcome.' }],
  };

  it('reads the words of a sidecar, repaired, and remembers them by transcript', () => {
    const words = wordsFromTranscript(sidecar);
    assert.deepEqual(words, [
      [0.52, 0.84, 'Hello'],
      [0.84, 1, 'and'],
      [1, 1.6, 'welcome.'],
    ]);
    assert.equal(wordsFromTranscript(sidecar), words, 'the same array for the same transcript');
    assert.deepEqual(wordsFromTranscript(sidecar.transcript), words, 'a list of words is read too');
  });

  it('spreads the words of segments by length when no word was timed', () => {
    const words = wordsFromTranscript({
      transcript: [],
      segments: [
        { id: 0, start: 10, end: 12, text: ' I  am   unstoppable ' },
        { id: 1, start: 13, end: 14, text: 'Yes.' },
        { id: 2, start: 15, end: 15, text: 'no time' },
        { id: 3, start: 16, end: 17, text: '   ' },
      ],
    });
    sound(words);
    assert.deepEqual(
      words.map((word) => word[2]),
      ['I', 'am', 'unstoppable', 'Yes.'],
    );
    assert.deepEqual([words[0][0], words[2][1]], [10, 12], 'a segment is used from end to end');
    assert.ok(words[2][1] - words[2][0] > 3 * (words[0][1] - words[0][0]), 'longer word, longer');
    assert.deepEqual(words[3], [13, 14, 'Yes.']);
  });

  it('gives nothing for nothing', () => {
    for (const raw of [undefined, null, 'text', 3, {}, { transcript: 'x', segments: 7 }]) {
      assert.deepEqual(wordsFromTranscript(raw), []);
    }
  });
});
