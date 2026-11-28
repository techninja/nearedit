import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePart } from './index.js';

const part = (raw, beatsPerBar = 4) => normalizePart(raw, beatsPerBar);

describe('parts', () => {
  it('every part has its mix, its loop and where it plays', () => {
    const drums = part({ kind: 'drums' });
    assert.deepEqual(drums, {
      ...{ id: '', name: '', kind: 'drums', mute: false, volume: 0.8, pan: 0, reverb: 0, delay: 0 },
      ...{ bars: 1, play: [], kit: '808', steps: 16, lanes: {} },
    });
    const synth = part({
      kind: 'synth',
      name: 'Line',
      mute: 'true',
      volume: 9,
      pan: -3,
      reverb: 0.5,
      delay: '0.25',
    });
    assert.deepEqual(synth, {
      ...{
        id: '',
        name: 'Line',
        kind: 'synth',
        mute: true,
        volume: 1.5,
        pan: -1,
        reverb: 0.5,
        delay: 0.25,
      },
      ...{ bars: 1, play: [], preset: 'keys', params: {}, transpose: 0, notes: [] },
    });
    assert.equal(part({ kind: 'synth', name: 'x'.repeat(500) }).name.length, 80);
  });

  it('`play` becomes whole bars, in order, merged where they touch', () => {
    const play = (value) => part({ kind: 'drums', play: value }).play;
    assert.deepEqual(
      play([
        [12, 16],
        [0, 8],
      ]),
      [
        [0, 8],
        [12, 16],
      ],
    );
    assert.deepEqual(
      play([
        [0, 4],
        [2, 6],
        [6, 8],
        [10, 11],
      ]),
      [
        [0, 8],
        [10, 11],
      ],
    );
    assert.deepEqual(play([[3, 3], [5, 2], ['a', 4], [1.4, 2.6], 7, null, [-5, 1]]), [[0, 3]]);
    assert.deepEqual(play('all'), []);
    assert.equal(play(Array.from({ length: 500 }, (_, i) => [i * 2, i * 2 + 1])).length, 64);
  });

  it('a drum part: kit, grid, and lanes exactly as long as the loop', () => {
    const drums = part({
      kind: 'drums',
      kit: 'lofi',
      steps: 8,
      bars: 2,
      lanes: { kick: 'X...x', snare: 'x'.repeat(40), hat: '' },
    });
    assert.equal(drums.lanes.kick, 'X...x...........', 'padded with rests');
    assert.equal(drums.lanes.snare, 'x'.repeat(16), 'cut');
    assert.deepEqual(
      Object.keys(drums.lanes),
      ['kick', 'snare'],
      'a lane without a hit is not kept',
    );
    assert.equal(part({ kind: 'drums', kit: 'tr-707' }).kit, '808');
    assert.equal(part({ kind: 'drums', steps: 10 }).steps, 16);
    assert.equal(part({ kind: 'drums', steps: 24 }).steps, 24);
  });

  it('reads lanes kindly: bar lines, other characters, other names, the loop from the longest', () => {
    const drums = part({
      lanes: {
        Kick: 'X...|x...|X.-.|x_q9',
        HiHat: 'x x x x',
        sd: '....X...',
        cowbell: 5,
        tambourine: 'xxxx',
      },
    });
    assert.equal(drums.kind, 'drums', 'lanes make it a drum part');
    assert.deepEqual(drums.lanes, {
      kick: 'X...x...X...x...',
      snare: '....X...........',
      hat: 'xxxx............',
    });
    assert.equal(drums.bars, 1);
    assert.equal(part({ lanes: { kick: 'x'.repeat(33) } }).bars, 3, 'three bars hold 33 steps');
    assert.equal(
      part({ lanes: { kick: 'x'.repeat(33) }, bars: 1 }).lanes.kick.length,
      16,
      'a loop that is given stands',
    );
    assert.deepEqual(Object.keys(part({ lanes: { shaker: 'x', kick: 'x', ride: 'x' } }).lanes), [
      'kick',
      'ride',
      'shaker',
    ]);
  });

  it('a synth part: preset, only the parameters that differ from it, notes in order', () => {
    const synth = part({
      preset: 'bass',
      params: {
        cutoff: 180,
        resonance: 0.9,
        voices: 3.6,
        osc1Wave: 'square',
        filterType: 'highpass',
        level: 99,
        nope: 1,
      },
      transpose: -60,
      notes: [
        [2, 1, 40, 0.5],
        [0, 0.5, 'A1'],
        { beat: 1, length: 2, pitch: 'Bb2', velocity: 2 },
        [0, 9, 33, 0.1],
      ],
    });
    assert.deepEqual(synth.params, {
      resonance: 0.9,
      voices: 4,
      filterType: 'highpass',
      level: 12,
    });
    assert.equal(synth.transpose, -48);
    assert.deepEqual(
      synth.notes,
      [
        [0, 9, 33, 0.1],
        [1, 2, 46, 1],
        [2, 1, 40, 0.5],
      ],
      'one note per beat and pitch: the longer',
    );
    assert.equal(part({ preset: 'theremin', notes: [] }).preset, 'keys');
  });

  it('drops notes that cannot be played and bounds the rest', () => {
    const notes = (list, more = {}) => part({ kind: 'synth', notes: list, ...more }).notes;
    assert.deepEqual(
      notes([
        [0, 1, 200],
        [0, 1, -1],
        [0, 1, 'X9'],
        [-1, 1, 60],
        ['a', 1, 60],
        [0, 1, 60, 0],
        5,
        null,
        [],
      ]),
      [],
    );
    assert.deepEqual(
      notes([[0.123456789, null, 60.4, 0.33333333]]),
      [[0.123457, 1, 60, 0.3333]],
      'rounded; no length is one beat',
    );
    assert.deepEqual(
      notes([
        [0, 0, 60],
        [1, -4, 60],
      ]),
      [
        [0, 0.01, 60, 0.8],
        [1, 0.01, 60, 0.8],
      ],
      'no velocity is 0.8',
    );
    assert.deepEqual(notes([[0, 1e9, 60, 9]]), [[0, 256, 60, 1]]);
    assert.deepEqual(notes([[5, 1, 60]], { bars: 1 }), [], 'past the end of the loop');
    assert.equal(
      part({
        notes: [
          [0, 1, 60],
          [9, 1, 60],
        ],
      }).bars,
      3,
      'without a loop, as many bars as the notes need',
    );
    assert.equal(part({ notes: [[9, 1, 60]] }, 3).bars, 4);
    assert.equal(notes(Array.from({ length: 9000 }, (_, i) => [i / 100, 0.1, 60])).length, 4000);
  });
});
