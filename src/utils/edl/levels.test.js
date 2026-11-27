import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './index.js';
import { fadeOutRemaining } from './fadeCurves.js';
import { testClip } from './testkit.js';

const near = (a, b, why = '') => assert.ok(Math.abs(a - b) < 1e-12, `${why} ${a} ≉ ${b}`);
const { acos, cos, PI } = Math;

/** The documented formula of each curve: level of a fade-in at progress p. */
const FORMULA = {
  linear: (p) => p,
  smooth: (p) => (1 - cos(PI * p)) / 2,
  fast: (p) => 1 - (1 - p) ** 2,
  slow: (p) => p ** 2,
  sharp: (p) => acos(1 - 2 * p) / PI,
};
/** FFmpeg `afade` curves (af_afade.c) by the names in the fadeCurves.js table. */
const AFADE = {
  tri: (g) => g,
  hsin: (g) => (1 - cos(g * PI)) / 2,
  ipar: (g) => 1 - (1 - g) * (1 - g),
  qua: (g) => g * g,
  ihsin: (g) => 0.3183098861837907 * acos(1 - 2 * g),
};
const AFADE_IN = { linear: 'tri', smooth: 'hsin', fast: 'ipar', slow: 'qua', sharp: 'ihsin' };
const AFADE_OUT = { linear: 'tri', smooth: 'hsin', fast: 'qua', slow: 'ipar', sharp: 'ihsin' };
const STEPS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

describe('fade curves', () => {
  it('there is a formula for every curve of the schema', () => {
    assert.deepEqual(E.FADE_CURVES, Object.keys(FORMULA));
  });

  it('a fade-in follows the formula; a fade-out is its complement', () => {
    for (const curve of E.FADE_CURVES) {
      for (const p of STEPS) {
        near(E.fadeInLevel(curve, p), FORMULA[curve](p), `${curve} in @${p}`);
        near(E.fadeOutLevel(curve, p), 1 - FORMULA[curve](p), `${curve} out @${p}`);
        near(E.fadeInLevel(curve, p) + E.fadeOutLevel(curve, p), 1, 'equal gain');
      }
      assert.deepEqual([E.fadeInLevel(curve, 0), E.fadeInLevel(curve, 1)], [0, 1], curve);
      assert.deepEqual([E.fadeInLevel(curve, -3), E.fadeInLevel(curve, 7)], [0, 1], 'clamped');
    }
  });

  it('fast changes early, slow late, smooth and sharp are symmetric; unknown is linear', () => {
    assert.ok(E.fadeInLevel('fast', 0.25) > 0.25 && E.fadeInLevel('slow', 0.25) < 0.25);
    assert.ok(E.fadeOutLevel('fast', 0.25) < 0.75, 'a fast fade-out drops early');
    assert.ok(E.fadeInLevel('smooth', 0.25) < 0.25 && E.fadeInLevel('sharp', 0.25) > 0.25);
    near(E.fadeInLevel('smooth', 0.5), 0.5);
    near(E.fadeInLevel('sharp', 0.5), 0.5);
    near(E.fadeInLevel('sharp', E.fadeInLevel('smooth', 0.3)), 0.3, 'sharp undoes smooth');
    assert.equal(E.fadeInLevel('bouncy', 0.3), 0.3);
    assert.equal(E.fadeInLevel(undefined, 0.3), 0.3);
  });

  it('matches the FFmpeg afade curves named in the table (out fades run on time remaining)', () => {
    for (const curve of E.FADE_CURVES) {
      for (const p of STEPS) {
        near(E.fadeInLevel(curve, p), AFADE[AFADE_IN[curve]](p), `${curve} in`);
        near(E.fadeOutLevel(curve, p), AFADE[AFADE_OUT[curve]](1 - p), `${curve} out`);
        near(fadeOutRemaining(curve, 1 - p), E.fadeOutLevel(curve, p));
      }
    }
  });
});

describe('levels', () => {
  const clip = (extra = {}) => testClip('c', 10, 20, { fadeIn: 2, fadeOut: 4, ...extra });
  const track = (clips, volume = 1) => ({ volume, clips });

  it('without curves a fade is the linear ramp it always was, exactly', () => {
    const c = clip();
    assert.deepEqual(
      [9, 10, 10.5, 11, 12, 15, 16, 17, 19, 20, 21].map((t) => E.fadeFactor(c, t)),
      [0, 0, 0.25, 0.5, 1, 1, 1, 0.75, 0.25, 0, 0],
    );
    const legacy = { timelineStart: 0, timelineEnd: 10, fadeIn: 1, fadeOut: 1 };
    // The v2 expressions, bit for bit: sinceStart / fadeIn and untilEnd / fadeOut.
    assert.deepEqual(
      [E.fadeFactor(legacy, 0.1), E.fadeFactor(legacy, 9.9)],
      [(0.1 - 0) / 1, (10 - 9.9) / 1],
    );
    assert.equal(E.fadeFactor({ timelineStart: 0, timelineEnd: 10 }, 5), 1, 'no fades at all');
  });

  it('fadeInCurve and fadeOutCurve shape fadeFactor, videoOpacity and clipGain alike', () => {
    for (const curve of E.FADE_CURVES) {
      const c = clip({ fadeInCurve: curve, fadeOutCurve: curve, volume: 0.5 });
      const lane = track([c], 1.5);
      for (const p of [0, 0.3, 0.8, 1]) {
        const [tin, tout] = [10 + 2 * p, 16 + 4 * p];
        near(E.fadeFactor(c, tin), FORMULA[curve](p), `${curve} in`);
        near(E.fadeFactor(c, tout), 1 - FORMULA[curve](p), `${curve} out`);
        near(E.videoOpacity(lane, c, tin), FORMULA[curve](p));
        near(E.videoOpacity(lane, c, tout), 1 - FORMULA[curve](p));
        near(E.clipGain(lane, c, tin), 0.75 * FORMULA[curve](p));
        near(E.clipGain(lane, c, tout), 0.75 * (1 - FORMULA[curve](p)));
      }
      assert.deepEqual([E.fadeFactor(c, 13), E.videoOpacity(lane, c, 13)], [1, 1]);
    }
    const mixed = clip({ fadeInCurve: 'slow', fadeOutCurve: 'fast' });
    near(E.fadeFactor(mixed, 11), 0.25);
    near(E.fadeFactor(mixed, 18), 0.25, 'fast out: (1 − p)²');
  });

  it('the dissolve rule is unchanged: the outgoing picture stays opaque, sound ramps', () => {
    const a = testClip('a', 0, 10, { fadeOut: 2, fadeOutCurve: 'slow' });
    const b = testClip('b', 8, 20, { fadeIn: 2, fadeInCurve: 'slow' });
    const lane = track([a, b]);
    assert.equal(E.dissolvePartner(lane, a), b);
    assert.equal(E.videoFadeOutWindow(lane, a), null);
    assert.equal(E.videoOpacity(lane, a, 9), 1);
    near(E.videoOpacity(lane, b, 9), 0.25, 'the incoming clip follows its curve');
    near(E.clipGain(lane, a, 9) + E.clipGain(lane, b, 9), 1, 'same curve both sides: equal gain');
    assert.deepEqual(E.videoFadeOutWindow(track([a]), a), { start: 8, end: 10 });
    near(E.videoOpacity(track([a]), a, 9), 0.75, 'alone, it fades to what is behind');
  });

  it('reads resolved clips: a keyframed volume is an envelope, never negative', () => {
    const c = clip({
      keyframes: {
        volume: [
          { t: 0, v: 0, ease: 'linear' },
          { t: 10, v: 2, ease: 'linear' },
        ],
      },
    });
    const lane = track([c], 0.5);
    const gain = (t) => E.clipGain(lane, E.resolveClip(c, t), t);
    assert.deepEqual([gain(12), gain(15), gain(18)], [0.2, 0.5, 0.4]);
    assert.equal(
      E.clipGain(lane, { ...c, volume: -0.3 }, 15),
      0,
      'an overshooting easing cannot invert',
    );
    assert.equal(E.clipGain({}, { timelineStart: 0, timelineEnd: 1 }, 0.5), 1, 'defaults are 1');
  });
});

describe('gainEnvelope', () => {
  const lane = { volume: 0.5 };

  it('samples the gain at even steps from the clip’s start to exactly its end', () => {
    const c = testClip('c', 2, 3, { fadeIn: 0.5, fadeOut: 0.25, fadeInCurve: 'fast', volume: 2 });
    const samples = E.gainEnvelope(lane, c, { step: 0.25 });
    assert.deepEqual(
      samples.map((s) => s.time),
      [2, 2.25, 2.5, 2.75, 3],
    );
    assert.deepEqual(
      samples.map((s) => s.gain),
      [0, 0.75, 1, 1, 0],
    );
    const fine = E.gainEnvelope(lane, c);
    assert.equal(fine.length, 101, 'default step 0.01 s');
    assert.equal(fine[fine.length - 1].time, 3);
    const uneven = E.gainEnvelope(lane, c, { step: 0.3 });
    assert.equal(uneven.length, 5, 'the step shrinks to fit a whole number of steps');
    near(uneven[1].time - uneven[0].time, 0.25);
  });

  it('resolves keyframes itself and can sample a part of the clip', () => {
    const c = testClip('c', 10, 20, {
      sourceIn: 5,
      sourceOut: 15,
      keyframes: {
        volume: [
          { t: 5, v: 0, ease: 'linear' },
          { t: 15, v: 2, ease: 'linear' },
        ],
      },
    });
    assert.deepEqual(
      E.gainEnvelope(lane, c, { step: 5 }).map((s) => [s.time, s.gain]),
      [
        [10, 0],
        [15, 0.5],
        [20, 1],
      ],
    );
    assert.deepEqual(
      E.gainEnvelope(lane, c, { step: 1, from: 14, to: 16 }).map((s) => s.time),
      [14, 15, 16],
    );
    assert.deepEqual(
      E.gainEnvelope(lane, c, { from: 0, to: 12, step: 1 }).map((s) => s.time),
      [10, 11, 12],
    );
    assert.deepEqual(E.gainEnvelope(lane, c, { from: 30, to: 40 }), []);
  });

  it('hasGainEnvelope tells when two linear ramps are not enough', () => {
    const plain = testClip('p', 0, 5, { fadeIn: 1, fadeOut: 1 });
    assert.equal(E.hasGainEnvelope(plain), false);
    assert.equal(E.hasGainEnvelope({ ...plain, fadeInCurve: 'smooth' }), true);
    assert.equal(
      E.hasGainEnvelope({ ...plain, fadeOut: 0, fadeOutCurve: 'smooth' }),
      false,
      'no fade, no curve',
    );
    assert.equal(E.hasGainEnvelope({ ...plain, keyframes: { volume: [{ t: 0, v: 1 }] } }), true);
    assert.equal(
      E.hasGainEnvelope({ ...plain, keyframes: { 'transform.x': [{ t: 0, v: 1 }] } }),
      false,
    );
  });
});
