import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAFE,
  captionFont,
  captionGroups,
  layoutCaption,
  reachOf,
  resolveCaptionStyle,
  unitOf,
} from './index.js';

const WIDE = { width: 1920, height: 1080, scale: 1, outWidth: 1920, outHeight: 1080 };
const TALL = { width: 1080, height: 1920, scale: 1, outWidth: 1080, outHeight: 1920 };
const SQUARE = { width: 1080, height: 1080, scale: 1, outWidth: 1080, outHeight: 1080 };
const WORDS = [
  [1, 1.4, 'one'],
  [1.5, 1.9, 'two'],
  [2, 2.4, 'three'],
];

/** Lay words out with a stand-in measure: 0.6 of the font size a character. */
function lay(style, frame = WIDE, state = null, words = WORDS) {
  const size = resolveCaptionStyle(style).size * unitOf(frame);
  const measure = (text) => (text === ' ' ? 0.25 : [...text].length * 0.6) * size;
  return layoutCaption(captionGroups(words, style)[0], state, style, frame, measure);
}
const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${what}: ${actual} is ${expected}`);

describe('units and position', () => {
  it("takes a unit to be a hundredth of the output's shorter side, at the canvas scale", () => {
    assert.equal(unitOf(WIDE), 10.8);
    assert.equal(unitOf(TALL), 10.8);
    assert.equal(unitOf(SQUARE), 10.8);
    assert.equal(
      unitOf({ width: 640, height: 360, scale: 1 / 3, outWidth: 1920, outHeight: 1080 }),
      3.6,
    );
    assert.equal(unitOf({ width: 640, height: 360, outWidth: 1920, outHeight: 1080 }), 3.6);
    assert.equal(lay({ size: 6 }).size, 64.8);
    assert.equal(captionFont({ size: 6 }, WIDE), '700 64.8px "Inter", "Noto Color Emoji"');
    assert.equal(captionFont('pop', TALL), '900 79.92px "Inter", "Noto Color Emoji"');
  });

  it('anchors the lines to the bottom, the top or the middle', () => {
    const bottom = lay({ position: { anchor: 'bottom', offset: 10 } }).box;
    close(bottom.y + bottom.height, 1080 - 108, 'ten units up from the bottom');
    const top = lay({ position: { anchor: 'top', offset: 10 } }).box;
    close(top.y, 108, 'ten units down from the top');
    const middle = lay({ position: { anchor: 'middle', offset: 10 } }).box;
    close(middle.y + middle.height / 2, 540, 'in the middle, whatever the offset');
    close(bottom.x + bottom.width / 2, 960, 'and always centred');
  });

  it('grows upward from the bottom, and downward from the top, when there are two lines', () => {
    const words = [
      [1, 1.4, 'in 2024'],
      [1.5, 1.9, 'we shipped it'],
    ];
    for (const anchor of ['bottom', 'top']) {
      const one = lay({ position: { anchor } }).box;
      const style = { position: { anchor }, group: { lines: 2, chars: 24 } };
      const two = lay(style, WIDE, null, words).box;
      close(two.height, one.height * 2, 'two lines');
      if (anchor === 'bottom') close(two.y + two.height, one.y + one.height, 'same bottom edge');
      else close(two.y, one.y, 'same top edge');
    }
  });

  it('sits further from the ends of a tall frame, where apps put their own text', () => {
    assert.equal(reachOf(12, WIDE), 12 * 10.8);
    assert.equal(reachOf(12, SQUARE), 12 * 10.8);
    close(reachOf(12, TALL), 12 * 10.8 * (16 / 9) ** 2, 'the bottom of a 9:16 frame');
    close(reachOf(12, TALL, 'top'), 12 * 10.8 * (16 / 9), 'its top');
    const box = lay('clean', TALL).box;
    const up = (1920 - box.y - box.height) / 1920;
    assert.ok(up > 0.19 && up < 0.23, `a fifth of the way up (${up.toFixed(3)})`);
    const wide = lay('clean', WIDE).box;
    close((1080 - wide.y - wide.height) / 1080, 0.12, 'an eighth of the way up a wide one');
  });

  it('never leaves the frame, whatever the offset', () => {
    for (const frame of [WIDE, TALL, SQUARE]) {
      for (const anchor of ['top', 'bottom']) {
        for (const offset of [0, 90]) {
          const { plate } = lay({ preset: 'boxed', position: { anchor, offset } }, frame);
          const margin = SAFE.y * unitOf(frame);
          assert.ok(
            plate.y >= margin - 1e-6 && plate.y + plate.height <= frame.height - margin + 1e-6,
          );
        }
      }
    }
  });

  it('stacks a second voice clear of the first, away from the anchored edge', () => {
    for (const preset of ['clean', 'boxed', 'karaoke']) {
      const first = lay(preset, WIDE, { lane: 0 });
      const second = lay(preset, WIDE, { lane: 1 });
      const lower = first.plate || first.box;
      const upper = second.plate || second.box;
      assert.ok(upper.y + upper.height < lower.y, `${preset}: the second is above the first`);
      assert.equal(second.box.x, first.box.x);
    }
    const top = { position: { anchor: 'top' } };
    assert.ok(lay(top, WIDE, { lane: 1 }).box.y > lay(top, WIDE, { lane: 0 }).box.y + 60);
  });
});

describe('words on a line', () => {
  it('spaces words by the font, and wider where outlines, pills or growth need room', () => {
    const gap = (style) => {
      const [one, two] = lay({ size: 5, ...style }).words;
      return (two.x - one.x - one.width) / 54;
    };
    close(gap({ stroke: { width: 0 }, motion: { word: 'none' } }), 0.25, 'a plain space');
    assert.ok(
      gap({ stroke: { width: 0.5 }, motion: { word: 'none' } }) > 0.3,
      'outlines take room',
    );
    assert.ok(gap({ preset: 'boxed' }) > 0.38, 'a pill reaches beyond its word');
    const grown = gap({ preset: 'pop', stroke: { width: 0 }, highlight: { scale: 1.2 } });
    close(grown, 0.25 + 0.1 * 1.8, 'a word that grows gets the room it grows into');
  });

  it('writes glued pieces without a space and lays right-to-left lines from the right', () => {
    const cjk = lay({ size: 5 }, WIDE, null, [[1, 2, '天気です']]).words;
    close(cjk[1].x, cjk[0].x + cjk[0].width, 'no gap between characters');
    const hebrew = lay({ size: 5 }, WIDE, null, [
      [1, 1.4, 'שלום'],
      [1.5, 1.9, 'עולם'],
    ]);
    assert.equal(hebrew.rtl, true);
    assert.ok(hebrew.words[0].x > hebrew.words[1].x, 'the first word is the right-most');
    assert.equal(lay({ size: 5 }).rtl, false);
  });
});
