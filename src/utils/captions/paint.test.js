import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { captionGroups, layoutCaption, resolveCaptionStyle, unitOf } from './index.js';

const FRAME = { width: 1920, height: 1080, scale: 1, outWidth: 1920, outHeight: 1080 };
const WORDS = [
  [1, 1.4, 'one'],
  [1.5, 1.9, 'two'],
  [2, 2.4, 'three'],
];
const SIZE = 5 * 10.8;

/** Lay the three words out in a style, at a state. */
function lay(style, state, frame = FRAME) {
  const full = { size: 5, group: { words: 3, chars: 30 }, ...style };
  const size = resolveCaptionStyle(full).size * unitOf(frame);
  const measure = (text) => (text === ' ' ? 0.25 : [...text].length * 0.6) * size;
  return layoutCaption(captionGroups(WORDS, full)[0], state, full, frame, measure);
}
const REST = { word: 1, age: 9, wordAge: 9, wordProgress: 1 };
const looks = (laid) => laid.words.map((word) => [word.state, word.color, word.alpha, word.scale]);
const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${what}: ${actual} is ${expected}`);

describe('how the words of a group look', () => {
  it('tells said, being said and not yet said apart', () => {
    assert.deepEqual(looks(lay({ preset: 'clean' }, REST)), [
      ['said', '#ffffff', 1, 1],
      ['saying', '#facc15', 1, 1],
      ['unsaid', '#ffffff', 1, 1],
    ]);
    const first = lay({ preset: 'clean' }, { ...REST, word: 0 }).words.map((word) => word.state);
    assert.deepEqual(first, ['saying', 'unsaid', 'unsaid']);
    const none = lay({ preset: 'clean', highlight: { mode: 'none' } }, REST);
    assert.ok(none.words.every((word) => word.color === '#ffffff'));
    assert.equal(none.mark, null);
  });

  it('dims or hides the words not yet said', () => {
    const outlined = lay({ preset: 'clean', unspoken: 'dim' }, REST).words[2];
    assert.equal(outlined.alpha, 1, 'under an outline a dim word is opaque and darker');
    assert.match(outlined.color, /^rgba\(15\d, 15\d, 1\d\d, 1\)$/);
    const bare = lay({ preset: 'clean', unspoken: 'dim', stroke: { width: 0 } }, REST).words[2];
    assert.deepEqual([bare.color, bare.alpha], ['#ffffff', 0.6], 'without one it is translucent');
    const hidden = lay({ preset: 'clean', unspoken: 'hide' }, REST).words;
    assert.deepEqual(
      hidden.map((word) => word.alpha),
      [1, 1, 0],
    );
  });

  it('holds the word being said bigger when it is marked by size, and lets go of the last', () => {
    const style = {
      preset: 'pop',
      highlight: { scale: 1.2 },
      motion: { word: 'glide', seconds: 0.2 },
    };
    assert.deepEqual(
      lay(style, REST).words.map((word) => word.scale),
      [1, 1.2, 1],
    );
    const turning = lay(style, { ...REST, wordAge: 0.05 }).words;
    assert.ok(turning[0].scale > 1 && turning[0].scale < 1.2, 'the word before is shrinking back');
    assert.ok(turning[1].scale > 1 && turning[1].scale < 1.2, 'the word being said is growing');
    close(turning[0].scale + turning[1].scale, 2.2, 'as much as the other');
    const instant = lay({ ...style, motion: { word: 'none' } }, { ...REST, wordAge: 0 }).words;
    assert.deepEqual([instant[0].scale, instant[1].scale], [1, 1.2]);
  });

  it('pops the word being said and settles it again, starting from rest', () => {
    const style = { preset: 'clean', motion: { word: 'pop', seconds: 0.12 } };
    const scaleAt = (wordAge) => lay(style, { ...REST, wordAge }).words[1].scale;
    assert.equal(scaleAt(0), 1, 'no jump on the first frame');
    assert.ok(scaleAt(0.06) > 1.05 && scaleAt(0.06) <= 1.1, 'bigger in the middle');
    assert.equal(scaleAt(0.12), 1);
    assert.equal(scaleAt(3), 1);
    assert.equal(
      lay(style, { ...REST, wordAge: 0.06 }).words[1].color,
      '#facc15',
      'colour at once',
    );
  });

  it('glides: blends the colour in on one word and out on the one before', () => {
    const style = { preset: 'clean', motion: { word: 'glide', seconds: 0.2 } };
    const [before, now] = lay(style, { ...REST, wordAge: 0.05 }).words;
    assert.match(now.color, /^rgba\(/);
    assert.match(before.color, /^rgba\(/);
    assert.deepEqual(looks(lay(style, { ...REST, wordAge: 0.2 })).slice(0, 2), [
      ['said', '#ffffff', 1, 1],
      ['saying', '#facc15', 1, 1],
    ]);
  });

  it('fills: sweeps the colour through the word as long as it is spoken', () => {
    const style = { preset: 'karaoke', size: 5, motion: { word: 'fill' } };
    const half = lay(style, { ...REST, wordProgress: 0.5 }).words[1];
    assert.deepEqual([half.color, half.sweep], ['#22d3ee', 0.5]);
    assert.equal(half.rest.alpha, 1, 'the rest of the word is still as it was: dim');
    assert.match(half.rest.color, /^rgba\(/);
    const done = lay(style, { ...REST, wordProgress: 1 }).words[1];
    assert.deepEqual([done.sweep, done.rest], [1, null]);
    const reveal = lay({ ...style, unspoken: 'hide' }, { ...REST, wordProgress: 0.25 }).words[1];
    assert.deepEqual([reveal.sweep, reveal.rest], [0.25, null], 'a hidden word is revealed');
  });

  it('lets a hidden word arrive with the motion of the style', () => {
    const style = { preset: 'clean', unspoken: 'hide', motion: { seconds: 0.2 } };
    const popped = lay(
      { ...style, motion: { word: 'pop', seconds: 0.2 } },
      { ...REST, wordAge: 0 },
    );
    assert.ok(popped.words[1].alpha === 1 && popped.words[1].scale < 0.7, 'small, then it grows');
    const glided = lay(
      { ...style, motion: { word: 'glide', seconds: 0.2 } },
      { ...REST, wordAge: 0 },
    );
    assert.ok(glided.words[1].alpha > 0.2 && glided.words[1].alpha < 0.5, 'faint, but there');
    assert.ok(glided.words[1].dy > 0, 'and a little low');
  });
});

describe('the mark and the arrival', () => {
  it('puts a pill around the word being said, and glides it over from the word before', () => {
    const style = { preset: 'boxed', size: 5, motion: { word: 'glide', seconds: 0.2 } };
    const { mark, words, onMark } = lay(style, REST);
    const [one, two] = words;
    assert.equal(mark.kind, 'box');
    assert.ok(
      mark.x < two.x && mark.x + mark.width > two.x + two.width,
      'it reaches past the word',
    );
    close(mark.y + mark.height / 2, two.cy, 'centred on the line');
    assert.equal(onMark, '#0b0f19', 'dark letters on a yellow pill');
    assert.equal(lay({ ...style, highlight: { color: '#1d4ed8' } }, REST).onMark, '#ffffff');
    const moving = lay(style, { ...REST, wordAge: 0.04 }).mark;
    assert.ok(
      moving.x > one.x - mark.height && moving.x < mark.x,
      'on its way from the first word',
    );
    assert.deepEqual(lay(style, { ...REST, wordAge: 0.2 }).mark, mark, 'then it has arrived');
    const first = lay(style, { ...REST, word: 0, wordAge: 0.04 }).mark;
    assert.ok(
      first.x < one.x && first.x + first.width > one.x + one.width,
      'nothing to glide from',
    );
  });

  it('draws the underline below the baseline and grows it with a fill', () => {
    const style = { preset: 'minimal', size: 5, motion: { word: 'fill' } };
    const { mark, words } = lay(style, REST);
    assert.equal(mark.kind, 'underline');
    assert.deepEqual([mark.x, mark.width], [words[1].x, words[1].width]);
    assert.ok(mark.y > words[1].y && mark.y < words[1].y + SIZE * 0.4);
    const half = lay(style, { ...REST, wordProgress: 0.5 }).mark;
    close(half.width, words[1].width / 2, 'half the word is said');
    assert.equal(half.x, words[1].x);
  });

  it('shows something on the very first frame of a group and is at rest after the motion', () => {
    for (const how of ['fade', 'pop', 'slide']) {
      const style = { preset: 'clean', motion: { in: how, seconds: 0.2 } };
      const start = lay(style, { ...REST, age: 0 }).motion;
      assert.ok(start.alpha >= 0.25 && start.alpha < 1, `${how}: visible, not yet opaque`);
      assert.ok(how !== 'pop' || start.scale < 0.8, 'a pop starts small');
      assert.ok(how !== 'slide' || start.dy > 0.3 * SIZE, 'a slide starts low');
      assert.deepEqual(lay(style, { ...REST, age: 0.2 }).motion, { alpha: 1, scale: 1, dy: 0 });
    }
    const still = { preset: 'clean', motion: { in: 'none' } };
    assert.deepEqual(lay(still, { ...REST, age: 0 }).motion, { alpha: 1, scale: 1, dy: 0 });
    const zero = { preset: 'clean', motion: { in: 'pop', word: 'pop', seconds: 0 } };
    const laid = lay(zero, { ...REST, age: 0, wordAge: 0 });
    assert.deepEqual([laid.motion.alpha, laid.motion.scale, laid.words[1].scale], [1, 1, 1]);
  });
});
