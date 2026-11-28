import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { captionGroups, resolveCaptionStyle } from './index.js';

/**
 * Words spoken at an even pace: each lasts 0.3 s, the next follows 0.05 s
 * later. `(0.6)` in the text is a pause of that many seconds.
 */
function speak(text, from = 1) {
  const words = [];
  let at = from;
  for (const part of text.split(/\s+/).filter(Boolean)) {
    const pause = /^\((\d+(?:\.\d+)?)\)$/.exec(part);
    if (pause) {
      at += Number(pause[1]) - 0.05;
      continue;
    }
    words.push([Math.round(at * 1000) / 1000, Math.round((at + 0.3) * 1000) / 1000, part]);
    at += 0.35;
  }
  return words;
}

/** The texts of the groups of a sentence. */
const texts = (text, style) => captionGroups(speak(text), style).map((group) => group.text);

const THREE = { group: { words: 3, chars: 18 } };

describe('captionGroups: limits', () => {
  it('fills groups up to the word limit', () => {
    assert.deepEqual(texts('one two three four five six seven', THREE), [
      'one two three',
      'four five',
      'six seven',
    ]);
    assert.deepEqual(texts('alpha beta gamma delta', { group: { words: 1 } }), [
      'alpha',
      'beta',
      'gamma',
      'delta',
    ]);
    for (const words of [1, 2, 3, 5]) {
      const style = { group: { words, chars: 80 } };
      for (const group of captionGroups(speak('a bb ccc dddd eeeee ffffff ggggggg hh'), style)) {
        assert.ok(group.words.length <= words, `"${group.text}" has at most ${words} words`);
      }
    }
  });

  it('fills groups up to the character limit, spaces counted', () => {
    const style = { group: { words: 12, chars: 14 } };
    const found = texts('the quick brown fox jumps over the lazy dog today', style);
    assert.equal(found.join(' '), 'the quick brown fox jumps over the lazy dog today');
    assert.equal(found.length, 4, 'as few groups as fit');
    for (const text of found) assert.ok(text.length <= 14, `"${text}" fits 14 characters`);
    assert.deepEqual(texts('aaaa bbbb cccc', { group: { words: 9, chars: 14 } }), [
      'aaaa bbbb cccc',
    ]);
    const over = texts('aaaa bbbb ccccc', { group: { words: 9, chars: 14 } });
    assert.deepEqual(over, ['aaaa bbbb', 'ccccc'], 'one character too many makes two groups');
  });

  it('gives a single very long word a group of its own', () => {
    const found = texts('It is pneumonoultramicroscopicsilicovolcanoconiosis my friend', THREE);
    assert.deepEqual(found, [
      'It is',
      'pneumonoultramicroscopicsilicovolcanoconiosis',
      'my friend',
    ]);
  });
});

describe('captionGroups: where a group may not continue', () => {
  it('starts a new group at a pause as long as the style says', () => {
    assert.deepEqual(texts('Hello there (0.5) my friend', THREE), ['Hello there', 'my friend']);
    assert.deepEqual(texts('Hello there (0.45) my', THREE), ['Hello there my']);
    assert.deepEqual(texts('Hello there (0.45) my', { group: { pause: 0.4 } }), [
      'Hello there',
      'my',
    ]);
  });

  it('starts a new group after the end of a sentence', () => {
    const roomy = { group: { words: 12, chars: 60 } };
    assert.deepEqual(texts('I came. I saw! Did I win? Yes… "Truly."', roomy), [
      'I came.',
      'I saw!',
      'Did I win?',
      'Yes…',
      '"Truly."',
    ]);
    assert.deepEqual(texts('Dr. Lee met Mr. Day at 3.5 p.m. in the U.S. embassy', roomy), [
      'Dr. Lee met Mr. Day at 3.5 p.m. in the U.S. embassy',
    ]);
  });

  it('keeps an emoji with the sentence it follows, and does not count it as a word', () => {
    const style = { group: { words: 3, chars: 18 } };
    assert.deepEqual(texts('I am proud. 🎉 Thank you all', style), [
      'I am proud. 🎉',
      'Thank you all',
    ]);
  });
});

describe('captionGroups: reading well', () => {
  it('does not leave a short word alone when it can sit with its neighbours', () => {
    assert.deepEqual(texts('Do not go now', THREE), ['Do not', 'go now']);
    assert.deepEqual(texts('We will find a way', THREE), ['We will', 'find a way']);
    for (const text of ['a b c d', 'it is up to us now', 'go on and try it for me']) {
      const groups = captionGroups(speak(text), THREE);
      assert.ok(
        groups.every((group) => group.words.length > 1),
        `${groups.map((group) => group.text).join(' | ')}`,
      );
    }
  });

  it('breaks after a comma or a colon rather than in the middle of a phrase', () => {
    assert.deepEqual(
      texts("So, here's the thing: in 2024 we shipped 37 features, and honestly?", THREE),
      ["So, here's", 'the thing:', 'in 2024', 'we shipped', '37 features,', 'and honestly?'],
    );
    // A long first word is no orphan: it may stand alone before its comma.
    assert.deepEqual(texts('Honestly, it was hard', THREE), ['Honestly,', 'it was hard']);
  });

  it('prefers to break where the speaker paused a little', () => {
    const style = { group: { words: 4, chars: 40, pause: 0.6 } };
    assert.deepEqual(texts('alpha bravo (0.4) charlie delta echo foxtrot', style), [
      'alpha bravo',
      'charlie delta echo foxtrot',
    ]);
    assert.deepEqual(texts('alpha bravo charlie delta (0.4) echo foxtrot', style), [
      'alpha bravo charlie delta',
      'echo foxtrot',
    ]);
  });

  it('writes a dash that was transcribed alone onto the word before it', () => {
    assert.deepEqual(texts('But the team — all 12 of us — never gave up .', THREE), [
      'But the team —',
      'all 12',
      'of us —',
      'never gave up.',
    ]);
  });
});

describe('captionGroups: lines', () => {
  it('sets a group that is too long for one line in two balanced lines', () => {
    const style = { group: { words: 7, chars: 44, lines: 2 } };
    const [first, second] = captionGroups(
      speak('in 2024 we shipped 37 features, and so on'),
      style,
    );
    assert.equal(first.text, 'in 2024 we shipped\n37 features,');
    assert.deepEqual(first.lines, [4, 2]);
    assert.deepEqual([second.text, second.lines], ['and so on', [3]], 'a short group stays on one');
    const even = captionGroups(speak('aaaa bbbb cccc dddd'), {
      group: { chars: 20, lines: 2, words: 4 },
    });
    assert.equal(even[0].text, 'aaaa bbbb\ncccc dddd');
    const tie = captionGroups(speak('aaaa bb cccc'), { group: { chars: 20, lines: 2, words: 4 } });
    assert.equal(tie[0].text, 'aaaa\nbb cccc', 'the shorter line on top when it is a tie');
  });

  it('keeps one line when the style allows only one', () => {
    const [group] = captionGroups(speak('in 2024 we shipped 37'), {
      group: { words: 7, chars: 44 },
    });
    assert.deepEqual([group.text, group.lines], ['in 2024 we shipped 37', [5]]);
  });
});

describe('captionGroups: text', () => {
  it('applies capitals and strips punctuation as the style says', () => {
    const style = { case: 'upper', punctuation: 'strip', group: { words: 4, chars: 30 } };
    assert.deepEqual(texts(`"Well," she said — it's $5.99 (50% off)!`, style), [
      'WELL SHE SAID',
      "IT'S $5.99 50% OFF",
    ]);
    assert.deepEqual(texts('HELLO World', { case: 'lower' }), ['hello world']);
  });

  it('groups a script written without spaces by characters, and marks them one by one', () => {
    const words = [
      [1, 1.4, '今日'],
      [1.4, 1.6, 'は'],
      [1.6, 2, 'いい'],
      [2, 2.6, '天気'],
      [2.6, 3, 'です'],
      [3, 3.2, 'ね。'],
      [3.4, 4, 'iPhone'],
      [4, 4.4, 'を'],
    ];
    const groups = captionGroups(words, { group: { words: 3, chars: 18, pause: 0.5 } });
    assert.deepEqual(
      groups.map((group) => group.text),
      ['今日はいい', '天気ですね。', 'iPhone を'],
      'nine wide characters at most, and no word of the transcript cut in two',
    );
    const [first] = groups;
    assert.deepEqual(
      first.words.map((word) => word.text),
      ['今', '日', 'は', 'い', 'い'],
    );
    assert.ok(
      first.words.slice(1).every((word) => word.glue),
      'no space between them',
    );
    assert.deepEqual(
      [first.words[0].start, first.words[0].end],
      [1, 1.2],
      "a word's time is shared",
    );
    assert.equal(groups[1].words.at(-1).text, 'ね。', 'punctuation stays on its character');
    assert.equal(groups[1].end, 3.2);
    const whole = captionGroups([[1, 3.2, '今日はいい天気ですね。']], { group: { chars: 18 } });
    assert.equal(whole.map((group) => group.text).join(''), '今日はいい天気ですね。');
    assert.equal(whole.length, 2, 'a sentence that came as one word is cut by characters alone');
  });
});

describe('captionGroups: time', () => {
  it('shows a group from its first word until hold after its last, or until the next', () => {
    const groups = captionGroups(speak('one two three four (2) five'), { ...THREE, hold: 0.3 });
    assert.deepEqual(
      groups.map(({ text, start, end, until }) => [text, start, end, until]),
      [
        ['one two', 1, 1.65, 1.7],
        ['three four', 1.7, 2.35, 2.65],
        ['five', 4.35, 4.65, 4.95],
      ],
    );
    assert.deepEqual(
      groups.map((group) => group.index),
      [0, 1, 2],
    );
  });

  it('repairs badly timed words first', () => {
    const words = [
      [2, 2, 'world'],
      [1, 5, 'Hello'],
    ];
    const [group] = captionGroups(words, THREE);
    assert.equal(group.text, 'Hello world');
    assert.deepEqual(
      group.words.map((word) => [word.start, word.end]),
      [
        [1, 2],
        [2, 2.36],
      ],
    );
  });

  it('is worked out once for the same words and style, and is frozen', () => {
    const words = speak('one two three four');
    const style = { preset: 'clean' };
    const groups = captionGroups(words, style);
    assert.equal(captionGroups(words, style), groups);
    assert.equal(captionGroups(words, resolveCaptionStyle(style)), groups);
    assert.notEqual(captionGroups(words, { preset: 'pop' }), groups);
    assert.notEqual(captionGroups([...words], style), groups);
    assert.ok(Object.isFrozen(groups) && Object.isFrozen(groups[0]));
    assert.deepEqual(captionGroups([], style), []);
    for (const raw of [undefined, null, 'x', 7, {}]) assert.deepEqual(captionGroups(raw), []);
  });

  it('groups twenty thousand words quickly enough to do on a style change', () => {
    const many = Array.from({ length: 20000 }, (_, i) => [i * 0.3, i * 0.3 + 0.25, `w${i % 9}`]);
    const before = performance.now();
    const groups = captionGroups(many, 'karaoke');
    assert.ok(performance.now() - before < 2000, 'under two seconds');
    assert.equal(
      groups.reduce((sum, group) => sum + group.words.length, 0),
      20000,
    );
  });
});
