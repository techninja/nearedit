import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { noteHz } from './math.js';
import { RATE, db, level, play, solo } from './testkit.js';
import { centroid, cents, partial, pitch, share, spectrum } from './testkitSpectrum.js';

/** A plain sine through an open filter: nothing in it moves fast unless something clicks. */
const SINE = {
  ...{ osc1Wave: 'sine', osc1Level: 1, osc2Level: 0, subLevel: 0, fm: 0, unison: 1, drive: 0 },
  ...{ cutoff: 20000, keyTrack: 0, filterEnv: 0, resonance: 0, lfoPitch: 0, lfoAmp: 0 },
  ...{ attack: 0.005, decay: 0.1, sustain: 1, release: 0.05, velocity: 0, voices: 8, level: 0 },
};
const sine = (notes, params = {}, more = {}) =>
  play(solo('keys', notes, { params: { ...SINE, ...params }, ...more }));

/** Seconds at which a signal's 2 ms level first crosses a share of its steady level. */
function crossing(mono, from, steady, part, falling = false) {
  const window = RATE / 500;
  for (let at = Math.round(from * RATE); at + window < mono.length; at += window / 2) {
    const loud = level(mono, at / RATE, (at + window) / RATE).peak;
    if (falling ? loud < steady * part : loud > steady * part) return at / RATE;
  }
  return NaN;
}

describe('the synth voice', () => {
  it('the envelope takes the times it is given: attack to full, release to −60 dB', () => {
    const sound = sine(
      [[0, 2, 69, 1]],
      { attack: 0.2, sustain: 1, release: 0.6 },
      { song: { tail: 2 } },
    );
    const steady = level(sound.mono, 0.5, 0.9).peak;
    const risen = crossing(sound.mono, 0, steady, 0.95);
    assert.ok(Math.abs(risen - 0.19) < 0.02, `95 % after ${risen} s`);
    assert.ok(
      Math.abs(crossing(sound.mono, 0, steady, 0.5) - 0.1) < 0.01,
      'a straight rise: half way at half time',
    );
    // The key is let go at 1 s; a release of 0.6 s is 20 dB down after a third of it.
    const fallen = crossing(sound.mono, 1, steady, 0.1, true) - 1;
    assert.ok(Math.abs(fallen - 0.2) < 0.02, `20 dB down ${fallen} s after the key`);
    assert.ok(level(sound.mono, 1.65, 1.7).peak < steady / 500, 'and over when the release is');
    assert.equal(level(sound.mono, 2.3).peak, 0, 'then nothing at all');
    const short = sine([[0, 2, 69, 1]], { attack: 0.2, release: 0.1 }, { song: { tail: 2 } });
    assert.ok(level(short.mono, 1.15, 1.2).peak < steady / 500, 'a shorter release ends sooner');
  });

  it('decays to its sustain, and a sustain of nothing frees the voice', () => {
    const sound = sine([[0, 4, 69, 1]], { decay: 0.3, sustain: 0.25 }, { song: { bars: 1 } });
    const ratio = level(sound.mono, 1, 1.2).peak / level(sound.mono, 0.005, 0.02).peak;
    assert.ok(Math.abs(ratio - 0.25) < 0.02, `settles at ${ratio}`);
    const plucked = sine([[0, 4, 69, 1]], { decay: 0.2, sustain: 0 });
    assert.equal(level(plucked.mono, 0.8, 2).peak, 0, 'silent while the key is still down');
  });

  it('notes start and stop without a click', () => {
    // 440 Hz at this level moves at most 0.058 × peak per sample; a click would be a far larger step.
    const sound = sine(Array.from({ length: 16 }, (_, i) => [i / 4, 0.12, 69, 1]));
    const { peak, jump } = level(sound.mono);
    assert.ok(jump < peak * 0.075, `largest step ${jump} at a peak of ${peak}`);
    const cut = sine([[3.5, 4, 69, 1]], {}, { song: { tail: 0.5 } });
    assert.ok(
      level(cut.mono).jump < level(cut.mono).peak * 0.075,
      'nor where the music ends under a held note',
    );
  });

  it('steals the oldest voice when all are busy, without a click, and never plays more', () => {
    const notes = Array.from({ length: 24 }, (_, i) => [i / 8, 3, 57 + (i % 12), 1]);
    const few = sine(notes, { voices: 3, release: 0.5, level: -12 });
    const { peak, jump, finite } = level(few.mono);
    // Twelve semitones up from A3: nothing above 440 Hz, three voices at once.
    assert.ok(finite && jump < peak * 0.075, `largest step ${jump} at a peak of ${peak}`);
    const single = level(sine([[0, 3, 57, 1]], { level: -12 }).mono).peak;
    assert.ok(peak < single * 3.2, 'three voices, never four');
    const many = level(sine(notes, { voices: 12, level: -12 }).mono).peak;
    assert.ok(many > peak * 1.5, 'with more voices more notes ring on');
    const last = partial(spectrum(few.mono, 3.2, 8192), noteHz(68));
    assert.ok(Math.abs(cents(last, noteHz(68))) < 10, 'the newest note is among those that sound');
  });

  it('one voice: overlapping notes slide and do not start again; apart, they do', () => {
    const mono = { voices: 1, glide: 0.2, attack: 0.05, decay: 0.2, sustain: 0.3 };
    const tied = sine(
      [
        [0, 2.5, 57, 1],
        [2, 2, 69, 1],
      ],
      mono,
    );
    const before = pitch(tied.mono, 0.8, 220);
    const during = pitch(tied.mono, 1.03, 300);
    const after = pitch(tied.mono, 1.6, 440);
    assert.ok(
      Math.abs(cents(before, 220)) < 5 && Math.abs(cents(after, 440)) < 5,
      `${before} → ${after}`,
    );
    assert.ok(during > 230 && during < 420, `on its way at ${during} Hz`);
    const level1 = level(tied.mono, 0.9, 1).peak;
    assert.ok(
      Math.abs(level(tied.mono, 1.1, 1.2).peak / level1 - 1) < 0.1,
      'the envelope carries on',
    );
    const apart = sine(
      [
        [0, 1.5, 57, 1],
        [2, 2, 69, 1],
      ],
      mono,
    );
    assert.ok(level(apart.mono, 1.06, 1.12).peak > level1 * 1.8, 'a new note strikes again');
    const jumping = sine(
      [
        [0, 2.5, 57, 1],
        [2, 2, 69, 1],
      ],
      { ...mono, glide: 0 },
    );
    assert.ok(
      Math.abs(cents(pitch(jumping.mono, 1.03, 440), 440)) < 10,
      'without glide it is there at once',
    );
  });

  it('velocity, transpose and level do what they say', () => {
    const at = (velocity, params, more) =>
      level(sine([[0, 2, 69, velocity]], params, more).mono, 0.2, 0.9).peak;
    assert.ok(
      Math.abs(at(0.5, { velocity: 0 }) / at(1, { velocity: 0 }) - 1) < 0.01,
      'no sensitivity',
    );
    assert.ok(db(at(1, { velocity: 1 }) / at(0.5, { velocity: 1 })) > 8, 'full sensitivity');
    assert.ok(Math.abs(db(at(1, { level: -6 }) / at(1, {})) + 6) < 0.1);
    const up = sine([[0, 2, 69, 1]], {}, { transpose: 7 });
    assert.ok(Math.abs(cents(pitch(up.mono, 0.3, noteHz(76)), noteHz(76))) < 3);
  });

  it('the filter: a higher cutoff is brighter, an envelope opens and closes it, keys track', () => {
    const saw = { osc1Wave: 'saw', cutoff: 400, filterDecay: 0.3, filterSustain: 0 };
    /** How much of a low saw's energy lies above 1 kHz. */
    const bright = (params, from = 0.6, note = 45, above = 1000) => {
      const sound = sine([[0, 3, note, 1]], { ...saw, ...params });
      return share(spectrum(sound.mono, from, 4096), above, 24000);
    };
    assert.ok(
      bright({ cutoff: 4000 }) > bright({}) * 20,
      `${bright({ cutoff: 4000 })} against ${bright({})}`,
    );
    const closing = { filterEnv: 4, filterDecay: 0.8 };
    assert.ok(bright(closing, 0.01) > bright(closing, 1.2) * 5, 'bright, then closing');
    assert.ok(
      bright({ filterEnv: -3 }, 0.01) < bright({}, 0.01) / 3,
      'a negative amount closes it first',
    );
    assert.ok(
      bright({ filterType: 'highpass' }) > bright({}) * 20,
      'a high-pass keeps what a low-pass takes',
    );
    assert.ok(bright({ filterType: 'lowpass24' }) < bright({}) / 5, 'the steep one is darker');
    assert.ok(
      bright({ resonance: 0.9, cutoff: 1500 }) > bright({ cutoff: 1500 }) * 2,
      'resonance lifts the cutoff',
    );
    // Two octaves above middle C the cutoff has, with full tracking, moved two octaves too.
    assert.ok(bright({ keyTrack: 1 }, 0.6, 84, 3000) > bright({ keyTrack: 0 }, 0.6, 84, 3000) * 5);
    const sweep = sine([[0, 3, 45, 1]], {
      ...saw,
      cutoff: 200,
      filterEnv: 5,
      filterAttack: 1,
      filterSustain: 1,
    });
    const steps = [0.1, 0.4, 0.7, 1].map((at) => centroid(spectrum(sweep.mono, at, 4096)));
    assert.ok(
      steps[0] < steps[1] && steps[1] < steps[2] && steps[2] < steps[3],
      `opening: ${steps.map(Math.round)}`,
    );
  });

  it('LFO: vibrato moves the pitch, tremolo the level, at its rate', () => {
    const still = sine([[0, 4, 69, 1]], {}, { song: { bars: 1 } });
    const shaken = sine([[0, 4, 69, 1]], { lfoRate: 5, lfoAmp: 0.8 }, { song: { bars: 1 } });
    const dips = [0.1, 0.2, 0.3, 0.4, 0.5].map(
      (at) => level(shaken.mono, at - 0.01, at + 0.01).peak,
    );
    // 5 Hz from the start of the song: lowest at 0.15, 0.35, …; full at 0.05, 0.25, 0.45.
    assert.ok(level(shaken.mono, 0.14, 0.16).peak < level(still.mono, 0.14, 0.16).peak * 0.3);
    assert.ok(
      Math.abs(level(shaken.mono, 0.24, 0.26).peak / level(still.mono, 0.24, 0.26).peak - 1) < 0.05,
    );
    assert.ok(dips.every(Number.isFinite));
    const wide = sine([[0, 4, 69, 1]], { lfoRate: 5, lfoPitch: 1 }, { song: { bars: 1 } });
    const high = pitch(wide.mono, 0.04, 440);
    const low = pitch(wide.mono, 0.14, 440);
    assert.ok(cents(high, 440) > 50 && cents(low, 440) < -50, `${high} and ${low} Hz`);
    const late = sine(
      [[0, 4, 69, 1]],
      { lfoRate: 5, lfoPitch: 1, lfoFade: 2 },
      { song: { bars: 1 } },
    );
    assert.ok(
      Math.abs(cents(pitch(late.mono, 0.04, 440), 440)) < 12,
      'a faded-in vibrato starts still',
    );
  });

  it('unison spreads across the stereo field; spread 0 folds it back', () => {
    const wide = sine([[0, 3, 57, 1]], { osc1Wave: 'saw', unison: 4, detune: 20, spread: 1 });
    const narrow = sine([[0, 3, 57, 1]], { osc1Wave: 'saw', unison: 4, detune: 20, spread: 0 });
    assert.deepEqual(narrow.left, narrow.right);
    assert.notDeepEqual(wide.left, wide.right);
    const side = wide.left.map((x, i) => x - wide.right[i]);
    assert.ok(level(side).rms > level(wide.mono).rms * 0.5, 'the two sides really differ');
    assert.ok(
      Math.abs(db(level(wide.left).rms / level(wide.right).rms)) < 1.5,
      'and are as loud as each other',
    );
    const one = sine([[0, 3, 57, 1]], { osc1Wave: 'saw' });
    assert.ok(
      Math.abs(db(level(wide.left).rms / level(one.left).rms)) < 2.5,
      'four voices are no louder than one',
    );
  });

  it('sub, second oscillator, FM and drive each add what they should', () => {
    const mags = (params) => spectrum(sine([[0, 3, 57, 1]], params).mono, 0.5);
    assert.ok(share(mags({}), 0, 150) < 1e-4);
    assert.ok(share(mags({ subLevel: 1 }), 90, 130) > 0.3, 'a sine at 110 Hz under the 220');
    assert.ok(
      share(mags({ osc2Level: 1, osc2Wave: 'sine', osc2Pitch: 12 }), 400, 480) > 0.3,
      'an octave up',
    );
    assert.ok(
      share(mags({ osc2Wave: 'sine', osc2Pitch: 12, fm: 0.5, filterSustain: 1 }), 400, 5000) > 0.2,
    );
    assert.ok(share(mags({ drive: 1 }), 600, 5000) > 0.01, 'drive bends a sine into odd harmonics');
    assert.ok(share(mags({ osc1Wave: 'noise' }), 5000, 20000) > 0.5);
  });
});
