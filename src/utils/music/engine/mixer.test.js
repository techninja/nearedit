import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DRUM_NAMES } from '#utils/music/catalog/drums.js';
import { PRESETS } from '#utils/music/catalog/presets.js';
import { CEILING } from './limiter.js';
import { RATE, db, level, play, solo } from './testkit.js';
import { share, spectrum } from './testkitSpectrum.js';

/** One rim shot at the start of a bar: a click to listen for in the effects. */
const click = (part = {}, song = {}) => {
  const drums = { kind: 'drums', kit: '808', volume: 1, lanes: { rim: 'X' }, ...part };
  return play({ bpm: 120, bars: 1, tail: 2, master: { volume: 1 }, ...song, parts: [drums] });
};
const tone = (more) => play(solo('sub', [[0, 3, 57, 1]], { params: { drive: 0 }, ...more }));

describe('the mixer', () => {
  it('pan places a part with equal power: all left, all right, anywhere between', () => {
    const centre = tone({});
    const power = (sound) =>
      level(sound.left, 0.3, 1).rms ** 2 + level(sound.right, 0.3, 1).rms ** 2;
    assert.deepEqual(centre.left, centre.right);
    for (const pan of [-1, -0.5, 0.25, 1]) {
      const sound = tone({ pan });
      const [l, r] = [level(sound.left, 0.3, 1).rms, level(sound.right, 0.3, 1).rms];
      const angle = ((pan + 1) * Math.PI) / 4;
      assert.ok(
        Math.abs(r / (l + r) - Math.sin(angle) / (Math.sin(angle) + Math.cos(angle))) < 1e-3,
        `pan ${pan}`,
      );
      assert.ok(Math.abs(power(sound) / power(centre) - 1) < 1e-3, `pan ${pan}: the same power`);
    }
    assert.equal(level(tone({ pan: -1 }).right).peak, 0);
    assert.equal(level(tone({ pan: 1 }).left).peak, 0);
  });

  it('volume scales a part and the master the whole; nothing colours a quiet mix', () => {
    const full = tone({});
    const half = tone({ volume: 0.5 });
    const master = tone({ song: { master: { volume: 0.5 } } });
    for (const at of [3000, 20000, 40000]) {
      assert.ok(Math.abs(half.mono[at] * 2 - full.mono[at]) < 1e-6);
      assert.ok(Math.abs(master.mono[at] * 2 - full.mono[at]) < 1e-6);
    }
    assert.equal(level(tone({ volume: 0 }).mono).peak, 0);
    assert.equal(level(tone({ mute: true }).mono).peak, 0);
    assert.ok(Math.abs(level(full.mono).mean) < 1e-4, 'no offset');
  });

  it('a dry part ends when it ends; the reverb send rings on, longer for a longer decay', () => {
    assert.equal(level(click().mono, 0.5).peak, 0);
    const tail = (decay, size = 0.5) => {
      const sound = click(
        { reverb: 1 },
        { tail: 6, master: { volume: 1, reverb: { size, decay } } },
      );
      return [0.3, 1, 2, 4].map((at) => db(level(sound.mono, at, at + 0.2).rms));
    };
    const [short, long] = [tail(0.2), tail(0.9)];
    assert.ok(short[0] > -70 && long[0] > -70, 'it is there');
    assert.ok(short[1] < long[1] - 15 && short[2] < long[2] - 30, `${short} against ${long}`);
    // Decay 0.9 is 5.8 s to fall 60 dB: about 10 dB a second, and steadily.
    assert.ok(
      Math.abs(long[1] - long[2] - 10.4) < 4 && Math.abs((long[2] - long[3]) / 2 - 10.4) < 4,
      String(long),
    );
    const wet = click({ reverb: 1 }, { tail: 6 });
    assert.ok(
      level(wet.mono, 5.5, 6.9).peak < 1e-5,
      'and at the default it is gone well before the tail is',
    );
    assert.notDeepEqual(wet.left, wet.right, 'in stereo');
  });

  it('the reverb is a wash, not a ring: no frequency of its tail stands out', () => {
    const noise = {
      osc1Wave: 'noise',
      osc1Level: 1,
      cutoff: 20000,
      keyTrack: 0,
      attack: 0.001,
      decay: 0.02,
      sustain: 0,
    };
    const burst = (reverb, master) => {
      const song = { tail: 3, master: { volume: 1, ...master } };
      return play(solo('keys', [[0, 0.05, 60, 1]], { params: noise, reverb, song })).mono;
    };
    // The window is laid so that the burst sits in its middle, where it counts fully.
    const dry = spectrum(burst(0), -0.33, 32768);
    for (const [size, decay] of [
      [0.15, 0.9],
      [0.5, 0.5],
      [1, 0.8],
    ]) {
      const wet = spectrum(burst(1, { reverb: { size, decay } }), 0.6, 32768);
      // What the reverb does to each 100 Hz band between 300 Hz and 4 kHz,
      // against the bands around it. A ringing mode would tower over its neighbours.
      const bands = [];
      for (let hertz = 300; hertz < 4000; hertz += 100) {
        bands.push(share(wet, hertz, hertz + 100) / share(dry, hertz, hertz + 100));
      }
      const stands = bands.map((band, i) => {
        const around = bands.slice(Math.max(0, i - 3), i + 4).sort((a, b) => a - b);
        return db(Math.sqrt(band / around[around.length >> 1]));
      });
      const most = Math.max(...stands);
      assert.ok(
        most < 8,
        `size ${size}, decay ${decay}: a band stands ${most.toFixed(1)} dB above its neighbours`,
      );
    }
  });

  it('the delay echoes in time with the tempo, from side to side, each quieter', () => {
    const song = { master: { volume: 1, delay: { beats: 0.75, feedback: 0.5 } } };
    const sound = click({ delay: 1 }, song);
    const step = 0.75 * 0.5 * RATE;
    const echo = (n, side) => level(side, (n * step - 200) / RATE, (n * step + 1500) / RATE).peak;
    assert.ok(echo(1, sound.left) > echo(1, sound.right) * 2, 'the first on the left');
    assert.ok(echo(2, sound.right) > echo(2, sound.left) * 2, 'the second on the right');
    assert.ok(
      echo(1, sound.left) > echo(2, sound.right) * 1.4 &&
        echo(2, sound.right) > echo(3, sound.left) * 1.4,
    );
    assert.ok(
      level(sound.mono, (step - 2400) / RATE, (step - 300) / RATE).peak < 1e-4,
      'nothing between the echoes',
    );
    const first = sound.left.findIndex((x, i) => i > step - 300 && Math.abs(x) > 1e-4);
    assert.ok(Math.abs(first - step) < 3, `the echo starts ${first - step} samples from its beat`);
    const faster = click({ delay: 1 }, { ...song, bpm: 150 });
    assert.ok(echo(1, faster.left) < 1e-4, 'at another tempo the echoes are elsewhere');
  });

  it('the limiter holds sixteen parts with everything at the maximum under the ceiling', () => {
    const lanes = Object.fromEntries(DRUM_NAMES.map((name) => [name, 'XXXXXXXXXXXXXXXX']));
    const loud = {
      osc1Level: 1,
      osc2Level: 1,
      subLevel: 1,
      unison: 7,
      resonance: 1,
      drive: 1,
      level: 12,
      voices: 16,
    };
    const names = Object.keys(PRESETS);
    const parts = Array.from({ length: 16 }, (_, i) => {
      const mix = { volume: 1.5, reverb: 1, delay: 1, pan: (i % 3) - 1 };
      if (i < 2) return { kind: 'drums', kit: i ? '909' : 'lofi', lanes, ...mix };
      const notes = Array.from({ length: 32 }, (_, n) => [
        n / 8,
        4,
        24 + ((n * 7 + i * 5) % 84),
        1,
      ]);
      return { kind: 'synth', preset: names[i % names.length], params: loud, notes, ...mix };
    });
    const master = {
      volume: 1.5,
      reverb: { size: 1, decay: 1 },
      delay: { beats: 0.0625, feedback: 0.9 },
    };
    const sound = play({ bpm: 240, bars: 2, tail: 1, master, parts });
    for (const side of [sound.left, sound.right]) {
      const { finite, peak } = level(side);
      assert.ok(finite && peak <= CEILING + 1e-6, `peak ${peak}`);
      assert.ok(peak > CEILING * 0.9, 'and it is loud');
      // Flattened tops would be runs of samples stuck at the ceiling.
      let [run, longest] = [0, 0];
      for (const x of side) {
        run = Math.abs(x) > CEILING - 1e-4 ? run + 1 : 0;
        longest = Math.max(longest, run);
      }
      assert.ok(longest < 8, `${longest} samples in a row at the ceiling`);
    }
  });

  it('the limiter leaves a mix alone until it is needed, then turns down smoothly', () => {
    const quiet = play(solo('sub', [[0, 3, 45, 1]], { params: { drive: 0, level: 3 } }));
    const pushed = play(solo('sub', [[0, 3, 45, 1]], { params: { drive: 0, level: 12 } }));
    const ratio = level(pushed.mono, 0.3, 0.6).peak / level(quiet.mono, 0.3, 0.6).peak;
    assert.ok(
      level(quiet.mono).peak < CEILING && ratio < 2.5,
      'limited: not the 2.8 times it asked for',
    );
    assert.ok(level(pushed.mono).peak <= CEILING + 1e-6);
    // A limited sine is still a sine: almost nothing above its third harmonic.
    assert.ok(share(spectrum(pushed.mono, 0.3), 400, 20000) < 2e-3, 'no clipping');
    assert.ok(level(pushed.mono).jump < 0.02, 'and no steps');
  });
});
