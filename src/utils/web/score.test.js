import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STEP_KINDS,
  compileScore,
  normalizeRecipe,
  stepAt,
  stepDuration,
  stepHold,
  typeApproach,
  typedCharacters,
} from './index.js';

const URL_OK = 'https://example.com';
const RATES = [24, 25, 30, 60];

/** @returns {boolean} True when a time is a whole number of frames */
const onGrid = (time, fps) => Math.abs(time * fps - Math.round(time * fps)) < 1e-9;

describe('compileScore', () => {
  it('matches the example in the contract', () => {
    const score = compileScore({ url: URL_OK, steps: [{ do: 'click', target: 'a' }] }, 30);
    assert.deepEqual(score, {
      fps: 30,
      duration: 2.9,
      frames: 87,
      steps: [{ index: 0, do: 'click', start: 0.6, actionEnd: 1.3, end: 1.9, note: '' }],
    });
  });

  it('a recipe without steps lasts lead + tail', () => {
    assert.deepEqual(compileScore({ url: URL_OK }, 30), {
      fps: 30,
      duration: 1.6,
      frames: 48,
      steps: [],
    });
  });

  for (const kind of STEP_KINDS) {
    it(`${kind.do}: default duration ${kind.duration} and hold ${kind.hold}`, () => {
      const recipe = { url: URL_OK, lead: 0, tail: 0, steps: [{ do: kind.do, text: '' }] };
      for (const fps of RATES) {
        const frames = (seconds) => Math.round(seconds * fps);
        const [step] = compileScore(recipe, fps).steps;
        assert.equal(Math.round(step.start * fps), 0);
        assert.equal(
          Math.round(step.actionEnd * fps),
          frames(kind.duration === 0.5 && kind.do === 'type' ? 0 : kind.duration),
        );
        assert.equal(
          Math.round((step.end - step.actionEnd) * fps),
          frames(kind.hold),
          `${kind.do} hold at ${fps}`,
        );
      }
    });
  }

  it('type lasts 0.5 s (only with a target) + length / speed', () => {
    const timed = (step) => stepDuration(normalizeRecipe({ url: URL_OK, steps: [step] }).steps[0]);
    assert.equal(timed({ do: 'type', text: 'fourteen chars' }), 1);
    assert.equal(timed({ do: 'type', text: 'fourteen chars', target: 'label=Email' }), 1.5);
    assert.equal(
      timed({ do: 'type', text: 'fourteen chars', target: 'text=' }),
      1,
      'no real target',
    );
    assert.equal(timed({ do: 'type', text: 'abcdefg', speed: 7 }), 1);
    assert.equal(timed({ do: 'type', text: '👋👋', speed: 2 }), 1, 'an emoji is one character');
    assert.equal(timed({ do: 'type', text: '', target: 'a' }), 0.5);
    assert.equal(timed({ do: 'type', text: 'abc', target: 'a', duration: 2 }), 2);
    assert.deepEqual(typedCharacters({ do: 'type', text: 'a👋é' }), ['a', '👋', 'é']);
    assert.equal(typeApproach({ do: 'type', target: { x: 1, y: 2 } }), 0.5);
    assert.equal(typeApproach({ do: 'click', target: 'a' }), 0);
  });

  it('a step may set its own duration and hold, also to nothing', () => {
    const recipe = {
      url: URL_OK,
      lead: 1,
      tail: 2,
      steps: [
        { do: 'click', target: 'a', duration: 0.2, hold: 0 },
        { do: 'wait', duration: 0, hold: 0 },
        { do: 'hide', target: 'a', duration: 1.5, hold: 0.5, note: 'gone' },
        { do: 'focus', target: 'a', duration: 0 },
      ],
    };
    assert.deepEqual(compileScore(recipe, 10), {
      fps: 10,
      duration: 6.7,
      frames: 67,
      steps: [
        { index: 0, do: 'click', start: 1, actionEnd: 1.2, end: 1.2, note: '' },
        { index: 1, do: 'wait', start: 1.2, actionEnd: 1.2, end: 1.2, note: '' },
        { index: 2, do: 'hide', start: 1.2, actionEnd: 2.7, end: 3.2, note: 'gone' },
        { index: 3, do: 'focus', start: 3.2, actionEnd: 3.2, end: 4.7, note: '' },
      ],
    });
    const [step] = normalizeRecipe(recipe).steps;
    assert.deepEqual([stepDuration(step), stepHold(step)], [0.2, 0]);
  });

  it('every time is a whole number of frames, at any rate', () => {
    const steps = STEP_KINDS.flatMap((kind) => [
      { do: kind.do, target: 'a', text: 'some words' },
      { do: kind.do, duration: 0.333, hold: 0.117, text: 'x' },
      { do: kind.do, duration: 1 / 3, hold: Math.PI / 10, speed: 9, text: 'abc' },
    ]);
    const recipe = { url: URL_OK, lead: 0.61, tail: 0.97, steps };
    for (const fps of [...RATES, 23.976, 29.97, 12, 120]) {
      const score = compileScore(recipe, fps);
      assert.equal(score.fps, fps);
      assert.ok(Number.isInteger(score.frames));
      assert.ok(Math.abs(score.duration - score.frames / fps) < 1e-12);
      let at = Math.round(0.61 * fps) / fps;
      for (const step of score.steps) {
        for (const time of [step.start, step.actionEnd, step.end]) {
          assert.ok(onGrid(time, fps), `${step.do} ${time} at ${fps}`);
        }
        assert.ok(Math.abs(step.start - at) < 1e-9, 'steps follow one another');
        assert.ok(step.actionEnd >= step.start && step.end >= step.actionEnd);
        at = step.end;
      }
      assert.ok(onGrid(score.duration - at, fps));
      assert.equal(Math.round((score.duration - at) * fps), Math.round(0.97 * fps));
    }
  });

  it('rounds each part by itself: equal steps take equal frames', () => {
    const recipe = { url: URL_OK, steps: Array(40).fill({ do: 'move', target: 'a' }) };
    for (const fps of RATES) {
      const lengths = compileScore(recipe, fps).steps.map((step) =>
        Math.round((step.end - step.start) * fps),
      );
      assert.equal(new Set(lengths).size, 1, `at ${fps} fps`);
      assert.equal(lengths[0], Math.round(0.7 * fps) + Math.round(0.2 * fps));
    }
    const byRate = RATES.map((fps) => compileScore(recipe, fps).frames);
    assert.deepEqual(
      byRate,
      [24 * 1.6 + 40 * 22, 40 + 40 * 23, 48 + 40 * 27, 96 + 40 * 54].map(Math.round),
    );
  });

  it('always has at least one frame, and a usable rate', () => {
    const empty = { url: URL_OK, lead: 0, tail: 0 };
    assert.deepEqual(compileScore(empty, 25), { fps: 25, duration: 0.04, frames: 1, steps: [] });
    for (const fps of [0, -30, NaN, Infinity, '30', undefined, null]) {
      assert.equal(compileScore(empty, fps).fps, 30, String(fps));
    }
    assert.equal(compileScore(empty, 1000).fps, 240);
  });

  it('normalises what it is given and does not change it', () => {
    const raw = Object.freeze({
      url: URL_OK,
      steps: Object.freeze([{ do: 'nope' }, { do: 'wait' }]),
    });
    const score = compileScore(raw, 30);
    assert.deepEqual(
      score.steps.map((step) => [step.index, step.do]),
      [[0, 'wait']],
    );
    assert.equal(compileScore(null, 30).frames, 48);
  });
});

describe('stepAt', () => {
  const score = compileScore(
    {
      url: URL_OK,
      lead: 1,
      tail: 1,
      steps: [
        { do: 'click', target: 'a', duration: 1, hold: 0.5 },
        { do: 'run', js: '1', duration: 0, hold: 0 },
        { do: 'goto', url: '/x', duration: 0, hold: 1 },
      ],
    },
    10,
  );
  const [click, , goto] = score.steps;
  const at = (time) => {
    const { step, phase, progress } = stepAt(score, time);
    return [step ? step.index : null, phase, Math.round(progress * 1000) / 1000];
  };

  it('names the phase and how far through it', () => {
    assert.deepEqual(at(0), [null, 'lead', 0]);
    assert.deepEqual(at(0.5), [null, 'lead', 0.5]);
    assert.deepEqual(at(1), [0, 'action', 0]);
    assert.deepEqual(at(1.25), [0, 'action', 0.25]);
    assert.deepEqual(at(2), [0, 'hold', 0]);
    assert.deepEqual(at(2.4), [0, 'hold', 0.8]);
    assert.deepEqual(at(2.5), [2, 'hold', 0], 'a step without action is in its hold at once');
    assert.deepEqual(at(3.4), [2, 'hold', 0.9]);
    assert.deepEqual(at(3.5), [null, 'tail', 0]);
    assert.deepEqual(at(4.5), [null, 'tail', 1]);
    assert.equal(stepAt(score, 1.5).step, click);
    assert.equal(stepAt(score, 3).step, goto);
  });

  it('clamps outside the recording and never lands on a step without length', () => {
    assert.deepEqual(at(-5), [null, 'lead', 0]);
    assert.deepEqual(at(99), [null, 'tail', 1]);
    assert.deepEqual(at(NaN), [null, 'lead', 0]);
    for (let frame = 0; frame <= score.frames; frame++) {
      assert.notEqual(stepAt(score, frame / score.fps).step?.index, 1);
    }
  });

  it('is exact on frame boundaries reached by arithmetic', () => {
    const fine = compileScore(
      { url: URL_OK, steps: Array(30).fill({ do: 'move', target: 'a' }) },
      30,
    );
    for (const step of fine.steps) {
      const startFrame = Math.round(step.start * 30);
      assert.equal(stepAt(fine, startFrame / 30).step, step);
      assert.equal(stepAt(fine, startFrame / 30).phase, 'action');
      assert.equal(stepAt(fine, startFrame * (1 / 30)).step, step);
      assert.equal(stepAt(fine, Math.round(step.actionEnd * 30) / 30).phase, 'hold');
    }
  });

  it('a recipe without steps is all lead', () => {
    const empty = compileScore({ url: URL_OK }, 30);
    assert.deepEqual(stepAt(empty, 0.8), { step: null, phase: 'lead', progress: 0.5 });
    assert.deepEqual(stepAt({ fps: 30, duration: 0, frames: 0, steps: [] }, 1), {
      step: null,
      phase: 'lead',
      progress: 1,
    });
  });
});
