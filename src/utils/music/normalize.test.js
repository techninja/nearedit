import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deepFreeze } from '#utils/edl/testkit.js';
import { SONG_LIMITS, defaultSong, normalizeSong, songSeconds } from './index.js';

describe('normalizeSong', () => {
  it('fills in everything: {} is four empty bars at 120 BPM', () => {
    assert.deepEqual(normalizeSong({}), defaultSong());
    assert.deepEqual(normalizeSong({}), {
      bpm: 120,
      beatsPerBar: 4,
      bars: 4,
      swing: 0,
      key: 'C',
      scale: 'minor',
      tail: 2,
      master: {
        volume: 0.8,
        reverb: { size: 0.5, decay: 0.5 },
        delay: { beats: 0.75, feedback: 0.35 },
      },
      parts: [],
    });
    for (const junk of [null, undefined, 7, 'song', [], () => {}]) {
      assert.deepEqual(normalizeSong(junk), defaultSong());
    }
  });

  it('keeps what is in range and bounds what is not', () => {
    const song = normalizeSong({
      bpm: 96.5,
      beatsPerBar: 3,
      bars: 12,
      swing: 0.3,
      key: 'F#',
      scale: 'dorian',
      tail: 0,
    });
    assert.deepEqual(
      [song.bpm, song.beatsPerBar, song.bars, song.swing, song.key, song.scale, song.tail],
      [96.5, 3, 12, 0.3, 'F#', 'dorian', 0],
    );
    const wild = normalizeSong({
      bpm: 9000,
      beatsPerBar: 1.4,
      bars: -3,
      swing: 2,
      key: 'H',
      scale: 'x',
      tail: 99,
    });
    assert.deepEqual(
      [wild.bpm, wild.beatsPerBar, wild.bars, wild.swing, wild.key, wild.scale, wild.tail],
      [240, 2, 1, 0.75, 'C', 'minor', 30],
    );
    assert.equal(normalizeSong({ bpm: '128' }).bpm, 128, 'numbers may be written as text');
    assert.equal(normalizeSong({ bpm: NaN }).bpm, 120);
    assert.equal(normalizeSong({ beatsPerBar: 6.6 }).beatsPerBar, 7, 'whole numbers are rounded');
    const master = normalizeSong({
      master: { volume: 5, reverb: { size: -1, decay: 0.9 }, delay: { beats: 99, feedback: 1 } },
    }).master;
    assert.deepEqual(master, {
      volume: 1.5,
      reverb: { size: 0, decay: 0.9 },
      delay: { beats: 4, feedback: 0.9 },
    });
  });

  it('reads a key however it is written', () => {
    const key = (value) => normalizeSong({ key: value }).key;
    assert.deepEqual(['c', 'Bb', 'bb', 'A#', 'E♭', 'f♯', 'Cb', 'E#'].map(key), [
      'C',
      'Bb',
      'Bb',
      'A#',
      'Eb',
      'F#',
      'B',
      'F',
    ]);
    assert.deepEqual([7, 'do', '', null].map(key), ['C', 'C', 'C', 'C']);
  });

  it('keeps a song within twenty minutes, tail included', () => {
    const long = normalizeSong({ bpm: 40, beatsPerBar: 12, bars: 512 });
    assert.equal(long.bars, 66, '66 bars of 18 s and a 2 s tail');
    assert.ok(songSeconds(long) <= SONG_LIMITS.seconds);
    assert.ok(
      songSeconds(normalizeSong({ bpm: 40, beatsPerBar: 12, bars: 512, tail: 30 })) <= 1200,
    );
    assert.equal(normalizeSong({ bpm: 240, bars: 512 }).bars, 512, 'fast enough, all 512 fit');
  });

  it('keeps at most 16 parts, drops what is not a part, and gives each an id of its own', () => {
    const lanes = { kick: 'X' };
    const many = normalizeSong({
      parts: Array.from({ length: 40 }, () => ({ kind: 'drums', lanes })),
    });
    assert.equal(many.parts.length, 16);
    const mixed = normalizeSong({
      parts: [null, 'drums', { kind: 'harp' }, { kind: 'drums', lanes }, [], { notes: [] }],
    });
    assert.deepEqual(
      mixed.parts.map((p) => p.kind),
      ['drums', 'synth'],
    );
    const ids = normalizeSong({
      parts: [
        { id: 'a', lanes },
        { id: 'a', lanes },
        { lanes },
        { id: 'p1', lanes },
        { id: 'x y/z!', lanes },
        { id: 9, lanes },
      ],
    }).parts.map((p) => p.id);
    assert.deepEqual(ids, ['a', 'p1', 'p2', 'p3', 'xyz', '9']);
  });

  it('is idempotent and never changes what it is given', () => {
    const raw = deepFreeze({
      bpm: 133.333,
      swing: 0.1,
      parts: [
        {
          kind: 'drums',
          kit: 909,
          steps: '32',
          lanes: { kick: 'X..x|..X.', hh: 'xxxx', oh: '..' },
          play: [
            [4, 8],
            [0, 2],
            [1, 3],
          ],
        },
        {
          preset: 'acid',
          params: { cutoff: '400', glide: 0.07, bogus: 1 },
          notes: [
            [1 / 3, 0.25, 'C2', 0.9],
            [0, 1, 36],
          ],
          transpose: 12.4,
        },
      ],
    });
    const once = normalizeSong(raw);
    assert.deepEqual(normalizeSong(once), once);
    assert.deepEqual(JSON.parse(JSON.stringify(once)), once, 'plain JSON');
    assert.notEqual(normalizeSong(once), once, 'always a new object');
  });
});
