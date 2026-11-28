import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TARGET_FORMS, cleanTarget, describeTarget, formatTarget, parseTarget } from './index.js';

describe('parseTarget', () => {
  it('reads every form', () => {
    assert.deepEqual(parseTarget('text=Get started'), { by: 'text', value: 'Get started' });
    assert.deepEqual(parseTarget('label=Email'), { by: 'label', value: 'Email' });
    assert.deepEqual(parseTarget('css=#pricing .card'), { by: 'css', value: '#pricing .card' });
    assert.deepEqual(parseTarget('#pricing .card'), { by: 'css', value: '#pricing .card' });
    assert.deepEqual(parseTarget('point=640,300'), {
      by: 'point',
      value: '640,300',
      x: 640,
      y: 300,
    });
    assert.deepEqual(parseTarget({ x: 640, y: 300 }), {
      by: 'point',
      value: '640,300',
      x: 640,
      y: 300,
    });
    assert.deepEqual(TARGET_FORMS, ['text', 'label', 'css', 'point']);
  });

  it('treats a bare string as a CSS selector, whatever it contains', () => {
    for (const selector of [
      'a[href="/pricing"]',
      'input[name=email]',
      'main > section:nth-of-type(2) button.primary',
      'button:has(> svg)',
      'Text=Get started',
      'textarea',
      'label',
      'xpath=//a',
      '=',
    ]) {
      assert.deepEqual(parseTarget(selector), { by: 'css', value: selector }, selector);
    }
  });

  it('trims around the form and around what it names', () => {
    assert.deepEqual(parseTarget('  text=  Sign in  '), { by: 'text', value: 'Sign in' });
    assert.deepEqual(parseTarget(' css= .a  .b '), { by: 'css', value: '.a  .b' });
    assert.deepEqual(parseTarget('label=a=b'), { by: 'label', value: 'a=b' });
    assert.deepEqual(parseTarget('text=line one\nline two'), {
      by: 'text',
      value: 'line one\nline two',
    });
  });

  it('reads points with spaces, signs and fractions', () => {
    assert.deepEqual(parseTarget('point= 10.5 , -20 '), {
      by: 'point',
      value: '10.5,-20',
      x: 10.5,
      y: -20,
    });
    assert.deepEqual(parseTarget({ x: 0.12345, y: 7, extra: true }), {
      by: 'point',
      value: '0.123,7',
      x: 0.123,
      y: 7,
    });
    assert.deepEqual(parseTarget({ x: -0, y: 1e-9 }), { by: 'point', value: '0,0', x: 0, y: 0 });
  });

  it('returns null for what names nothing', () => {
    const nothing = [
      '',
      '   ',
      'text=',
      'label=   ',
      'css=',
      'point=',
      'point=640',
      'point=a,b',
      'point=1,2,3',
      'point=1e3,2',
      { x: 1 },
      { x: '1', y: '2' },
      { x: NaN, y: 0 },
      { x: 1e9, y: 0 },
      Object.create({ x: 1, y: 2 }),
      [640, 300],
      null,
      undefined,
      42,
      true,
    ];
    for (const target of nothing) assert.equal(parseTarget(target), null, JSON.stringify(target));
  });
});

describe('formatTarget', () => {
  it('is the inverse of parseTarget', () => {
    const targets = [
      'text=Get started',
      'label=Email',
      '#pricing .card',
      'a[href="/x"]',
      'point=640,300',
      'point=10.5,-20',
    ];
    for (const target of targets) {
      const parsed = parseTarget(target);
      assert.equal(formatTarget(parsed), target);
      assert.deepEqual(parseTarget(formatTarget(parsed)), parsed);
    }
    assert.equal(formatTarget(parseTarget('css=#a')), '#a');
    assert.equal(formatTarget(parseTarget({ x: 1, y: 2 })), 'point=1,2');
  });

  it('writes a selector that would read as another form with its prefix', () => {
    const odd = { by: 'css', value: 'text=odd' };
    assert.equal(formatTarget(odd), 'css=text=odd');
    assert.deepEqual(parseTarget(formatTarget(odd)), odd);
  });

  it('writes nothing for nothing', () => {
    for (const parsed of [null, undefined, {}, { by: 'xpath', value: '//a' }, { by: 'text' }]) {
      assert.equal(formatTarget(parsed), '');
    }
    assert.equal(formatTarget({ by: 'point', value: 'x', x: NaN, y: 1 }), '');
    assert.equal(formatTarget({ by: 'label', value: '   ' }), '');
  });
});

describe('cleanTarget and describeTarget', () => {
  it('stores strings trimmed and points as points', () => {
    assert.equal(cleanTarget('  text=Go  '), 'text=Go');
    assert.deepEqual(cleanTarget({ x: 1.25, y: 2, z: 3 }), { x: 1.25, y: 2 });
    assert.deepEqual(cleanTarget({ x: 1e9, y: -1e9 }), { x: 100000, y: -100000 });
    for (const bad of [null, 7, [], { x: 1 }, { x: '1', y: 2 }, { x: Infinity, y: 0 }]) {
      assert.equal(cleanTarget(bad), '');
    }
  });

  it('describes a target on one line', () => {
    assert.equal(describeTarget({ x: 3, y: 4 }), 'point=3,4');
    assert.equal(describeTarget(' css=.a '), '.a');
    assert.equal(describeTarget('text='), '');
  });
});
