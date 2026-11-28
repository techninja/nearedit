import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSong } from '#utils/music/normalize.js';
import { parseMidi, programPreset, songFromMidi } from './index.js';
import { END, file, tempo, text, track } from './testkit.js';

describe('songFromMidi', () => {
  const drums = [
    [0, 0x99, 36, 120],
    [0, 0x99, 42, 60],
    [120, 0x89, 36, 0],
    [0, 0x89, 42, 0],
    [120, 0x99, 42, 80],
    [240, 0x99, 38, 100],
    [0, 0x99, 81, 90],
    [240, 0x99, 46, 100],
    [1200, 0x89, 46, 0],
    END,
  ];

  it('takes the tempo and the bars from the file, and puts channel 10 on a grid', () => {
    const { song, warnings } = songFromMidi(
      file(1, 480, [track([tempo(96), [0, 0xff, 0x58, 4, 3, 2, 24, 8], END]), track(drums)]),
    );
    assert.deepEqual([song.bpm, song.beatsPerBar, song.bars], [96, 3, 2]);
    assert.deepEqual(
      song.parts.map((p) => [p.kind, p.kit, p.steps, p.bars]),
      [['drums', 'acoustic', 12, 2]],
    );
    // A quarter note is 480 ticks, a step a sixteenth: 120 ticks.
    assert.deepEqual(song.parts[0].lanes, {
      kick: 'X' + '.'.repeat(23),
      snare: '....x' + '.'.repeat(19),
      hat: 'o.x' + '.'.repeat(21),
      openHat: '......x' + '.'.repeat(17),
    });
    assert.deepEqual(warnings, ['Percussion note 81 has no drum in a kit: 1 hits are left out']);
    assert.deepEqual(song, normalizeSong(song), 'a normalised song');
  });

  it('chooses the kit and the grid when told, else the coarsest grid the hits fit', () => {
    const sixteenths = file(0, 480, [
      track([[0, 0x99, 36, 100], [120, 0x89, 36, 0], [0, 0x99, 36, 100], [120, 0x89, 36, 0], END]),
    ]);
    assert.equal(songFromMidi(sixteenths).song.parts[0].steps, 16);
    assert.equal(
      songFromMidi(sixteenths, { steps: 32, kit: '909' }).song.parts[0].lanes.kick.slice(0, 4),
      'x.x.',
    );
    assert.equal(songFromMidi(sixteenths, { kit: '909' }).song.parts[0].kit, '909');
    const triplets = file(0, 480, [
      track([
        [0, 0x99, 42, 100],
        [160, 0x99, 42, 100],
        [160, 0x99, 42, 100],
        [160, 0x89, 42, 0],
        END,
      ]),
    ]);
    assert.equal(songFromMidi(triplets).song.parts[0].steps, 12);
    const fine = file(0, 480, [
      track([[0, 0x99, 42, 100], [60, 0x99, 42, 100], [60, 0x89, 42, 0], END]),
    ]);
    assert.equal(songFromMidi(fine).song.parts[0].steps, 32);
  });

  it('gives every other channel the preset of its instrument family, and says what it leaves out', () => {
    const programs = [
      [0, 'keys'],
      [12, 'bell'],
      [19, 'organ'],
      [25, 'pluck'],
      [33, 'bass'],
      [42, 'strings'],
      [50, 'strings'],
      [61, 'lead'],
      [73, 'lead'],
      [84, 'lead'],
      [90, 'pad'],
      [108, 'pluck'],
      [38, 'bass'],
      [87, 'acid'],
      [81, 'arp'],
      [14, 'bell'],
      [46, 'pluck'],
    ];
    for (const [program, preset] of programs)
      assert.equal(programPreset(program).preset, preset, `program ${program}`);
    assert.deepEqual(programPreset(125), { label: 'Sound effects', preset: '' });
    const midi = file(1, 480, [
      track([
        [0, 0xff, 0x03, 5, ...text('Piano')],
        [0, 0xc0, 0],
        [0, 0x90, 60, 127],
        [960, 0x80, 60, 0],
        END,
      ]),
      track([[0, 0xc1, 124], [0, 0x91, 60, 100], [480, 0x81, 60, 0], END]),
      track([
        [0, 0xc2, 33],
        [0, 0x92, 28, 64],
        [480, 0x82, 28, 0],
        [0, 0xc2, 81],
        [0, 0x92, 40, 64],
        [480, 0x82, 40, 0],
        END,
      ]),
    ]);
    const { song, warnings } = songFromMidi(midi);
    assert.deepEqual(
      song.parts.map((p) => [p.name, p.preset, p.notes]),
      [
        ['Piano', 'keys', [[0, 2, 60, 1]]],
        [
          '',
          'bass',
          [
            [0, 1, 28, 0.5039],
            [1, 1, 40, 0.5039],
          ],
        ],
      ],
    );
    assert.deepEqual(warnings, [
      'Channel 2 plays sound effects, which the synth has no sound for: left out',
      'Channel 3 changes its instrument; the first one (Bass) is used throughout',
    ]);
  });

  it('says so when a file has more than a song holds: tempo changes, parts, bars, notes', () => {
    const changing = file(1, 480, [
      track([
        tempo(300),
        [480, ...tempo(90).slice(1)],
        [0, 0xff, 0x58, 4, 7, 3, 24, 8],
        [480, 0xff, 0x58, 4, 4, 2, 24, 8],
        END,
      ]),
      track([[0, 0x90, 60, 1], [480, 0x80, 60, 0], END]),
    ]);
    const found = songFromMidi(changing);
    assert.equal(found.song.bpm, 240);
    assert.deepEqual(found.warnings, [
      'The tempo changes in the file; a song has one: 300 is used',
      'A tempo of 300 is outside 40..240',
      '7/8 is not a whole number of beats: 4 are used',
      'The time signature changes in the file; a song has one',
    ]);
    const many = file(
      1,
      480,
      Array.from({ length: 20 }, (_, i) =>
        track([
          [0, 0x90 | (i % 9), 60, 100],
          ...(i === 3 ? [[10, 0x93, 62, 100]] : []),
          [480, 0x80 | (i % 9), 60, 0],
          END,
        ]),
      ),
    );
    const kept = songFromMidi(many);
    assert.equal(kept.song.parts.length, 16);
    assert.match(kept.warnings.join(), /20 parts; the 16 with the most notes are kept/);
    const long = file(0, 480, [track([[0, 0x90, 60, 100], [480 * 4 * 600, 0x80, 60, 0], END])]);
    assert.match(songFromMidi(long).warnings.join(), /600 bars long; the first 512 are kept/);
  });

  it('answers an empty song for what is not a MIDI file, and takes a parsed file as well as bytes', () => {
    assert.deepEqual(songFromMidi(new Uint8Array(50)), {
      song: normalizeSong({}),
      warnings: ['This is not a MIDI file'],
    });
    assert.deepEqual(songFromMidi(null).warnings, ['This is not a MIDI file']);
    const bytes = file(0, 480, [track([tempo(77), [0, 0x90, 60, 100], [480, 0x80, 60, 0], END])]);
    assert.deepEqual(songFromMidi(parseMidi(bytes)), songFromMidi(bytes));
    assert.deepEqual(songFromMidi(file(0, 480, [track([END])])).song.parts, []);
  });
});
