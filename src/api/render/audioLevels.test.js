import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { resolveClip } from '#utils/edl/animate.js';
import { FADE_CURVES } from '#utils/edl/defaults.js';
import { clipGain } from '#utils/edl/levels.js';
import { CONTROL_PAD, CONTROL_RATE, controlTrack, hasVolumeKeys } from './audioEnvelope.js';
import { AFADE_IN, AFADE_OUT } from './audioChain.js';
import { buildRenderPlan } from './plan.js';
import { clip as planClip, audio as planAudio, plan, probes } from './planKit.js';
import * as kit from './testkit.js';

const { createClip, createEdl, createTrack } = kit;
const AMP = 0.5;
/** Length of the stretch a level is measured over, seconds: 8 cycles of 1 kHz. */
const WINDOW = 0.008;

/**
 * The level the shared rule gives a clip around a moment: `clipGain` of the
 * resolved clip, averaged over the measuring window.
 * @param {any} track @param {any} clip @param {number} time
 * @returns {number}
 */
function expected(track, clip, time) {
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    const t = time + (WINDOW * (i + 0.5)) / 16;
    sum += clipGain(track, resolveClip(clip, t), t);
  }
  return (AMP * sum) / 16;
}

describe('render: audio follows the shared levels', () => {
  const tmp = kit.scratch();
  const file = (name) => join(tmp.dir, name);
  const edl = (...tracks) => createEdl({ resolution: '160x90', fps: 30, tracks });
  const audio = (clips, more = {}) => createTrack('audio', { clips, ...more });
  const tone = (start, end, more = {}) =>
    createClip({
      ...{ sourceFile: file('tone.wav'), sourceIn: 0.25, timelineStart: start, timelineEnd: end },
      ...more,
    });
  /** Measure a mix against the rule at evenly spaced moments. */
  const follows = (samples, track, clip, { from, to, step = 0.02, tolerance = 0.004 }, label) => {
    let worst = 0;
    for (let t = from; t <= to - WINDOW; t += step) {
      const level = kit.tone(samples, 1000, t, t + WINDOW);
      const want = expected(track, clip, t);
      worst = Math.max(worst, Math.abs(level - want));
      const message = `${label} at ${t.toFixed(3)}s: got ${level.toFixed(4)}, rule ${want.toFixed(4)}`;
      assert.ok(Math.abs(level - want) <= tolerance, message);
    }
    return worst;
  };

  before(async () => {
    await kit.generate(file('tone.wav'), [`aevalsrc=${AMP}*sin(2*PI*1000*t):s=48000:d=6`]);
  });
  after(() => tmp.cleanup());

  it('maps every fade curve onto the afade curve with the same formula', async () => {
    for (const curve of FADE_CURVES) {
      const clip = tone(0, 3, { fadeIn: 1, fadeOut: 1.2, fadeInCurve: curve, fadeOutCurve: curve });
      const track = audio([clip], { volume: 0.8 });
      const { left, right } = await kit.mixdown(edl(track), tmp.dir);
      follows(left, track, clip, { from: 0, to: 3 }, `${curve} fades`);
      follows(right, track, clip, { from: 0, to: 3, step: 0.11 }, `${curve} fades, right`);
    }
    const mixed = tone(0, 2, {
      fadeIn: 0.8,
      fadeOut: 0.8,
      fadeInCurve: 'fast',
      fadeOutCurve: 'slow',
    });
    const track = audio([mixed]);
    const { left } = await kit.mixdown(edl(track), tmp.dir);
    follows(left, track, mixed, { from: 0, to: 2 }, 'fast in, slow out');
  });

  it('names the afade curves in the graph, and only where a fade is curved', () => {
    const fades = { fadeIn: 1, fadeOut: 1, fadeInCurve: 'fast', fadeOutCurve: 'fast' };
    const graph = plan([planAudio([planClip('/m/voice.wav', 0, 4, fades)])]).filterComplex;
    assert.match(graph, /afade=t=in:st=0:d=1:curve=ipar,afade=t=out:st=3:d=1:curve=qua/);
    const linear = { fadeIn: 1, fadeOut: 1 };
    const plain = plan([planAudio([planClip('/m/voice.wav', 0, 4, linear)])]).filterComplex;
    assert.match(plain, /afade=t=in:st=0:d=1,afade=t=out:st=3:d=1,apad/);
    assert.deepEqual(Object.keys(AFADE_IN), FADE_CURVES);
    assert.deepEqual(Object.keys(AFADE_OUT), FADE_CURVES);
  });

  it('plays a keyframed volume as an envelope, fades and track volume included', async () => {
    const keys = [
      { t: 0.25, v: 1, ease: 'linear' },
      { t: 1.25, v: 0.2, ease: 'ease-in-out' },
      { t: 2.25, v: 1.6, ease: 'hold' },
      { t: 3.0, v: 0.5, ease: 'bounce-out' },
      { t: 4.25, v: 1, ease: 'linear' },
    ];
    const clip = tone(0.5, 4.5, {
      ...{ volume: 0.3, fadeIn: 0.4, fadeOut: 0.6, fadeInCurve: 'smooth', fadeOutCurve: 'sharp' },
      keyframes: { volume: keys },
    });
    const track = audio([clip], { volume: 0.5 });
    const { left, right } = await kit.mixdown(edl(track), tmp.dir);
    assert.equal(left.length, 4.5 * kit.RATE, 'the mix has the exact length');
    assert.ok(kit.tone(left, 1000, 0.1, 0.4) < 0.001, 'silent before the clip');
    // Around the "hold" step the level jumps: measure up to it and after it.
    const step = 0.5 + (3.0 - 0.25);
    const before = follows(left, track, clip, { from: 0.5, to: step - 0.012 }, 'envelope');
    const after = follows(left, track, clip, { from: step + 0.012, to: 4.5 }, 'envelope');
    follows(right, track, clip, { from: 0.5, to: step - 0.012, step: 0.13 }, 'envelope, right');
    assert.ok(Math.max(before, after) < 0.004);
    const low = kit.tone(left, 1000, 0.5 + 1.0 - WINDOW / 2, 0.5 + 1.0 + WINDOW / 2);
    assert.ok(Math.abs(low - AMP * 0.5 * 0.2) < 0.002, `the key at 0.2 is reached: ${low}`);
  });

  it('picks an envelope up part-way in a range render and across a cross-fade', async () => {
    const duck = [
      { t: 0.25, v: 1, ease: 'linear' },
      { t: 2.25, v: 0.1, ease: 'linear' },
    ];
    const first = tone(0, 2.5, { fadeOut: 0.5, keyframes: { volume: duck } });
    const second = tone(2, 4, { fadeIn: 0.5, fadeInCurve: 'smooth' });
    const track = audio([first, second]);
    const document = edl(track);
    const whole = await kit.mixdown(document, tmp.dir);
    follows(whole.left, track, first, { from: 0, to: 1.95 }, 'ducked clip');
    follows(whole.left, track, second, { from: 2.55, to: 4 }, 'clip after the cross-fade');
    const part = await kit.render(document, tmp.dir, {
      preset: 'draft',
      range: { start: 1, end: 3 },
    });
    const heard = await kit.readAudio(part.output);
    for (const t of [1.1, 1.5, 1.9]) {
      const level = kit.tone(heard.left, 1000, t - 1, t - 1 + 0.05);
      const want = expected(track, first, t + 0.021);
      assert.ok(Math.abs(level - want) < 0.02, `range render at ${t}s: ${level} vs ${want}`);
    }
  });

  it('writes the envelope as a small control track and leaves plain clips alone', () => {
    const keyed = planClip('/m/music.mp3', 0, 10, {
      keyframes: {
        volume: [
          { t: 0, v: 0 },
          { t: 10, v: 2 },
        ],
      },
    });
    assert.ok(hasVolumeKeys(keyed) && !hasVolumeKeys(planClip('/m/music.mp3', 0, 1)));
    const track = planAudio([keyed, planClip('/m/voice.wav', 10, 12, { volume: 0.5 })]);
    const control = controlTrack(track, keyed, 2, 4);
    assert.equal(control.length, 2 * CONTROL_RATE + 1 + 2 * CONTROL_PAD);
    assert.ok(
      Math.abs(control[CONTROL_PAD] - 0.4) < 1e-6,
      'starts at the gain of its first moment',
    );
    assert.ok(Math.abs(control[CONTROL_PAD + CONTROL_RATE] - 0.6) < 1e-6);
    assert.equal(control[0], control[CONTROL_PAD], 'padded with its first value');
    assert.ok(Math.abs(control.at(-1) - 0.8) < 1e-6, 'padded with its last value');
    const built = buildRenderPlan(createEdl({ tracks: [track] }), { probes, workDir: '/w' });
    const envelopes = built.inputs.filter((input) => input.kind === 'envelope');
    assert.equal(envelopes.length, 1);
    assert.deepEqual(envelopes[0].args.slice(0, 6), ['-f', 'f32le', '-ar', '2400', '-ac', '1']);
    const file = built.files.find((f) => f.path === envelopes[0].file);
    assert.equal(file.content.length, (10 * CONTROL_RATE + 1 + 2 * CONTROL_PAD) * 4);
    assert.match(built.filterComplex, /\[s0\]\[g0\]amultiply,apad=whole_len=480000\[a0\]/);
    assert.match(
      built.filterComplex,
      /volume=volume=0\.5,apad/,
      'the plain clip keeps its filters',
    );
    assert.ok(!/\[a0\].*afade/.test(built.filterComplex.split(';\n')[2]));
  });
});
