import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateMeasure, lengthOf, num, padOf } from './measure.js';
import { fitText, textContent, textFont } from './textFit.js';
import { pieces, wrapText } from './wrap.js';

const env = { unit: 10.8, measure: estimateMeasure };
const FONT = { family: 'Inter', weight: 700 };
const LONG = 'Dr. Wilhelmina Featherstonehaugh-Cholmondeley, Professor of Applied Mathematics';
const fit = (layer, width) => fitText({ type: 'text', font: FONT, ...layer }, width, env);
const widest = (fitted) => {
  const style = { fontFamily: 'Inter', fontSize: fitted.fontSize, weight: 700, letterSpacing: 0 };
  return Math.max(...fitted.content.split('\n').map((line) => estimateMeasure(line, style)));
};

describe('the estimate used when no host measures', () => {
  it('grows with the text, the size and the weight, and knows the families', () => {
    const style = { fontFamily: 'Inter', fontSize: 100, weight: 400, letterSpacing: 0 };
    assert.ok(estimateMeasure('Hello', style) > estimateMeasure('Hell', style));
    assert.equal(
      estimateMeasure('Hello', { ...style, fontSize: 50 }),
      estimateMeasure('Hello', style) / 2,
    );
    assert.ok(
      estimateMeasure('Hello', { ...style, weight: 900 }) > estimateMeasure('Hello', style),
    );
    assert.ok(
      estimateMeasure('Hello', { ...style, fontFamily: 'Bebas Neue' }) <
        estimateMeasure('Hello', style),
    );
    assert.equal(
      estimateMeasure('iiii', { ...style, fontFamily: 'JetBrains Mono' }),
      240,
      'monospaced',
    );
    const spaced =
      estimateMeasure('ab', { ...style, letterSpacing: 10 }) - estimateMeasure('ab', style);
    assert.ok(Math.abs(spaced - 20) < 1e-9);
    assert.equal(estimateMeasure('', style), 0);
  });

  it('reads numbers, lengths and paddings leniently', () => {
    assert.deepEqual(
      [num(3, 1), num('3', 1), num(NaN, 1), num(9, 1, 0, 5), num('{x}', 2)],
      [3, 1, 1, 5, 2],
    );
    assert.deepEqual(
      [lengthOf(4, 1000, 10, 7), lengthOf('50%', 1000, 10, 7), lengthOf('x', 1000, 10, 7)],
      [40, 500, 7],
    );
    assert.deepEqual(
      [padOf(2, 10), padOf([1, 3], 10), padOf(undefined, 10)],
      [
        [20, 20],
        [10, 30],
        [0, 0],
      ],
    );
  });
});

describe('fitting text', () => {
  it('keeps a short text at its size on one line', () => {
    const fitted = fit({ text: 'Ada', size: 5 }, 800);
    assert.deepEqual([fitted.content, fitted.lines, fitted.fontSize], ['Ada', 1, 54]);
    assert.ok(fitted.width > 0 && fitted.width < 200);
    assert.equal(fitted.height, 54 * 1.15);
    assert.equal(fit({ text: '   ' }, 800), null, 'nothing to draw');
    assert.equal(fit({}, 800), null);
  });

  it('wraps at spaces and after hyphens, never inside a word that fits', () => {
    const fitted = fit({ text: LONG, size: 5, lines: 4 }, 600);
    const lines = fitted.content.split('\n');
    assert.ok(lines.length > 1 && lines.length <= 4);
    assert.ok(widest(fitted) <= 600.5, 'every line fits');
    assert.equal(
      fitted.content.replace(/\n/g, ' ').replace(/- /g, '-'),
      LONG,
      'nothing lost or added',
    );
    assert.ok(
      lines.includes('Featherstonehaugh-') ||
        lines.some((line) => line.endsWith('Featherstonehaugh-')),
    );
    assert.deepEqual(
      pieces('a-b c/d — e').map((p) => p.text),
      ['a-', 'b', 'c/', 'd', '—', 'e'],
    );
    const measure = (text) => text.length * 10;
    assert.deepEqual(wrapText('one two-three four', 80, measure), ['one two-', 'three', 'four']);
    assert.deepEqual(
      wrapText('abcdefghijkl', 50, measure),
      ['abcde', 'fghij', 'kl'],
      'only what is wider than a line',
    );
    assert.deepEqual(wrapText('a\n\nb', 0, measure), ['a', '', 'b']);
  });

  it('sets a text smaller until it fits its lines, down to its smallest size', () => {
    const roomy = fit({ text: LONG, size: 5, lines: 2 }, 1600);
    const tight = fit({ text: LONG, size: 5, lines: 2 }, 900);
    assert.equal(roomy.fontSize, 54);
    assert.ok(tight.fontSize < 54 && tight.fontSize >= 54 * 0.55);
    assert.ok(tight.lines <= 2 && widest(tight) <= 900.5);
    const floor = fit({ text: LONG, size: 5, minSize: 4.5, lines: 1 }, 600);
    assert.equal(floor.fontSize, 48.6);
    assert.equal(
      fit({ text: 'x', size: 3, minSize: 9 }, 100).fontSize,
      32.4,
      'never larger than its size',
    );
    assert.equal(
      fit({ text: LONG, size: 3, lines: 1 }, 100).fontSize,
      23.76,
      'never below what reads: 2.2 units',
    );
  });

  it('cuts what still does not fit with an ellipsis, at a word', () => {
    const cut = fit({ text: `${LONG}. ${LONG}.`, size: 5, minSize: 4, lines: 2 }, 900);
    assert.equal(cut.lines, 2);
    assert.ok(cut.content.endsWith('…'));
    assert.ok(widest(cut) <= 900.5);
    assert.ok(LONG.startsWith(cut.content.split('\n')[0]));
    assert.doesNotMatch(cut.content, /[\s,.]…$/, 'no dangling punctuation before the ellipsis');
  });

  it('evens the lines out', () => {
    const fitted = fit(
      { text: 'one two three four five six seven eight nine ten', size: 5, lines: 3 },
      1000,
    );
    const widths = fitted.content.split('\n').map((line) => line.length);
    assert.equal(widths.length, 2);
    assert.ok(Math.abs(widths[0] - widths[1]) <= 6, `balanced: ${fitted.content}`);
  });

  it('takes its font from a font token, the layer on top', () => {
    const font = textFont({
      font: { family: 'Bebas Neue', weight: 400, upper: true, tracking: 0.02, scale: 1.3 },
      weight: 700,
    });
    assert.deepEqual(font, {
      family: 'Bebas Neue',
      weight: 700,
      italic: false,
      tracking: 0.02,
      lineHeight: 1.15,
      upper: true,
      scale: 1.3,
    });
    assert.equal(
      textFont({ font: '{font.heading}' }).family,
      'Inter',
      'an unfilled reference falls back',
    );
    assert.equal(
      textContent({ text: ' ada\r\nlovelace ', font: { upper: true } }),
      'ADA\nLOVELACE',
    );
    assert.equal(
      fit({ text: 'Ada', size: 5, font: { family: 'Caveat', scale: 1.5 } }, 800).fontSize,
      81,
    );
  });

  it('survives what is not text', () => {
    for (const text of [null, 7, {}, [], true]) assert.equal(fit({ text }, 500), null);
    const narrow = fit({ text: LONG, size: 5 }, 0);
    assert.ok(narrow.lines >= 1 && narrow.content.length > 0);
  });
});
