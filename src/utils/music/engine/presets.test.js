import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '#utils/music/catalog/presets.js';
import { noteHz } from './math.js';
import { db, level, play, solo } from './testkit.js';
import { cents, partial, spectrum } from './testkitSpectrum.js';

/** The note each preset is tried on: basses low, the rest around middle C. */
const noteOf = (preset) => (PRESETS[preset].category === 'bass' ? 40 : 64);
/** No vibrato, no glide, nothing detuned: what is left is the note itself. */
const STEADY = { lfoPitch: 0, glide: 0, detune: 0, osc2Detune: 0 };

describe('every preset', () => {
  for (const name of Object.keys(PRESETS)) {
    it(`${name}: in tune, a sane level, no offset, and silent once it is let go`, () => {
      const note = noteOf(name);
      // Held for a second and a half, then four seconds to die away.
      const sound = play(solo(name, [[0, 3, note, 0.8]], { params: STEADY, song: { tail: 4 } }));
      const all = level(sound.mono);
      assert.ok(all.finite, 'every sample is a number');
      assert.ok(all.peak > 0.02 && all.peak < 0.7, `peak ${all.peak.toFixed(3)}`);
      assert.ok(Math.abs(all.mean) < 1e-3, `no offset (${all.mean})`);
      const loud = db(
        Math.max(...[0, 0.5, 1].map((from) => level(sound.mono, from, from + 0.5).rms)),
      );
      assert.ok(loud > -34 && loud < -12, `its loudest half second is at ${loud.toFixed(1)} dB`);
      const hertz = partial(spectrum(sound.mono, 0.02, 65536), noteHz(note));
      assert.ok(
        Math.abs(cents(hertz, noteHz(note))) < 4,
        `${hertz.toFixed(2)} Hz for note ${note}`,
      );
      assert.equal(level(sound.mono, 5.5).peak, 0, 'silence after the release');
      assert.ok(level(sound.left).peak <= 0.891 && level(sound.right).peak <= 0.891);
    });
  }

  it('each is as loud as the others when played as it is meant to be', () => {
    const chord = [60, 64, 67];
    for (const name of Object.keys(PRESETS)) {
      const chords = ['pad', 'strings', 'organ', 'keys'].includes(name);
      const notes = chords
        ? chord.map((pitch) => [0, 3.5, pitch, 0.8])
        : [0, 1, 2, 3].map((beat) => [beat, 0.9, noteOf(name) + beat * 2, 0.8]);
      const loud = db(level(play(solo(name, notes)).mono, 0, 2).rms);
      assert.ok(loud > -27 && loud < -15, `${name}: ${loud.toFixed(1)} dB`);
    }
  });

  it('presets differ: no two make the same sound', () => {
    const prints = Object.keys(PRESETS).map((name) => {
      const { mono } = play(solo(name, [[0, 1, 57, 0.8]], { params: STEADY }));
      return Array.from(mono.subarray(2000, 2040), (x) => x.toFixed(4)).join();
    });
    assert.equal(new Set(prints).size, prints.length);
  });
});
