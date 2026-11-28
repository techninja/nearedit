import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DRUM_NAMES } from '#utils/music/catalog/drums.js';
import { KITS } from '#utils/music/catalog/kits.js';
import { RATE, db, level, play } from './testkit.js';
import { centroid, share, spectrum } from './testkitSpectrum.js';

/** One drum, hit on the second beat of a bar at 120 BPM (0.5 s in). */
function hit(kit, drum, more = {}) {
  const lanes = { [drum]: '....X...........', ...more.lanes };
  const part = { kind: 'drums', kit, volume: 1, lanes };
  return play({ bpm: 120, bars: 1, tail: 4, master: { volume: 1 }, parts: [part], ...more.song });
}

/** Seconds until a hit has fallen 40 dB under its loudest 10 ms. */
function decay(mono) {
  const window = RATE / 100;
  const loud = [];
  for (let at = RATE / 2; at + window <= mono.length; at += window) {
    loud.push(level(mono, at / RATE, (at + window) / RATE).rms);
  }
  const top = Math.max(...loud);
  return (loud.findLastIndex((value) => value > top / 100) + 1) / 100;
}

/** What each drum of each kit measures: its decay and where its energy sits. */
const measured = {};
for (const kit of Object.keys(KITS)) {
  measured[kit] = {};
  for (const drum of DRUM_NAMES) {
    const sound = hit(kit, drum);
    const mags = spectrum(sound.mono, 0.5, 32768);
    measured[kit][drum] = { sound, decay: decay(sound.mono), bright: centroid(mags), mags };
  }
}

describe('every drum of every kit', () => {
  for (const kit of Object.keys(KITS)) {
    it(`${kit}: thirteen drums that start on their step, ring, and end in silence`, () => {
      assert.deepEqual(Object.keys(KITS[kit].drums), [...DRUM_NAMES]);
      for (const drum of DRUM_NAMES) {
        const { sound, decay: seconds } = measured[kit][drum];
        const all = level(sound.mono);
        assert.ok(all.finite, `${drum}: every sample is a number`);
        assert.ok(all.peak > 0.15 && all.peak < 0.85, `${drum}: peak ${all.peak.toFixed(3)}`);
        assert.ok(Math.abs(all.mean) < 1e-3, `${drum}: no offset (${all.mean})`);
        const first = sound.mono.findIndex((x) => x !== 0);
        assert.ok(first >= RATE / 2, `${drum}: nothing before its step`);
        // A tone starts from nothing and a crushed drum holds its first samples: within a millisecond.
        assert.ok(
          first - RATE / 2 < 48,
          `${drum}: it starts on its step (${first - RATE / 2} samples late)`,
        );
        assert.ok(seconds > 0.015 && seconds < 3, `${drum}: rings for ${seconds} s`);
        assert.equal(level(sound.mono, 5.5).peak, 0, `${drum}: silence once it has rung out`);
      }
    });

    it(`${kit}: a kick that is low, hats and cymbals that are high`, () => {
      const of = (drum) => measured[kit][drum];
      assert.ok(share(of('kick').mags, 0, 120) > 0.8, `kick: ${share(of('kick').mags, 0, 120)}`);
      for (const drum of ['hat', 'openHat', 'shaker']) {
        assert.ok(
          share(of(drum).mags, 5000, 24000) > 0.45,
          `${drum}: ${share(of(drum).mags, 5000, 24000)}`,
        );
      }
      assert.ok(of('hat').decay < of('openHat').decay / 2, 'the closed hat is the short one');
      assert.ok(
        of('tomLow').bright < of('tomMid').bright && of('tomMid').bright < of('tomHigh').bright,
      );
      assert.ok(of('crash').decay > 0.8 && of('snare').bright > of('kick').bright * 10);
    });
  }

  it('the kits differ in character: how long their drums ring and how bright they are', () => {
    const kits = Object.keys(KITS);
    for (let a = 0; a < kits.length; a++) {
      for (let b = a + 1; b < kits.length; b++) {
        const unlike = DRUM_NAMES.filter((drum) => {
          const [x, y] = [measured[kits[a]][drum], measured[kits[b]][drum]];
          const ratio = (p, q) => Math.max(p, q) / Math.min(p, q);
          return ratio(x.decay, y.decay) > 1.2 || ratio(x.bright, y.bright) > 1.2;
        });
        assert.ok(unlike.length >= 9, `${kits[a]} and ${kits[b]} differ in ${unlike.length} drums`);
      }
    }
    assert.ok(measured['808'].kick.decay > measured.acoustic.kick.decay * 2, 'the 808 kick booms');
    assert.ok(measured['909'].hat.bright > measured['808'].hat.bright * 1.3, 'the 909 hat hisses');
    assert.ok(measured.lofi.snare.bright < measured['909'].snare.bright / 2, 'lo-fi is dark');
  });

  it('accents are louder than hits, hits louder than soft ones', () => {
    const peak = (char) =>
      level(hit('909', 'snare', { lanes: { snare: `....${char}` } }).mono).peak;
    assert.ok(peak('X') > peak('x') * 1.3 && peak('x') > peak('o') * 1.8);
    assert.ok(db(peak('X') / peak('o')) < 18, 'but a soft hit is still heard');
  });

  it('a closed hat chokes the open one', () => {
    const open = hit('808', 'openHat');
    const choked = hit('808', 'openHat', { lanes: { hat: '......x.........' } });
    const alone = hit('808', 'hat', { lanes: { hat: '......x.........' } });
    // The closed hat falls a quarter of a second after the open one, at 0.75 s.
    const ringing = level(open.mono, 0.9, 1).rms;
    assert.ok(ringing > 0.0005, `left alone it rings on (${ringing})`);
    const rest = level(choked.mono, 0.9, 1).rms - level(alone.mono, 0.9, 1).rms;
    assert.ok(rest < ringing / 20, 'the closed hat shut it within a tenth of a second');
  });

  it('a drum struck again while it rings starts over without a click', () => {
    const twice = hit('808', 'kick', { lanes: { kick: '....X.X.........' } });
    const once = hit('808', 'kick');
    // The 808 kick is a sine under 130 Hz: nothing in it moves faster than this.
    assert.ok(level(once.mono).jump < 0.05, `one hit: ${level(once.mono).jump}`);
    assert.ok(level(twice.mono).jump < 0.05, `two hits: ${level(twice.mono).jump}`);
    assert.ok(
      level(twice.mono, 0.76, 0.9).rms > level(once.mono, 0.76, 0.9).rms,
      'the second hit is there',
    );
  });

  it('pans its drums across the kit', () => {
    const { left, right } = hit('acoustic', 'tomLow');
    const { left: l2, right: r2 } = hit('acoustic', 'tomHigh');
    assert.ok(level(left).rms > level(right).rms * 1.5 && level(r2).rms > level(l2).rms * 1.5);
    const kick = hit('acoustic', 'kick');
    assert.deepEqual(kick.left, kick.right, 'the kick sits in the middle');
  });
});
