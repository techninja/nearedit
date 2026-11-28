import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileScore, stepKind } from '#utils/web/index.js';
import { WEB_SIZES } from '#utils/webUi/sizes.js';
import { fitHolds } from './holds.js';
import { PACE, paceSteps, readingSeconds } from './pacing.js';
import { SHAPES, SIZE_CHOICES, demoView, frameShape } from './sizes.js';

const STEPS = [
  { do: 'scroll', to: '#features', align: 'start' },
  { do: 'scroll', to: '#pricing', align: 'start' },
  { do: 'click', target: 'text=Yearly', note: 'Two months free when you pay yearly' },
  { do: 'type', target: 'label=Email', text: 'hello@example.com' },
  { do: 'wait', duration: 2 },
  { do: 'press', key: 'Enter' },
];
const sum = (list) => list.reduce((a, b) => a + b, 0);
const frames = (seconds) => Math.round(seconds * 30);
const paced = (options = {}, steps = STEPS) =>
  paceSteps(steps, { fps: 30, pacing: 'medium', ...options });
/** The length the recipe library gives the timed steps. */
const scored = (made, fps = 30) =>
  compileScore({ url: 'https://x.test', lead: made.lead, tail: made.tail, steps: made.steps }, fps);

test('every step takes what its kind takes in the recipe library, scaled by the pacing', () => {
  const medium = paced();
  const [look, move, click, type, wait, press] = medium.steps;
  assert.equal(click.duration, stepKind('click').duration);
  assert.equal(press.hold, stepKind('press').hold);
  assert.equal(move.duration, stepKind('scroll').duration);
  assert.equal(
    move.hold,
    stepKind('scroll').hold,
    'a scroll on the way to a click is not lingered on',
  );
  assert.equal(look.hold, PACE.medium.look, 'a place that was scrolled to is looked at');
  assert.equal(
    medium.lead,
    PACE.medium.look,
    'so is the opening view, when the demo scrolls away from it',
  );
  assert.deepEqual([wait.duration, wait.hold], [2, 0], 'a wait is as long as it says');
  assert.equal(type.speed, 14);
  assert.ok(Math.abs(type.duration - (0.5 + 17 / 14)) < 1 / 30);
  const slow = paced({ pacing: 'slow' });
  const fast = paced({ pacing: 'fast' });
  assert.ok(slow.seconds > medium.seconds && medium.seconds > fast.seconds);
  assert.ok(Math.abs(slow.steps[2].duration - 0.7 * PACE.slow.scale) < 1 / 30);
  assert.deepEqual(
    [slow.steps[3].speed, fast.steps[3].speed],
    [11, 19],
    'typing follows the pacing too',
  );
  assert.equal(fast.steps[4].duration, 2);
  assert.equal(paced({ pacing: 'brisk' }).seconds, medium.seconds, 'an unknown pacing is medium');
  // A demo that starts by acting on the opening view rests less before it.
  assert.ok(paced({}, [STEPS[2]]).lead < medium.lead);
  assert.deepEqual(paced({}, []).steps, []);
});

test('a caption is given the time it takes to read; a step with its own pause keeps it', () => {
  const words = 'Two months free when you pay yearly';
  assert.equal(readingSeconds(words, 'medium'), PACE.medium.base + 7 * PACE.medium.perWord);
  assert.equal(readingSeconds('', 'medium'), 0);
  const click = paced().steps[2];
  assert.ok(click.duration + click.hold >= readingSeconds(words, 'medium'));
  assert.ok(click.hold > stepKind('click').hold);
  const quiet = paced({}, [{ ...STEPS[2], note: '' }]).steps[0];
  assert.equal(quiet.hold, stepKind('click').hold);
  const move = {
    do: 'scroll',
    to: 'text=Yearly',
    align: 'center',
    duration: 0.7,
    hold: 0.1,
    note: words,
  };
  const [first] = paced({}, [move, STEPS[2]]).steps;
  assert.deepEqual([first.duration, first.hold], [0.7, 0.1]);
});

test('all times are whole frames, and the score agrees on the length', () => {
  for (const fps of [24, 25, 30, 60]) {
    for (const pacing of ['slow', 'medium', 'fast']) {
      const made = paceSteps(STEPS, { fps, pacing });
      const score = scored(made, fps);
      assert.ok(Math.abs(score.duration - made.seconds) < 1e-9, `${fps} ${pacing}`);
      for (const step of made.steps) {
        for (const time of [step.duration, step.hold])
          assert.ok(Math.abs(time * fps - Math.round(time * fps)) < 1e-6, `${fps}: ${time}`);
      }
    }
  }
});

test('a target length stretches or trims the pauses — never the actions — to end exactly on it', () => {
  const natural = paced();
  for (const target of [12, 14, 20, 30, 61.5]) {
    const made = paced({ target });
    assert.equal(made.seconds, target, `${target}`);
    assert.equal(scored(made).frames, frames(target));
    made.steps.forEach((step, i) => assert.equal(step.duration, natural.steps[i].duration));
  }
  const long = paced({ target: 60 });
  const short = paced({ target: 12 });
  assert.ok(
    long.steps[0].hold > natural.steps[0].hold && short.steps[0].hold < natural.steps[0].hold,
  );
  assert.ok(long.tail > natural.tail);
  assert.match(long.notes[0], /^To last 60 s every pause was stretched about \d+× — add stops/);
  assert.deepEqual(short.notes, []);
  // What cannot be cut is not cut: the result is longer, and says so.
  const least = paced({ target: 3 });
  assert.ok(least.seconds > 3 && least.seconds < natural.seconds);
  assert.match(
    least.notes[0],
    /^The demo cannot be as short as 3 s: its steps and captions need 10\.\d s/,
  );
  const caption = least.steps[2];
  assert.ok(
    caption.duration + caption.hold >= 0.65 * readingSeconds(STEPS[2].note, 'medium') - 1 / 30,
  );
  assert.equal(paced({ target: 0 }).seconds, natural.seconds);
});

test('frames are shared between pauses in proportion, exactly, above every minimum', () => {
  assert.deepEqual(fitHolds([10, 20, 30], [5, 5, 5], 120), [20, 40, 60]);
  assert.deepEqual(fitHolds([10, 20, 30], [5, 5, 5], 61), [10, 20, 31]);
  assert.deepEqual(
    fitHolds([10, 20, 30], [9, 5, 5], 30),
    [9, 9, 12],
    'a minimum is made up by the others',
  );
  assert.deepEqual(
    fitHolds([10, 20, 30], [5, 5, 5], 10),
    [5, 5, 5],
    'less than the minimums: the minimums',
  );
  for (const total of [16, 17, 45, 59, 301]) {
    const shared = fitHolds([7, 0, 13, 22], [2, 0, 4, 9], total);
    assert.equal(sum(shared), total);
    shared.forEach((count, i) => assert.ok(count >= [2, 0, 4, 9][i]));
  }
});

test('the page takes its size from the frame, or from the size that was chosen', () => {
  assert.deepEqual(
    ['1920x1080', '1080x1920', '1080x1080', '1080x1350', '1440x1080'].map((size) => {
      const [width, height] = size.split('x').map(Number);
      return frameShape({ width, height });
    }),
    ['wide', 'tall', 'square', 'tall', 'wide'],
  );
  const view = (width, height, size = 'auto', look = 'window') =>
    demoView({ width, height }, size, look);
  const wide = view(1920, 1080);
  assert.deepEqual(
    [wide.viewport, wide.scale, wide.cursor.style],
    [{ width: 1280, height: 720 }, 2, 'arrow'],
  );
  assert.match(wide.why, /^a desktop page, 1280 × 720, for a wide frame$/);
  const tall = view(1080, 1920);
  assert.deepEqual(
    [tall.viewport, tall.scale, tall.cursor.style],
    [{ width: 390, height: 844 }, 3, 'dot'],
  );
  assert.deepEqual(view(1080, 1080).viewport, { width: 960, height: 960 });
  assert.deepEqual(Object.keys(SHAPES), ['wide', 'tall', 'square']);
  // Filling the frame, the page takes the frame's own shape: nothing is cut off.
  assert.deepEqual(view(1080, 1920, 'auto', 'full').viewport, { width: 390, height: 694 });
  assert.deepEqual(view(1920, 1080, 'auto', 'full').viewport, { width: 1280, height: 720 });
  assert.deepEqual(view(1440, 1080, 'auto', 'full').viewport, { width: 1280, height: 960 });
  assert.match(view(1080, 1920, 'auto', 'full').why, /the shape of the frame it fills/);
  // A chosen size is the web clip editor's, in either look.
  for (const size of WEB_SIZES) {
    const chosen = view(1920, 1080, size.id, 'full');
    assert.deepEqual(chosen.viewport, { width: size.width, height: size.height });
    assert.equal(chosen.scale, size.scale);
    assert.match(chosen.why, /as chosen$/);
  }
  assert.deepEqual(
    SIZE_CHOICES.map(([value]) => value),
    ['auto', ...WEB_SIZES.map((size) => size.id)],
  );
  assert.deepEqual(view(1920, 1080, 'nonsense').viewport, wide.viewport);
});
