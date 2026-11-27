import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fontString } from '../fonts.js';
import { layoutText, textPieces } from './layout.js';
import { TITLE_BOX_PADDING, TITLE_LINE_HEIGHT, hasShadow, textStyle } from './style.js';
import { graphemes, paragraphs, wrapLine } from './wrap.js';

/** Fake metrics: every character is half the font size wide, plus the spacing. */
const measureFor = (style) => (text) =>
  graphemes(text).length * (style.fontSize / 2 + style.letterSpacing);
const style = (extra = {}) => textStyle({ content: 'Hello', fontSize: 100, ...extra });
const layout = (extra) => layoutText(style(extra), measureFor(style(extra)));

describe('textStyle', () => {
  it('gives a v2 text block the look it always had', () => {
    const s = textStyle({ content: 'Hi', fontSize: 72, color: '#ffffff', bold: true });
    assert.equal(s.lineHeight, TITLE_LINE_HEIGHT);
    assert.equal(s.boxPadding, TITLE_BOX_PADDING);
    assert.deepEqual([s.letterSpacing, s.maxWidth, s.boxRadius, s.weight], [0, 0, 0, 0]);
    assert.equal(hasShadow(s), false);
    assert.equal(s.animateIn.type, 'none');
    assert.equal(s.animateOut.type, 'none');
    assert.equal(s.align, 'center');
  });

  it('repairs what it cannot use', () => {
    const s = textStyle({
      content: 'a\r\nb\rc',
      fontSize: 0,
      color: 'red',
      align: 'justify',
      lineHeight: -1,
      background: 'none',
      outlineWidth: -4,
    });
    assert.equal(s.content, 'a\nb\nc');
    assert.equal(s.fontSize, 72);
    assert.equal(s.color, '#ffffff');
    assert.equal(s.background, '');
    assert.deepEqual([s.align, s.lineHeight, s.outlineWidth], ['center', TITLE_LINE_HEIGHT, 0]);
    assert.equal(textStyle(undefined).content, '');
    assert.equal(hasShadow(textStyle({ shadowY: 4 })), true);
  });

  it('names a bundled face for every style', () => {
    assert.equal(fontString(style()), '400 100px "Inter", "Noto Color Emoji"');
    assert.equal(
      fontString(style({ bold: true, fontFamily: 'serif' })),
      '700 100px "Playfair Display", "Noto Color Emoji"',
    );
    assert.equal(
      fontString(style({ weight: 900, italic: true })),
      'italic 700 100px "Inter", "Noto Color Emoji"',
    );
    assert.equal(
      fontString(style({ italic: true, fontFamily: 'Caveat' })),
      '400 100px "Caveat", "Noto Color Emoji"',
    );
    assert.equal(
      fontString(style({ fontFamily: 'Papyrus; drop' }), 0.5),
      '400 50px "Inter", "Noto Color Emoji"',
    );
  });
});

describe('wrapping', () => {
  const width = (text) => text.length * 10;

  it('splits on any newline flavour and keeps blank lines', () => {
    assert.deepEqual(paragraphs('a\nb\r\nc\rd'), ['a', 'b', 'c', 'd']);
    assert.deepEqual(paragraphs('a\n\nb'), ['a', '', 'b']);
    assert.deepEqual(paragraphs(undefined), ['']);
  });

  it('wraps at words and leaves short lines alone', () => {
    assert.deepEqual(wrapLine('one two three four', 0, width), ['one two three four']);
    assert.deepEqual(wrapLine('one two three four', 500, width), ['one two three four']);
    assert.deepEqual(wrapLine('one two three four', 90, width), ['one two', 'three', 'four']);
    assert.deepEqual(wrapLine('one two three four', 130, width), ['one two three', 'four']);
  });

  it('breaks a single word that is wider than the line', () => {
    assert.deepEqual(wrapLine('abcdefghij', 40, width), ['abcd', 'efgh', 'ij']);
    assert.deepEqual(wrapLine('hi abcdefgh yo', 60, width), ['hi', 'abcdef', 'gh yo']);
    assert.deepEqual(wrapLine('abc', 5, width), ['a', 'b', 'c'], 'always at least one character');
  });

  it('keeps emoji sequences and accented letters whole', () => {
    assert.deepEqual(graphemes('a👍🏽é'), ['a', '👍🏽', 'é']);
    const each = (text) => graphemes(text).length * 10;
    assert.deepEqual(wrapLine('👍🏽👍🏽👍🏽', 20, each), ['👍🏽👍🏽', '👍🏽']);
  });
});

describe('layoutText', () => {
  it('centres a single line on the block centre', () => {
    const l = layout();
    assert.equal(l.width, 250);
    assert.equal(l.height, 100 * TITLE_LINE_HEIGHT);
    assert.deepEqual(l.lines, [{ text: 'Hello', width: 250, x: -125, y: 0 }]);
  });

  it('stacks lines at the line pitch, symmetric about the centre', () => {
    const l = layout({ content: 'One\nTwo\nThree' });
    assert.equal(l.height, 3 * 120);
    assert.deepEqual(
      l.lines.map((line) => line.y),
      [-120, 0, 120],
    );
    assert.equal(l.width, 250);
    assert.deepEqual(
      layout({ content: 'a\nb', lineHeight: 2 }).lines.map((line) => line.y),
      [-100, 100],
    );
  });

  it('aligns lines inside the block', () => {
    const xs = (align) => layout({ content: 'Hi\nLonger', align }).lines.map((line) => line.x);
    assert.deepEqual(xs('left'), [-150, -150]);
    assert.deepEqual(xs('center'), [-50, -150]);
    assert.deepEqual(xs('right'), [50, -150]);
  });

  it('pads the background box by a multiple of the font size', () => {
    const { box, width, height } = layout();
    const pad = 100 * TITLE_BOX_PADDING;
    assert.deepEqual(box, {
      x: -width / 2 - pad,
      y: -height / 2 - pad,
      width: width + pad * 2,
      height: height + pad * 2,
    });
    assert.equal(layout({ boxPadding: 1 }).box.width, 250 + 200);
    assert.equal(layout({ boxPadding: 0 }).box.width, 250);
  });

  it('wraps to maxWidth and measures the wrapped block', () => {
    const l = layout({ content: 'aaaa bbbb cccc\ndd', maxWidth: 500 });
    assert.deepEqual(
      l.lines.map((line) => line.text),
      ['aaaa bbbb', 'cccc', 'dd'],
    );
    assert.equal(l.width, 450);
    assert.equal(l.height, 360);
  });

  it('does not count the spacing after the last letter of a line', () => {
    const l = layout({ letterSpacing: 20 });
    assert.equal(l.width, 5 * 70 - 20);
    assert.equal(l.lines[0].x, -l.width / 2);
    assert.equal(layout({ content: '' }).width, 0);
  });
});

describe('textPieces', () => {
  const pieces = (by, extra = {}) => {
    const s = style({ content: 'ab cd\n\nef', ...extra });
    const measure = measureFor(s);
    return textPieces(layoutText(s, measure), by, measure, s.letterSpacing);
  };

  it('gives lines, skipping blank ones', () => {
    assert.deepEqual(
      pieces('line').map((p) => p.text),
      ['ab cd', 'ef'],
    );
  });

  it('places words where the whole line would draw them', () => {
    assert.deepEqual(
      pieces('word').map((p) => [p.text, p.x, p.width]),
      [
        ['ab', -125, 100],
        ['cd', 25, 100],
        ['ef', -50, 100],
      ],
    );
  });

  it('places characters, skipping spaces, with letter spacing in between', () => {
    assert.deepEqual(
      pieces('char').map((p) => p.text),
      ['a', 'b', 'c', 'd', 'e', 'f'],
    );
    const spaced = pieces('char', { content: 'abc', letterSpacing: 10 });
    assert.deepEqual(
      spaced.map((p) => [p.x, p.width]),
      [
        [-85, 50],
        [-25, 50],
        [35, 50],
      ],
    );
    assert.deepEqual(
      pieces('char').map((p) => p.y),
      [-120, -120, -120, -120, 120, 120],
    );
  });
});
