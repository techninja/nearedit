import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSong } from '#utils/music/normalize.js';
import { drumPart } from '#utils/music/theory/beats.js';
import {
  DRUM_NOTES,
  GM_DRUMS,
  PRESET_PROGRAMS,
  parseMidi,
  programPreset,
  songFromMidi,
  songToMidi,
} from './index.js';

describe('songToMidi', () => {
  const SONG = normalizeSong({
    bpm: 96,
    beatsPerBar: 3,
    bars: 4,
    swing: 0.3,
    parts: [
      {
        kind: 'drums',
        name: 'Kit',
        kit: '909',
        steps: 12,
        lanes: {
          kick: 'X.....x.....',
          snare: '....X.......',
          hat: 'x.x.o.x.x.X.',
          cowbell: '...........o',
        },
      },
      {
        kind: 'synth',
        preset: 'acid',
        bars: 2,
        transpose: 2,
        play: [[1, 4]],
        notes: [
          [0, 0.5, 40, 0.9],
          [1.5, 1, 43, 0.5],
          [4, 2, 45, 1],
        ],
      },
      {
        kind: 'synth',
        preset: 'pad',
        bars: 4,
        notes: [
          [0, 12, 60, 0.6],
          [0, 12, 64, 0.6],
        ],
      },
      { kind: 'synth', preset: 'bell', mute: true, notes: [[0, 1, 90, 1]] },
    ],
  });

  it('writes a format 1 file that reads back: tempo, signature, a track per sounding part', () => {
    const midi = parseMidi(songToMidi(SONG));
    assert.deepEqual([midi.format, midi.division, midi.warnings], [1, 480, []]);
    assert.deepEqual(
      midi.tracks.map((t) => t.name),
      ['NearEdit song', 'Kit', 'Acid', 'Pad'],
    );
    assert.deepEqual(midi.tempos, [{ tick: 0, bpm: 96 }]);
    assert.deepEqual(midi.signatures, [{ tick: 0, numerator: 3, denominator: 4 }]);
    const channels = new Set(midi.notes.map((n) => `${n.track}:${n.channel}:${n.program}`));
    assert.deepEqual([...channels].sort(), [
      '1:9:0',
      `2:0:${PRESET_PROGRAMS.acid}`,
      `3:1:${PRESET_PROGRAMS.pad}`,
    ]);
    assert.deepEqual(
      songToMidi(SONG),
      songToMidi(structuredClone(SONG)),
      'the same bytes every time',
    );
  });

  it('comes back as the same song, its loops written out along it', () => {
    const { song, warnings } = songFromMidi(songToMidi(SONG), { kit: '909' });
    assert.deepEqual(warnings, []);
    assert.deepEqual(
      [song.bpm, song.beatsPerBar, song.bars, song.swing],
      [96, 3, 4, 0],
      'swing is not written',
    );
    const [drums, acid, pad] = song.parts;
    assert.deepEqual([drums.kit, drums.steps, drums.bars], ['909', 12, 4]);
    for (const [name, lane] of Object.entries(SONG.parts[0].lanes))
      assert.equal(drums.lanes[name], lane.repeat(4), name);
    assert.equal(acid.preset, 'acid');
    // Transposed by two, from bar 1 on: the two-bar loop once and a half.
    assert.deepEqual(acid.notes, [
      [3, 0.5, 42, 0.8976],
      [4.5, 1, 45, 0.5039],
      [7, 2, 47, 1],
      [9, 0.5, 42, 0.8976],
      [10.5, 1, 45, 0.5039],
    ]);
    assert.deepEqual(pad.notes, [
      [0, 12, 60, 0.5984],
      [0, 12, 64, 0.5984],
    ]);
    assert.deepEqual(
      songFromMidi(songToMidi(song), { kit: '909' }).song,
      song,
      'and from then on exactly',
    );
  });

  it('writes every drum as its General MIDI note and reads each back as itself', () => {
    for (const [drum, note] of Object.entries(DRUM_NOTES)) assert.equal(GM_DRUMS[note], drum, drum);
    for (const preset of Object.keys(PRESET_PROGRAMS))
      assert.equal(programPreset(PRESET_PROGRAMS[preset]).preset, preset);
    const part = drumPart('bossa', { bars: 2, fillEvery: 2 });
    const { song } = songFromMidi(songToMidi({ bars: 2, parts: [part] }), { kit: '808' });
    assert.deepEqual(song.parts[0].lanes, normalizeSong({ parts: [part] }).parts[0].lanes);
    assert.equal(parseMidi(songToMidi({})).notes.length, 0, 'an empty song is an empty file');
    assert.equal(parseMidi(songToMidi(null)).tracks.length, 1);
  });

  it('holds notes inside the song and gives up to fifteen synths a channel each', () => {
    const notes = [[2, 100, 60, 1]];
    const parts = Array.from({ length: 16 }, () => ({ kind: 'synth', preset: 'lead', notes }));
    const midi = parseMidi(songToMidi({ bars: 1, parts }));
    assert.ok(
      midi.notes.every((n) => n.tick + n.ticks <= 4 * 480),
      'no note outlasts the music',
    );
    assert.ok(
      midi.notes.every((n) => n.channel !== 9),
      'no synth lands on the drum channel',
    );
    assert.equal(new Set(midi.notes.map((n) => n.channel)).size, 15);
  });
});
