import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TIME_GIVE, captionAt, captionGroups } from './index.js';

// Two groups back to back, then one after a long pause.
const WORDS = [
  [1, 1.3, 'Hello'],
  [1.4, 1.8, 'there,'],
  [1.8, 2.2, 'general'],
  [2.25, 2.65, 'Kenobi.'],
  [5, 5.4, 'Bye.'],
];
const STYLE = { group: { words: 2, chars: 18, pause: 0.5 }, hold: 0.3 };
const GROUPS = captionGroups(WORDS, STYLE);

/** `[group text, index of the word being said]` at a time, or null. */
const at = (time) => {
  const found = captionAt(GROUPS, time);
  return found && [found.group.text, found.word];
};

describe('captionAt', () => {
  it('is set up as the cases below expect', () => {
    assert.deepEqual(
      GROUPS.map(({ text, start, end, until }) => [text, start, end, Number(until.toFixed(6))]),
      [
        ['Hello there,', 1, 1.8, 1.8],
        ['general Kenobi.', 1.8, 2.65, 2.95],
        ['Bye.', 5, 5.4, 5.7],
      ],
    );
  });

  it('shows nothing before the first word', () => {
    assert.equal(at(0), null);
    assert.equal(at(0.999), null);
    assert.equal(at(-5), null);
  });

  it('shows a group from the start of its first word', () => {
    assert.deepEqual(at(1), ['Hello there,', 0]);
    const found = captionAt(GROUPS, 1);
    assert.deepEqual([found.age, found.wordAge, found.wordProgress], [0, 0, 0]);
    assert.equal(found.group, GROUPS[0]);
  });

  it('forgives a time that falls a hair short of a start', () => {
    assert.deepEqual(at(1 - TIME_GIVE / 2), ['Hello there,', 0]);
    assert.equal(at(1 - TIME_GIVE * 3), null);
    const found = captionAt(GROUPS, 1 - TIME_GIVE / 2);
    assert.deepEqual([found.age, found.wordAge], [0, 0], 'ages are never negative');
  });

  it('keeps the last word that started marked through a pause between words', () => {
    assert.deepEqual(at(1.29), ['Hello there,', 0]);
    assert.deepEqual(at(1.35), ['Hello there,', 0], 'between the two words');
    assert.equal(captionAt(GROUPS, 1.35).wordProgress, 1, 'that word is fully said');
    assert.deepEqual(at(1.4), ['Hello there,', 1], 'the next word takes over as it starts');
    assert.deepEqual(at(1.3999), ['Hello there,', 0]);
  });

  it('reports how far into the group and the word a time is', () => {
    const found = captionAt(GROUPS, 1.6);
    assert.equal(found.word, 1);
    assert.ok(Math.abs(found.age - 0.6) < 1e-9);
    assert.ok(Math.abs(found.wordAge - 0.2) < 1e-9);
    assert.ok(Math.abs(found.wordProgress - 0.5) < 1e-9);
  });

  it('hands over to the next group the instant it begins', () => {
    assert.deepEqual(at(1.7999), ['Hello there,', 1]);
    assert.deepEqual(at(1.8), ['general Kenobi.', 0]);
    assert.deepEqual(at(1.8 - TIME_GIVE / 2), ['general Kenobi.', 0]);
  });

  it('holds a group after its last word, that word still marked, then shows nothing', () => {
    assert.deepEqual(at(2.65), ['general Kenobi.', 1], 'at the end of the last word');
    assert.deepEqual(at(2.9), ['general Kenobi.', 1], 'during the hold');
    assert.equal(captionAt(GROUPS, 2.9).wordProgress, 1);
    assert.equal(at(2.95), null, 'not at the very end of the hold');
    assert.deepEqual(at(2.94), ['general Kenobi.', 1]);
    assert.equal(at(4), null, 'nor in the pause that follows');
    assert.deepEqual(at(5), ['Bye.', 0]);
    assert.deepEqual(at(5.69), ['Bye.', 0]);
    assert.equal(at(5.7), null);
    assert.equal(at(1e9), null);
  });

  it('answers nothing for nothing', () => {
    for (const time of [NaN, Infinity, -Infinity, undefined, null, '1.5', {}]) {
      assert.equal(captionAt(GROUPS, time), null);
    }
    for (const groups of [[], undefined, null, 'groups', {}]) {
      assert.equal(captionAt(groups, 1.5), null);
    }
  });

  it('finds the group by halving, not by walking the list', () => {
    const many = Array.from({ length: 20000 }, (_, i) => [i, i + 0.4, `w${i}.`]);
    const groups = captionGroups(many, STYLE);
    assert.equal(groups.length, 20000);
    let reads = 0;
    const counted = new Proxy(groups, {
      get(target, key) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
        return target[key];
      },
    });
    assert.equal(captionAt(counted, 12345.2).group.text, 'w12345.');
    assert.ok(reads <= 20, `${reads} groups were looked at`);
    assert.equal(captionAt(groups, 12345.75), null, 'between two groups');
  });
});
