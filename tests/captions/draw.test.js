/**
 * Caption drawing on the server canvas, with the real fonts: the same
 * pixels every time, nothing kept between frames, the context left as it
 * was, ink inside the frame, and the word being said where the layout says.
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, registerFonts } from '../../src/api/compose/index.js';
import * as captions from '../../src/utils/captions/index.js';
import { FORMATS, WORDS, frameOf, timed } from './scenes.js';

const WIDTHS = { wide: 640, tall: 360, square: 480 };

/** A transparent canvas of a format with the caption at a time drawn on it. */
function drawn(style, time, format = 'wide', voices = [WORDS]) {
  const frame = frameOf(format, WIDTHS[format]);
  const canvas = createCanvas(frame.width, frame.height);
  const ctx = canvas.getContext('2d');
  const any = voices.map((words, lane) =>
    captions.drawCaptionAt(ctx, words, time, style, frame, lane),
  );
  const { data } = ctx.getImageData(0, 0, frame.width, frame.height);
  return { frame, ctx, data, any: any.some(Boolean) };
}

/** The box around the pixels that pass a test, or null. */
function bounds({ frame, data }, test = (r, g, b, a) => a > 0) {
  const box = { left: Infinity, top: Infinity, right: -1, bottom: -1, count: 0 };
  for (let i = 0; i < data.length; i += 4) {
    if (!test(data[i], data[i + 1], data[i + 2], data[i + 3])) continue;
    const [x, y] = [(i / 4) % frame.width, Math.floor(i / 4 / frame.width)];
    box.left = Math.min(box.left, x);
    box.top = Math.min(box.top, y);
    box.right = Math.max(box.right, x);
    box.bottom = Math.max(box.bottom, y);
    box.count++;
  }
  return box.count ? box : null;
}
const same = (a, b) => Buffer.compare(Buffer.from(a.buffer), Buffer.from(b.buffer)) === 0;
const yellow = (r, g, b, a) => a > 200 && r > 230 && g > 180 && g < 225 && b < 80;

describe('drawCaptionAt on the server canvas', () => {
  before(() => registerFonts());

  it('draws the same pixels every time, whatever was drawn before', () => {
    for (const preset of captions.PRESET_NAMES) {
      for (const time of [3.57, 3.8, 4.4]) {
        const first = drawn(preset, time);
        drawn(preset, time + 2.5); // another group in between
        drawn('pop', 1);
        assert.ok(first.any && bounds(first), `${preset} draws at ${time} s`);
        assert.ok(same(first.data, drawn(preset, time).data), `${preset} at ${time} s`);
      }
    }
  });

  it('leaves the context as it found it', () => {
    const frame = frameOf('wide', 640);
    const ctx = createCanvas(frame.width, frame.height).getContext('2d');
    ctx.font = '400 20px "Caveat"';
    ctx.fillStyle = '#123456';
    ctx.globalAlpha = 0.5;
    ctx.translate(7, 9);
    const state = () =>
      JSON.stringify([ctx.font, ctx.fillStyle, ctx.strokeStyle, ctx.globalAlpha, ctx.lineWidth]) +
      JSON.stringify([ctx.textBaseline, ctx.textAlign, ctx.filter, ctx.getTransform().e]);
    const was = state();
    for (const preset of captions.PRESET_NAMES) {
      assert.equal(captions.drawCaptionAt(ctx, WORDS, 3.6, preset, frame), true);
    }
    assert.equal(state(), was);
  });

  it('draws nothing, and says so, when no group is on screen', () => {
    for (const time of [0, 5.9, 99, NaN]) {
      const frame = drawn('clean', time);
      assert.equal(frame.any, false);
      assert.equal(bounds(frame), null, `nothing at ${time} s`);
    }
    assert.equal(drawn('clean', 3.9, 'wide', [[]]).any, false);
    assert.equal(drawn('clean', 3.9, 'wide', [null]).any, false);
  });

  it('keeps all ink inside the frame, well clear of its edges, in three formats', () => {
    const long = timed('It is pneumonoultramicroscopicsilicovolcanoconiosis, apparently!', 0.4);
    for (const preset of captions.PRESET_NAMES) {
      for (const format of Object.keys(FORMATS)) {
        for (const [words, time] of [
          [WORDS, 1.0],
          [WORDS, 3.0],
          [WORDS, 7.0],
          [long, 1.5],
        ]) {
          const frame = drawn(preset, time, format, [words]);
          const box = bounds(frame);
          const margin = 1.5 * captions.unitOf(frame.frame);
          const where = `${preset} ${format} at ${time} s`;
          assert.ok(box, `${where}: a caption is drawn`);
          assert.ok(box.left >= margin && box.top >= margin, `${where}: clear of the left and top`);
          assert.ok(box.right <= frame.frame.width - margin, `${where}: clear of the right`);
          assert.ok(box.bottom <= frame.frame.height - margin, `${where}: clear of the bottom`);
        }
      }
    }
  });

  it('marks the word being said, and only that word, where the layout puts it', () => {
    const style = { preset: 'clean', motion: { in: 'none', word: 'none' } };
    const groups = captions.captionGroups(WORDS, style);
    const state = captions.captionAt(groups, 3.9);
    assert.deepEqual([state.group.text, state.word], ['37 features,', 1]);
    const frame = drawn(style, 3.9);
    frame.ctx.font = captions.captionFont(style, frame.frame);
    const measure = (text) => frame.ctx.measureText(text).width;
    const laid = captions.layoutCaption(state.group, state, style, frame.frame, measure);
    const [first, said] = laid.words;
    const marked = bounds(frame, yellow);
    assert.ok(marked.count > 100, 'the highlight colour is on screen');
    assert.ok(marked.left >= said.x - 1 && marked.right <= said.x + said.width + 1, 'on its word');
    assert.ok(marked.left > first.x + first.width, 'and not on the word before');
    assert.equal(bounds(drawn({ ...style, highlight: { mode: 'none' } }, 3.9), yellow), null);
  });

  it('moves no pixel while the mark passes from word to word', () => {
    // Without motion only colours change: the shape of the ink stays put
    // (to a level or two where the outlines of two words meet, since the
    // word being said is drawn in front).
    const style = { preset: 'clean', motion: { in: 'none', word: 'none' } };
    const alpha = (time) => drawn(style, time).data.filter((_, i) => i % 4 === 3);
    const group = captions.captionAt(captions.captionGroups(WORDS, style), 3.9).group;
    const first = alpha(group.start);
    for (let time = group.start; time < group.until; time += 1 / 30) {
      const now = alpha(time);
      const off = now.reduce((worst, value, i) => Math.max(worst, Math.abs(value - first[i])), 0);
      assert.ok(off <= 2, `the same ink at ${time.toFixed(3)} s (off by ${off})`);
    }
  });

  it('reveals hidden words one by one, each in its final place', () => {
    const style = { preset: 'clean', unspoken: 'hide', motion: { in: 'none', word: 'none' } };
    const [early, late] = [drawn(style, 3.6), drawn(style, 3.9)];
    const shown = { preset: 'clean', motion: { in: 'none', word: 'none' } };
    assert.ok(bounds(early).right < bounds(late).right - 20, 'the second word is not there yet');
    assert.equal(bounds(early).left, bounds(drawn(shown, 3.6)).left, 'the first is where it stays');
    assert.equal(bounds(late).right, bounds(drawn(shown, 3.9)).right);
  });

  it('stacks two voices at once, the second clear of the first', () => {
    const other = timed('Wait, what? Are you sure about that number?', 3.4);
    const one = bounds(drawn('boxed', 3.9));
    const both = bounds(drawn('boxed', 3.9, 'wide', [WORDS, other]));
    const second = bounds(drawn('boxed', 3.9, 'wide', [[], other]));
    assert.equal(both.bottom, one.bottom, 'the first voice stays where it is');
    assert.ok(second.bottom < one.top, 'the second sits above it');
    assert.equal(both.top, second.top);
  });
});
