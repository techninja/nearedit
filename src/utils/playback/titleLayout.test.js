import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultText } from '#utils/edl/defaults.js';
import {
  TITLE_BOX_PADDING,
  TITLE_LINE_HEIGHT,
  layoutTitle,
  titleFont,
  titleLines,
} from './titleLayout.js';

/** Fake metrics: every character is half the font size wide. */
const measure = (line, font) => line.length * (parseFloat(font.match(/(\d+(\.\d+)?)px/)[1]) / 2);
const text = (extra = {}) => ({ ...defaultText(), content: 'Hello', fontSize: 100, ...extra });

describe('titleFont', () => {
  it('builds a CSS font shorthand', () => {
    assert.equal(titleFont(text()), 'bold 100px sans-serif');
    assert.equal(
      titleFont(text({ bold: false, italic: true, fontFamily: 'serif' })),
      'italic 100px serif',
    );
    assert.equal(
      titleFont(text({ italic: true, fontFamily: 'monospace' })),
      'italic bold 100px monospace',
    );
  });

  it('refuses families outside the schema and bad sizes', () => {
    assert.equal(titleFont(text({ fontFamily: 'Papyrus; drop' })), 'bold 100px sans-serif');
    assert.equal(titleFont(text({ fontSize: 0 })), 'bold 72px sans-serif');
  });
});

describe('titleLines', () => {
  it('splits on any newline flavour and keeps blank lines', () => {
    assert.deepEqual(titleLines('a\nb\r\nc\rd'), ['a', 'b', 'c', 'd']);
    assert.deepEqual(titleLines('a\n\nb'), ['a', '', 'b']);
    assert.deepEqual(titleLines(undefined), ['']);
  });
});

describe('layoutTitle', () => {
  it('centres a single line on the block centre', () => {
    const layout = layoutTitle(text(), measure);
    assert.equal(layout.width, 250);
    assert.equal(layout.height, 100 * TITLE_LINE_HEIGHT);
    assert.deepEqual(layout.lines, [{ text: 'Hello', x: 0, y: 0 }]);
    assert.equal(layout.align, 'center');
  });

  it('stacks lines at the line pitch, symmetric about the centre', () => {
    const layout = layoutTitle(text({ content: 'One\nTwo\nThree' }), measure);
    assert.equal(layout.height, 3 * 120);
    assert.deepEqual(
      layout.lines.map((line) => line.y),
      [-120, 0, 120],
    );
    assert.equal(layout.width, 250); // "Three"
  });

  it('anchors lines to the block edge for left and right alignment', () => {
    const left = layoutTitle(text({ content: 'Hi\nLonger', align: 'left' }), measure);
    assert.equal(left.width, 300);
    assert.ok(left.lines.every((line) => line.x === -150));
    const right = layoutTitle(text({ content: 'Hi\nLonger', align: 'right' }), measure);
    assert.ok(right.lines.every((line) => line.x === 150));
    assert.equal(layoutTitle(text({ align: 'justify' }), measure).align, 'center');
  });

  it('pads the background box on every side', () => {
    const { box, width, height } = layoutTitle(text(), measure);
    const pad = 100 * TITLE_BOX_PADDING;
    assert.deepEqual(box, {
      x: -width / 2 - pad,
      y: -height / 2 - pad,
      width: width + pad * 2,
      height: height + pad * 2,
    });
  });

  it('scales with the font size', () => {
    const small = layoutTitle(text({ fontSize: 50 }), measure);
    assert.equal(small.width, 125);
    assert.equal(small.height, 60);
  });
});
