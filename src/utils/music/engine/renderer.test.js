import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { songSeconds } from '#utils/music/timing.js';
import { seeded } from '#utils/music/theory/random.js';
import { SAMPLE_RATE, createRenderer, renderSong } from './renderer.js';
import { RATE, hash, level, play } from './testkit.js';
import { cents, pitch } from './testkitSpectrum.js';

/** A short song with every kind of thing in it: drums, chords, a mono line, swing, both effects. */
const SONG = {
  bpm: 132,
  bars: 2,
  swing: 0.2,
  tail: 0.6,
  parts: [
    {
      kind: 'drums',
      kit: '909',
      lanes: { kick: 'X...x...X...x.x.', hat: 'x.xxx.x.x.xxx.xx', openHat: '..x.......x.....' },
    },
    {
      kind: 'synth',
      preset: 'pad',
      reverb: 0.5,
      bars: 2,
      notes: [
        [0, 4, 57, 0.7],
        [0, 4, 60, 0.7],
        [4, 4, 55, 0.7],
      ],
    },
    {
      kind: 'synth',
      preset: 'acid',
      delay: 0.4,
      notes: [
        [0, 0.6, 33, 1],
        [0.5, 0.5, 45, 0.6],
        [1.25, 0.5, 36, 0.9],
        [3, 1.2, 31, 1],
      ],
    },
    {
      kind: 'synth',
      preset: 'bell',
      pan: 0.5,
      params: { voices: 2 },
      notes: [
        [0, 1, 81, 0.8],
        [0.5, 1, 84, 0.8],
        [1, 1, 88, 0.8],
        [1.5, 2, 93, 0.8],
      ],
    },
  ],
};

/** The sample a lone rim shot first sounds at. */
function onset(song) {
  return play(song).mono.findIndex((x) => x !== 0);
}
const rim = (lane, more = {}, part = {}) => ({
  bpm: 120,
  bars: 1,
  tail: 0.2,
  ...more,
  parts: [{ kind: 'drums', kit: '909', lanes: { rim: lane }, ...part }],
});

describe('rendering a song', () => {
  it('is as long as the song, to the sample, and ends in silence', () => {
    const renderer = createRenderer(SONG);
    assert.equal(renderer.sampleRate, SAMPLE_RATE);
    assert.equal(renderer.frames, Math.round(songSeconds(SONG) * 48000));
    const samples = renderer.render();
    assert.equal(samples.length, renderer.frames * 2);
    assert.equal(renderer.position, renderer.frames);
    assert.equal(renderer.render(100).length, 0, 'nothing after the end');
    assert.ok(samples instanceof Float32Array && samples.every(Number.isFinite));
    assert.ok(
      samples[samples.length - 1] === 0 && samples[samples.length - 2] === 0,
      'the last frame is silence',
    );
    assert.ok(Math.abs(samples[samples.length - 40]) < 0.01, 'faded, not cut');
    assert.equal(
      renderSong({ bars: 1, tail: 0 }).length,
      2 * 2 * 48000,
      'an empty song is silence of its length',
    );
    assert.equal(level(renderSong({ bars: 1 })).peak, 0);
  });

  it('gives the same samples whatever the chunk sizes', () => {
    const whole = renderSong(SONG);
    const random = seeded(11);
    for (const most of [1, 7, 127, 128, 129, 5000, 48000]) {
      const renderer = createRenderer(SONG);
      const pieces = new Float32Array(whole.length);
      for (let at = 0; at < whole.length; ) {
        // The first run takes the song one frame at a time for a stretch.
        const count = most === 1 && at < 2000 ? 1 : 1 + Math.floor(random() * most);
        const chunk = renderer.render(count);
        pieces.set(chunk, at);
        at += chunk.length;
        assert.ok(chunk.length > 0 || at === whole.length);
      }
      assert.equal(hash(pieces), hash(whole), `chunks of up to ${most} frames`);
    }
  });

  it('gives the same samples in every run, and other samples for another song', () => {
    const first = hash(renderSong(SONG));
    assert.equal(hash(renderSong(structuredClone(SONG))), first);
    assert.equal(hash(createRenderer(SONG).render()), first);
    assert.notEqual(hash(renderSong({ ...SONG, swing: 0.21 })), first);
    assert.notEqual(hash(renderSong({ ...SONG, parts: [...SONG.parts].reverse() })), first);
    const frozen = structuredClone(SONG);
    Object.freeze(frozen.parts);
    assert.equal(hash(renderSong(Object.freeze(frozen))), first, 'the song is not touched');
  });

  it('starts every step on its exact sample', () => {
    // 120 BPM: a sixteenth is 6000 samples.
    for (const step of [0, 1, 5, 12, 15]) {
      assert.equal(onset(rim('.'.repeat(step) + 'X')), step * 6000, `step ${step}`);
    }
    // 97 BPM: a sixteenth is 7422.68… samples; the hit is on the nearest one.
    assert.equal(onset(rim('...X', { bpm: 97 })), Math.round((3 * 15 * 48000) / 97));
    assert.equal(onset(rim('.....X', {}, { steps: 12 })), 5 * 8000, 'a grid of twelve: triplets');
    assert.equal(onset(rim('.'.repeat(31) + 'X', {}, { steps: 32 })), 31 * 3000);
  });

  it('swing moves every second sixteenth late, by its share of a sixteenth, and nothing else', () => {
    for (const swing of [0.1, 0.5, 0.75]) {
      assert.equal(onset(rim('.X', { swing })), Math.round(6000 * (1 + swing)), `swing ${swing}`);
      assert.equal(onset(rim('.......X', { swing })), Math.round(7 * 6000 + 6000 * swing));
      assert.equal(onset(rim('..X', { swing })), 12000, 'eighths stay');
      assert.equal(onset(rim('....X', { swing })), 24000);
    }
    // A thirty-second after a swung sixteenth keeps its place between its neighbours.
    assert.equal(onset(rim('...X', { swing: 0.5 }, { steps: 32 })), 9000 + 1500);
  });

  it('counts bars in beats per bar: three, five, seven', () => {
    for (const beatsPerBar of [3, 5, 7]) {
      const song = rim('X', { beatsPerBar, bars: 3 }, { play: [[2, 3]] });
      assert.equal(createRenderer(song).frames, Math.round((3 * beatsPerBar * 0.5 + 0.2) * 48000));
      assert.equal(onset(song), 2 * beatsPerBar * 24000, `${beatsPerBar} beats: bar three`);
    }
  });

  it('repeats a part that is shorter than the song, and plays it only where it is asked to', () => {
    const hits = (song) => {
      const { mono } = play(song);
      const found = [];
      for (let bar = 0; bar < song.bars; bar++) {
        const from = bar * 2;
        found.push(level(mono, from, from + 0.05).peak > 0.01 ? 'x' : '.');
      }
      return found.join('');
    };
    assert.equal(hits(rim('X', { bars: 6 })), 'xxxxxx');
    assert.equal(
      hits(
        rim(
          'X',
          { bars: 6 },
          {
            play: [
              [1, 3],
              [5, 6],
            ],
          },
        ),
      ),
      '.xx..x',
    );
    assert.equal(hits(rim('X', { bars: 6 }, { bars: 2 })), 'x.x.x.', 'a loop of two bars');
    // The loop starts again in every range: bar 3 plays the loop's first bar.
    assert.equal(
      hits(
        rim(
          'X',
          { bars: 6 },
          {
            bars: 2,
            play: [
              [0, 2],
              [3, 6],
            ],
          },
        ),
      ),
      'x..x.x',
    );
    assert.equal(
      hits(rim('X', { bars: 6 }, { play: [[8, 9]] })),
      '......',
      'a range outside the song',
    );
  });

  it('lets a held note go when the music ends, and the tail is its dying away', () => {
    const held = { kind: 'synth', preset: 'organ', notes: [[2, 64, 60, 1]] };
    const { mono } = play({ bpm: 120, bars: 1, tail: 1, parts: [held] });
    assert.ok(level(mono, 1.5, 1.9).rms > 0.01, 'it sounds to the end of the bar');
    assert.ok(level(mono, 2.3).peak < 1e-4, 'and not through the tail');
  });

  it('renders at other sample rates, in tune', () => {
    for (const sampleRate of [22050, 44100, 96000]) {
      const song = {
        bars: 1,
        tail: 0,
        parts: [{ kind: 'synth', preset: 'sub', notes: [[0, 4, 69, 1]] }],
      };
      const renderer = createRenderer(song, { sampleRate });
      assert.equal(renderer.frames, 2 * sampleRate);
      const samples = renderer.render();
      const mono = Float64Array.from({ length: 2 * RATE }, (_, i) => samples[i * 2] || 0);
      // Read as if it were 48 kHz, a 440 Hz tone appears at 440 × 48000 / rate.
      const wanted = (440 * RATE) / sampleRate;
      assert.ok(Math.abs(cents(pitch(mono, 0.3, wanted), wanted)) < 3, `${sampleRate} Hz`);
    }
    assert.equal(createRenderer({}, { sampleRate: 1 }).sampleRate, 8000);
    assert.equal(createRenderer({}, { sampleRate: NaN }).sampleRate, 48000);
  });
});
