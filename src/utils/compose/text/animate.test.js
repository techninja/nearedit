import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REST, animateText, unitState } from './animate.js';
import { TEXT_ANIMATIONS, TEXT_UNITS, animationSpan, textAnimation } from './animation.js';

const anim = (type, extra = {}) =>
  textAnimation({ type, duration: 1, by: 'char', stagger: 0.1, ease: 'linear', ...extra });
const style = (animateIn, animateOut = textAnimation(null)) => ({
  animateIn,
  animateOut,
  fontSize: 100,
});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);
const inAt = (type, age, index = 0, extra) =>
  unitState(style(anim(type, extra)), index, 5, { age, remaining: 99 });
const outAt = (type, remaining, index = 0, extra) =>
  unitState(style(textAnimation(null), anim(type, extra)), index, 5, { age: 99, remaining });

describe('textAnimation', () => {
  it('applies the document defaults and refuses unknown values', () => {
    assert.deepEqual(textAnimation(undefined), {
      type: 'none',
      by: 'block',
      duration: 0.5,
      stagger: 0.05,
      ease: 'ease-out',
    });
    assert.equal(textAnimation({ type: 'explode' }).type, 'none');
    assert.equal(textAnimation({ type: 'fade', by: 'syllable' }).by, 'block');
    assert.equal(textAnimation({ type: 'fade', duration: -1 }).duration, 0.5);
    assert.equal(textAnimation({ type: 'typewriter' }).by, 'char', 'a typewriter types characters');
    assert.equal(textAnimation({ type: 'typewriter', by: 'word' }).by, 'word');
    assert.ok(TEXT_ANIMATIONS.includes('slide-up') && TEXT_UNITS.includes('word'));
  });

  it('knows how long an animation runs', () => {
    assert.equal(animationSpan(anim('none'), 5), 0);
    near(animationSpan(anim('fade'), 5), 1.4);
    near(animationSpan(anim('fade', { by: 'block' }), 1), 1);
    near(animationSpan(anim('typewriter', { stagger: 0 }), 5), 1);
    near(animationSpan(anim('typewriter', { stagger: 0.2 }), 5), 1);
  });
});

describe('entrances', () => {
  it('fades each piece in, one stagger after the other', () => {
    assert.equal(inAt('fade', 0).alpha, 0);
    near(inAt('fade', 0.5).alpha, 0.5);
    assert.equal(inAt('fade', 1), REST);
    assert.equal(inAt('fade', 0.3, 4).alpha, 0, 'the fifth piece starts at 0.4 s');
    near(inAt('fade', 0.9, 4).alpha, 0.5);
    assert.equal(inAt('fade', 1.4, 4), REST);
  });

  it('slides in from where the name says it is heading away from', () => {
    near(inAt('slide-up', 0.25).dy, 75);
    near(inAt('slide-down', 0.25).dy, -75);
    near(inAt('slide-left', 0.25).dx, 75);
    near(inAt('slide-right', 0.25).dx, -75);
    near(inAt('slide-up', 0.25).alpha, 0.25);
    assert.equal(inAt('slide-up', 0.25).dx, 0);
  });

  it('scales up from nothing and sharpens from a blur', () => {
    near(inAt('scale', 0.5).scale, 0.5);
    near(inAt('blur', 0.2).blur, 0.8 * 25);
    assert.equal(inAt('blur', 1), REST);
  });

  it('follows the easing, overshoot included', () => {
    assert.ok(inAt('scale', 0.8, 0, { ease: 'back-out' }).scale > 1);
    assert.equal(inAt('scale', 0.8, 0, { ease: 'back-out' }).alpha, 1);
    near(inAt('fade', 0.5, 0, { ease: 'ease-in' }).alpha, 0.125);
    assert.equal(inAt('fade', 0.5, 0, { ease: 'hold' }).alpha, 0);
  });

  it('types pieces one interval apart, none before the first interval', () => {
    const typed = (age) =>
      [0, 1, 2, 3, 4].filter((i) => inAt('typewriter', age, i, { stagger: 0 }).alpha === 1);
    assert.deepEqual(typed(0), []);
    assert.deepEqual(typed(0.2), [0]);
    assert.deepEqual(typed(0.61), [0, 1, 2]);
    assert.deepEqual(typed(1), [0, 1, 2, 3, 4]);
  });

  it('appears at once when the duration is zero', () => {
    assert.equal(inAt('fade', 0, 0, { duration: 0 }), REST);
    assert.equal(inAt('fade', 0.05, 1, { duration: 0 }).alpha, 0);
    assert.equal(inAt('fade', 0.1, 1, { duration: 0 }), REST);
  });
});

describe('exits', () => {
  it('lets the first piece leave first and the last finish at the clip end', () => {
    assert.equal(outAt('fade', 1.4, 0), REST);
    near(outAt('fade', 0.9, 0).alpha, 0.5);
    assert.equal(outAt('fade', 0.4, 0).alpha, 0);
    assert.equal(outAt('fade', 1, 4), REST, 'the last piece has not begun');
    near(outAt('fade', 0.5, 4).alpha, 0.5);
    assert.equal(outAt('fade', 0, 4).alpha, 0);
  });

  it('keeps moving the way the name says', () => {
    near(outAt('slide-up', 0.65).dy, -75);
    near(outAt('slide-left', 0.65).dx, -75);
    near(outAt('scale', 0.9).scale, 0.5);
  });

  it('erases a typewriter from the end', () => {
    const left = (remaining) =>
      [0, 1, 2, 3, 4].filter((i) => outAt('typewriter', remaining, i, { stagger: 0 }).alpha === 1);
    assert.deepEqual(left(1), [0, 1, 2, 3, 4]);
    assert.deepEqual(left(0.5), [0, 1]);
    assert.deepEqual(left(0.1), []);
  });
});

describe('animateText', () => {
  const both = style(anim('fade', { by: 'word' }), anim('slide-up', { by: 'line' }));
  const counts = { block: 1, line: 2, word: 4, char: 12 };
  const countOf = (by) => counts[by];

  it('is null while everything rests', () => {
    assert.equal(animateText(both, { age: 2, remaining: 2 }, countOf), null);
    assert.equal(animateText(style(textAnimation(null)), { age: 0, remaining: 0 }, countOf), null);
  });

  it('animates the pieces of whichever animation is running', () => {
    const entering = animateText(both, { age: 0.6, remaining: 5 }, countOf);
    assert.equal(entering.by, 'word');
    assert.equal(entering.states.length, 4);
    near(entering.states[0].alpha, 0.6);
    const leaving = animateText(both, { age: 5, remaining: 0.55 }, countOf);
    assert.equal(leaving.by, 'line');
    near(leaving.states[1].alpha, 0.55);
    near(leaving.states[0].alpha, 0.45);
    assert.ok(leaving.states[0].dy < leaving.states[1].dy, 'the first line is further along');
  });

  it('combines both while they overlap, by the pieces of the entrance', () => {
    const short = animateText(both, { age: 0.5, remaining: 0.5 }, countOf);
    assert.equal(short.by, 'word');
    near(short.states[0].alpha, 0.5 * 0.2);
    assert.ok(short.states[0].dy < 0);
  });
});
