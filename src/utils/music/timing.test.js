import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  barTimes,
  beatSeconds,
  beatTimes,
  loopEvents,
  musicSeconds,
  normalizeSong,
  playRanges,
  songFrame,
  songSeconds,
  stepTimes,
  swingBeat,
  unrollPart,
} from './index.js';

const near = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} ${actual} ≠ ${expected}`);

describe('how long a song is', () => {
  it('bars × beats × 60 / bpm, and the tail', () => {
    assert.equal(musicSeconds({}), 8);
    assert.equal(songSeconds({}), 10);
    assert.equal(
      songSeconds({ bpm: 90, beatsPerBar: 3, bars: 16, tail: 0.5 }),
      (16 * 3 * 60) / 90 + 0.5,
    );
    assert.equal(songSeconds({ bpm: 60, bars: 1, tail: 0 }), 4);
  });

  it('reads a song that was never normalised through the same bounds', () => {
    assert.equal(songSeconds(null), 10);
    assert.equal(songSeconds({ bpm: 'x', bars: -4, tail: 1e9 }), 2 + 30);
    assert.deepEqual(songFrame({ bpm: 1000, beatsPerBar: 99, bars: 2.4, swing: 9 }), {
      bpm: 240,
      beatsPerBar: 12,
      bars: 2,
      swing: 0.75,
      tail: 2,
    });
    assert.ok(songSeconds({ bpm: 40, beatsPerBar: 12, bars: 512, tail: 30 }) <= 1200);
    for (const song of [
      { bpm: 77, bars: 9 },
      { bpm: 40, beatsPerBar: 12, bars: 512 },
    ]) {
      assert.equal(songSeconds(song), songSeconds(normalizeSong(song)));
    }
  });
});

describe('where beats, bars and steps fall', () => {
  it('bar lines and beats, the end of the music included', () => {
    assert.deepEqual(barTimes({ bars: 2 }), [0, 2, 4]);
    assert.deepEqual(beatTimes({ bars: 1 }), [0, 0.5, 1, 1.5, 2]);
    assert.deepEqual(barTimes({ bpm: 90, beatsPerBar: 3, bars: 2 }), [0, 2, 4]);
    assert.equal(beatTimes({ bpm: 90, beatsPerBar: 7, bars: 3 }).length, 22);
    assert.deepEqual(barTimes({ swing: 0.5, bars: 1 }), [0, 2], 'swing never moves a beat');
  });

  it('steps of a grid: straight without swing', () => {
    assert.deepEqual(stepTimes({ bars: 1 }, 8), [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]);
    assert.equal(stepTimes({ bars: 2 }).length, 32, 'sixteen to the bar by default');
    stepTimes({ bars: 1, beatsPerBar: 3, bpm: 60 }, 12).forEach((time, step) =>
      near(time, step * 0.25),
    );
  });

  it('swing: the sixteenth inside every eighth falls late by its share of a sixteenth', () => {
    near(swingBeat(0.25, 0.5), 0.375);
    near(swingBeat(0.75, 0.5), 0.875);
    near(swingBeat(3.25, 0.2), 3.3);
    for (const beat of [0, 0.5, 1, 1.5, 7, 7.5])
      assert.equal(swingBeat(beat, 0.6), beat, 'eighths stay');
    assert.equal(swingBeat(0.25, 0), 0.25);
    assert.equal(swingBeat(0.25, -1), 0.25);
    const steps = stepTimes({ bars: 1, swing: 0.5 });
    // At 120 BPM a sixteenth is 0.125 s: odd steps are 0.0625 s late.
    steps.forEach((time, step) =>
      near(time, step * 0.125 + (step % 2 ? 0.0625 : 0), `step ${step}`),
    );
    near(beatSeconds({ bpm: 60, swing: 0.5 }, 0.25), 0.375);
  });

  it('swing keeps everything in order, on every grid, at its strongest', () => {
    for (const steps of [8, 12, 16, 24, 32]) {
      const times = stepTimes({ bars: 2, swing: 0.75, beatsPerBar: 5 }, steps);
      for (let i = 1; i < times.length; i++)
        assert.ok(times[i] > times[i - 1], `${steps} steps, step ${i}`);
      assert.ok(times[times.length - 1] < musicSeconds({ bars: 2, beatsPerBar: 5 }));
    }
    // Thirty-seconds keep their place between the sixteenths around them.
    const fine = stepTimes({ bars: 1, swing: 0.5 }, 32);
    near(fine[1], 0.0625 * 1.5);
    near(fine[3], 0.1875 + 0.0625 * 0.5);
  });
});

describe('where a part plays', () => {
  const song = normalizeSong({
    bars: 6,
    parts: [
      { kind: 'drums', lanes: { kick: 'X.......x.......', snare: '....X...' } },
      {
        kind: 'synth',
        bars: 2,
        play: [
          [1, 4],
          [5, 9],
        ],
        notes: [
          [0, 1, 60, 1],
          [6, 4, 67, 0.5],
        ],
      },
    ],
  });

  it('everywhere, or in its ranges, cut to the song', () => {
    assert.deepEqual(playRanges(song, song.parts[0]), [[0, 6]]);
    assert.deepEqual(playRanges(song, song.parts[1]), [
      [1, 4],
      [5, 6],
    ]);
    assert.deepEqual(
      playRanges(song, { play: [[7, 9]] }),
      [],
      'a range outside the song plays nothing',
    );
    assert.deepEqual(playRanges({ bars: 2 }, null), [[0, 2]]);
  });

  it('its loop as events, in order of beat', () => {
    assert.deepEqual(loopEvents(song, song.parts[0]), [
      [0, 0, 1],
      [1, 1, 1],
      [2, 0, 0.75],
    ]);
    assert.deepEqual(loopEvents(song, song.parts[1]), [
      [0, 60, 1, 1],
      [6, 67, 0.5, 4],
    ]);
  });

  it('written out along the song: the loop repeats, and starts again in every range', () => {
    const kicks = unrollPart(song, song.parts[0])
      .filter((event) => event[1] === 0)
      .map((event) => event[0]);
    assert.deepEqual(kicks, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
    const notes = unrollPart(song, song.parts[1]).map(([beat, pitch]) => [beat, pitch]);
    // Bars 1–3: the two-bar loop once and a half; bar 5: its first bar again.
    assert.deepEqual(notes, [
      [4, 60],
      [10, 67],
      [12, 60],
      [20, 60],
    ]);
    assert.equal(unrollPart(song, song.parts[0], 5).length, 5, 'cut where it is told to');
  });
});
