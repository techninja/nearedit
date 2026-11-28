import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRESET_NAMES,
  SAFE,
  captionAt,
  captionFont,
  captionGroups,
  layoutCaption,
  resolveCaptionStyle,
  unitOf,
} from './index.js';

const FRAMES = {
  wide: { width: 1920, height: 1080, scale: 1, outWidth: 1920, outHeight: 1080 },
  tall: { width: 1080, height: 1920, scale: 1, outWidth: 1080, outHeight: 1920 },
  square: { width: 1080, height: 1080, scale: 1, outWidth: 1080, outHeight: 1080 },
};
const PARAGRAPH =
  "So, here's the thing: in 2024 we shipped 37 features, and honestly? It was " +
  'unbelievably hard. But the team never gave up. Thanks for watching, see you tomorrow!';
/** Words 0.3 s long, 0.05 s apart. */
const speak = (text, from = 1) =>
  text.split(' ').map((word, i) => [from + i * 0.35, from + i * 0.35 + 0.3, word]);
const WORDS = speak(PARAGRAPH);

/** A stand-in for `measureText`: every character 0.6 of the font size wide, a space 0.25. */
function measureFor(style, frame) {
  const size = resolveCaptionStyle(style).size * unitOf(frame);
  return (text) => (text === ' ' ? 0.25 : [...text].length * 0.6) * size;
}
const lay = (group, state, style, frame = FRAMES.wide) =>
  layoutCaption(group, state, style, frame, measureFor(style, frame));
/** Only where things are: what must not change while a group is on screen. */
const places = (laid) => ({
  font: laid.font,
  box: laid.box,
  plate: laid.plate,
  words: laid.words.map(({ text, x, y, cy, width, line }) => ({ text, x, y, cy, width, line })),
});
const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${what}: ${actual} is ${expected}`);

describe('layoutCaption: inside the frame', () => {
  it('keeps every word, plate and mark inside the safe margins, in three formats', () => {
    for (const preset of PRESET_NAMES) {
      for (const [format, frame] of Object.entries(FRAMES)) {
        const unit = unitOf(frame);
        for (const group of captionGroups(WORDS, preset)) {
          const laid = lay(group, { word: group.words.length - 1 }, preset, frame);
          const rects = [...laid.words.map((w) => ({ x: w.x, width: w.width })), laid.box];
          if (laid.plate) rects.push(laid.plate);
          if (laid.mark) rects.push(laid.mark);
          const where = `${preset} ${format} "${group.text}"`;
          for (const rect of rects) {
            assert.ok(rect.x >= SAFE.x * unit - 1e-6, `${where}: left of the safe margin`);
            assert.ok(rect.x + rect.width <= frame.width - SAFE.x * unit + 1e-6, `${where}: right`);
          }
          const tall = laid.plate || laid.box;
          assert.ok(tall.y >= SAFE.y * unit - 1e-6, `${where}: above the frame`);
          assert.ok(tall.y + tall.height <= frame.height - SAFE.y * unit + 1e-6, `${where}: below`);
        }
      }
    }
  });

  it('shrinks the text rather than leave the frame when a word is too long', () => {
    const style = { preset: 'pop', size: 12 };
    const [group] = captionGroups([[1, 2, 'pneumonoultramicroscopicsilicovolcanoconiosis']], style);
    for (const frame of Object.values(FRAMES)) {
      const laid = lay(group, null, style, frame);
      const [word] = laid.words;
      assert.ok(laid.size < 12 * unitOf(frame), 'the font is smaller than the style asks');
      assert.ok(laid.font.includes(`${laid.size}px`), 'and the font to draw with says so');
      assert.ok(word.x >= SAFE.x * unitOf(frame) && word.x + word.width <= frame.width);
      close(word.x + word.width / 2, frame.width / 2, 'still centred');
    }
    const short = lay(captionGroups([[1, 2, 'short']], style)[0], null, style);
    assert.equal(short.size, 129.6, 'a word that fits is not shrunk');
    assert.equal(short.font, captionFont(style, FRAMES.wide));
  });

  it('is the same picture on a small canvas: every length scales with it', () => {
    const preview = { width: 640, height: 360, scale: 1 / 3, outWidth: 1920, outHeight: 1080 };
    for (const preset of PRESET_NAMES) {
      const group = captionAt(captionGroups(WORDS, preset), 4).group;
      const big = lay(group, { word: 1, age: 0.05, wordAge: 0.05 }, preset, FRAMES.wide);
      const small = lay(group, { word: 1, age: 0.05, wordAge: 0.05 }, preset, preview);
      close(small.size * 3, big.size, `${preset} font size`);
      close(small.box.y * 3, big.box.y, `${preset} position`);
      close(small.motion.dy * 3, big.motion.dy, `${preset} motion`);
      big.words.forEach((word, i) => close(small.words[i].x * 3, word.x, `${preset} word ${i}`));
    }
    const bare = lay(captionGroups(WORDS, 'clean')[0], null, 'clean', {
      width: 1920,
      height: 1080,
    });
    close(bare.unit, 10.8, 'a frame with only a width and a height is its own output');
  });
});

describe('layoutCaption: nothing jumps', () => {
  it('keeps every word where it is for as long as its group is on screen', () => {
    const variants = [...PRESET_NAMES, { preset: 'clean', unspoken: 'hide' }];
    variants.push({ preset: 'pop', unspoken: 'dim', motion: { word: 'fill' } });
    for (const style of variants) {
      const groups = captionGroups(WORDS, style);
      for (const group of groups.slice(0, 6)) {
        const first = places(lay(group, captionAt(groups, group.start), style));
        for (let time = group.start; time < group.until; time += 1 / 30) {
          const laid = lay(group, captionAt(groups, time), style);
          assert.deepEqual(places(laid), first, `"${group.text}" at ${time.toFixed(3)} s`);
        }
      }
    }
  });

  it('gives the same layout for the same instant, and changes nothing it is given', () => {
    const groups = captionGroups(WORDS, 'boxed');
    const state = captionAt(groups, 4.02);
    const before = JSON.stringify([state.group, state]);
    assert.deepEqual(lay(state.group, state, 'boxed'), lay(state.group, state, 'boxed'));
    assert.equal(JSON.stringify([state.group, state]), before);
  });

  it('centres each line and sets the second one line below the first', () => {
    const style = { preset: 'karaoke' };
    const group = captionGroups(speak('in 2024 we shipped 37 features, and so on'), style)[0];
    assert.deepEqual(group.lines, [4, 2]);
    const laid = lay(group, null, style);
    const [top, bottom] = [laid.words.slice(0, 4), laid.words.slice(4)];
    for (const line of [top, bottom]) {
      const last = line.at(-1);
      close((line[0].x + last.x + last.width) / 2, 960, 'a line is centred');
      assert.ok(
        line.every((word) => word.y === line[0].y),
        'on one baseline',
      );
    }
    close(bottom[0].y - top[0].y, laid.size * 1.22, 'one line apart');
    assert.deepEqual([top[0].line, bottom[0].line], [0, 1]);
    close(laid.box.height, 2 * laid.size * 1.22, 'the box holds both lines');
  });

  it('gives nothing to draw for no group or no canvas', () => {
    const [group] = captionGroups(WORDS, 'clean');
    const measure = () => 10;
    assert.equal(layoutCaption(null, null, 'clean', FRAMES.wide, measure), null);
    assert.equal(layoutCaption({ words: [] }, null, 'clean', FRAMES.wide, measure), null);
    assert.equal(layoutCaption(group, null, 'clean', { width: 0, height: 100 }, measure), null);
    assert.equal(layoutCaption(group, null, 'clean', null, measure), null);
    assert.ok(layoutCaption(group, { word: 99 }, 'nonsense', FRAMES.wide, measure));
  });
});
