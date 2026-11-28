import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EASINGS,
  GLIDE_ARC,
  GLIDE_ARC_MAX,
  PRESS_SECONDS,
  compileScore,
  glide,
  normalizeStep,
  scrollAt,
  scrollGoal,
  stepDuration,
  typedLength,
  typedText,
} from './index.js';

const A = { x: 100, y: 500 };
const B = { x: 900, y: 140 };
const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

/** Distance of a point from the straight line through two others, signed. */
function offLine(point, from, to) {
  const length = distance(from, to);
  return ((to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x)) / length;
}

describe('glide', () => {
  it('is exactly the start at 0 and exactly the end at 1, with every easing', () => {
    const odd = { x: 0.1 + 0.2, y: -1 / 3 };
    for (const ease of [...EASINGS, undefined, '', 'no-such-easing']) {
      assert.deepEqual(glide(A, odd, 0, ease), A, String(ease));
      assert.deepEqual(glide(A, odd, 1, ease), odd, String(ease));
      assert.deepEqual(glide(A, odd, -3, ease), A);
      assert.deepEqual(glide(A, odd, 7, ease), odd);
      assert.deepEqual(glide(A, odd, NaN, ease), A);
    }
    assert.notEqual(glide(A, B, 0), A, 'a new object every time');
  });

  it('is deterministic', () => {
    for (let i = 0; i <= 100; i++) {
      assert.deepEqual(glide(A, B, i / 100), glide({ ...A }, { ...B }, i / 100));
    }
  });

  it('moves without jumps and arrives smoothly', () => {
    const steps = 600;
    const length = distance(A, B);
    for (const ease of EASINGS.filter((name) => name !== 'hold')) {
      let previous = glide(A, B, 0, ease);
      let longest = 0;
      for (let i = 1; i <= steps; i++) {
        const point = glide(A, B, i / steps, ease);
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
        longest = Math.max(longest, distance(previous, point));
        previous = point;
      }
      // No easing covers more than a small part of the way in 1/600 of the time.
      assert.ok(longest < length * 0.03, `${ease} jumps ${longest}`);
    }
    const nearly = glide(A, B, 0.9999);
    assert.ok(distance(nearly, B) < 0.01);
  });

  it('eases in and out by default', () => {
    const at = (p) => distance(glide(A, B, p), A) / distance(A, B);
    assert.ok(at(0.1) < 0.02 && at(0.9) > 0.98);
    assert.ok(Math.abs(at(0.5) - Math.hypot(0.5, GLIDE_ARC_MAX / distance(A, B))) < 1e-9);
    assert.deepEqual(glide(A, B, 0.3), glide(A, B, 0.3, 'ease-in-out'));
    const linear = glide({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.25, 'linear');
    assert.ok(Math.abs(linear.x - 2.5) < 1e-12);
  });

  it('bows away from the straight line by a share of the distance, to the upper side', () => {
    const short = glide({ x: 0, y: 0 }, { x: 200, y: 0 }, 0.5);
    assert.ok(Math.abs(short.x - 100) < 1e-9);
    assert.ok(Math.abs(short.y - -GLIDE_ARC * 200) < 1e-9, 'a move to the right bows upwards');
    const back = glide({ x: 200, y: 0 }, { x: 0, y: 0 }, 0.5);
    assert.ok(Math.abs(back.y - -GLIDE_ARC * 200) < 1e-9, 'so does a move to the left');
    const long = glide({ x: 0, y: 0 }, { x: 3000, y: 0 }, 0.5);
    assert.ok(Math.abs(long.y - -GLIDE_ARC_MAX) < 1e-9, 'a long move bows no more than the cap');
    for (const to of [B, { x: 100, y: 0 }, { x: 0, y: 900 }, { x: -300, y: 420 }]) {
      let widest = 0;
      for (let i = 1; i < 50; i++) {
        const off = offLine(glide(A, to, i / 50), A, to);
        widest = Math.max(widest, Math.abs(off));
        assert.ok(Math.abs(off) <= Math.min(GLIDE_ARC * distance(A, to), GLIDE_ARC_MAX) + 1e-9);
      }
      assert.ok(widest > 0.9 * Math.min(GLIDE_ARC * distance(A, to), GLIDE_ARC_MAX));
    }
    assert.ok(glide({ x: 0, y: 0 }, { x: 0, y: 300 }, 0.5).x > 0, 'straight down bows right');
    assert.ok(glide({ x: 0, y: 300 }, { x: 0, y: 0 }, 0.5).x < 0, 'straight up bows left');
  });

  it('stays put when there is nowhere to go', () => {
    for (const p of [0, 0.3, 1]) assert.deepEqual(glide(A, { ...A }, p), A);
  });
});

describe('scrollAt', () => {
  it('is exact at both ends and eased between', () => {
    for (const ease of [...EASINGS, undefined]) {
      assert.equal(scrollAt(0.1, 1234.5, 0, ease), 0.1);
      assert.equal(scrollAt(0.1, 1234.5, 1, ease), 1234.5);
    }
    assert.equal(scrollAt(0, 1000, 0.5), 500);
    assert.equal(scrollAt(0, 1000, 0.5, 'linear'), 500);
    assert.equal(scrollAt(1000, 0, 0.25, 'linear'), 750);
    assert.ok(scrollAt(0, 1000, 0.1) < 10 && scrollAt(0, 1000, 0.9) > 990);
    assert.equal(scrollAt(300, 300, 0.4), 300);
  });

  it('moves without jumps, one way only', () => {
    let previous = 0;
    for (let i = 1; i <= 300; i++) {
      const y = scrollAt(0, 3000, i / 300);
      assert.ok(y >= previous && y - previous < 3000 * 0.02);
      previous = y;
    }
  });
});

describe('scrollGoal', () => {
  const goal = (step) => scrollGoal(normalizeStep({ do: 'scroll', ...step }));
  it('reads where a scroll step is headed', () => {
    assert.deepEqual(goal({ to: 'top' }), { to: 'top' });
    assert.deepEqual(goal({ to: 'bottom' }), { to: 'bottom' });
    assert.deepEqual(goal({ to: 1200 }), { y: 1200 });
    assert.deepEqual(goal({ to: '#pricing' }), { target: { by: 'css', value: '#pricing' } });
    assert.deepEqual(goal({ to: 'text=Pricing', by: 300 }), {
      target: { by: 'text', value: 'Pricing' },
    });
    assert.deepEqual(goal({ by: -300 }), { by: -300 });
    assert.equal(goal({}), null);
    assert.equal(goal({ to: 'text=' }), null);
  });
});

describe('typedLength', () => {
  const step = (fields) => normalizeStep({ do: 'type', ...fields });

  it('types at an even pace and finishes exactly at the end of the action', () => {
    const plain = step({ text: 'fourteen chars' });
    assert.equal(stepDuration(plain), 1);
    assert.equal(typedLength(plain, 0), 0);
    assert.equal(typedLength(plain, 1 / 14 - 0.001), 0);
    assert.equal(typedLength(plain, 1 / 14), 1);
    assert.equal(typedLength(plain, 0.5), 7);
    assert.equal(typedLength(plain, 1 - 0.001), 13);
    assert.equal(typedLength(plain, 1), 14);
    assert.equal(typedLength(plain, 50), 14);
    assert.equal(typedLength(plain, -1), 0);
    assert.equal(typedLength(plain, NaN), 0);
  });

  it('types nothing while the cursor travels to the target', () => {
    const aimed = step({ text: 'fourteen chars', target: 'label=Email' });
    assert.equal(stepDuration(aimed), 1.5);
    for (const elapsed of [0, 0.25, 0.5]) assert.equal(typedLength(aimed, elapsed), 0);
    assert.equal(typedLength(aimed, 0.5 + 1 / 14), 1);
    assert.equal(typedLength(aimed, 1), 7);
    assert.equal(typedLength(aimed, 1.5), 14);
  });

  it('never goes backwards and types every character once', () => {
    for (const fields of [
      { text: 'héllo 👋 wörld' },
      { text: 'x'.repeat(333), speed: 37, target: 'a' },
      { text: 'slow', duration: 4, target: 'a' },
    ]) {
      const typed = step(fields);
      const duration = stepDuration(typed);
      const count = Array.from(typed.text).length;
      let previous = 0;
      for (let i = 0; i <= 1000; i++) {
        const now = typedLength(typed, (duration * i) / 1000);
        assert.ok(now >= previous && now - previous <= Math.ceil(count / 100) + 1);
        previous = now;
      }
      assert.equal(previous, count);
    }
  });

  it('follows the whole frames of the score when given the real duration', () => {
    const typed = step({ text: 'eleven char', target: 'a' });
    for (const fps of [24, 25, 30, 60]) {
      const [at] = compileScore({ url: 'https://example.com', lead: 0, steps: [typed] }, fps).steps;
      const real = at.actionEnd - at.start;
      const frames = Math.round(real * fps);
      const perFrame = [];
      for (let frame = 0; frame <= frames; frame++) {
        perFrame.push(typedLength(typed, frame / fps, real));
      }
      assert.equal(perFrame[0], 0);
      assert.equal(perFrame[frames], 11, `all typed on the last frame at ${fps} fps`);
      assert.equal(perFrame[Math.round(0.5 * fps)], 0, 'nothing during the approach');
      assert.ok(perFrame.every((count, i) => i === 0 || count >= perFrame[i - 1]));
    }
  });

  it('a step without duration types everything at once; one without text nothing', () => {
    const instant = step({ text: 'now', duration: 0 });
    assert.equal(typedLength(instant, 0), 3);
    // Shorter than the way to the target: all of it lands at the end.
    const squeezed = step({ text: 'squeezed', duration: 0.3, target: 'a' });
    assert.equal(typedLength(squeezed, 0.29), 0);
    assert.equal(typedLength(squeezed, 0.3), 8);
    assert.equal(typedLength(step({ text: '' }), 5), 0);
    assert.equal(typedLength({ do: 'click' }, 5), 0);
  });

  it('typedText cuts between characters, never inside one', () => {
    const emoji = step({ text: '👋🏽a👨‍👩‍👧', speed: 1 });
    assert.equal(typedText(emoji, 1), '👋');
    assert.equal(typedText(emoji, 2), '👋🏽');
    assert.equal(typedText(emoji, 3), '👋🏽a');
    assert.equal(typedText(emoji, 100), '👋🏽a👨‍👩‍👧');
    assert.equal(typedText(step({ text: 'abc' }), 0), '');
  });
});

describe('PRESS_SECONDS', () => {
  it('is how long a button stays down', () => {
    assert.equal(PRESS_SECONDS, 0.12);
  });
});
