import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSong } from '#utils/music/normalize.js';
import { validateSong } from '#utils/music/validate.js';
import {
  ARP_MODES,
  BASS_STYLES,
  BEATS,
  arpeggio,
  bassLine,
  drumPart,
  inScale,
  melody,
  padNotes,
  progression,
  seeded,
} from './index.js';

const CHORDS = progression('A', 'minor', 'i-VI-III-VII');
const classes = (chord) => chord.steps.map((step) => (chord.root + step) % 12);
const pitches = (notes) => notes.map((note) => note[2]);
/** The chord under a beat, four beats to a chord. */
const under = (beat) => CHORDS[Math.floor(beat / 4)];

/** A line is playable: in order, inside its chords, every number in range. */
function assertPlayable(notes, beats = 16) {
  assert.ok(notes.length > 0);
  notes.forEach(([beat, length, pitch, velocity], i) => {
    assert.ok(beat >= 0 && beat < beats && length > 0, `note ${i} at ${beat}`);
    assert.ok(Number.isInteger(pitch) && pitch >= 0 && pitch <= 127);
    assert.ok(velocity > 0 && velocity <= 1);
    assert.ok(i === 0 || beat >= notes[i - 1][0], 'in order');
  });
  const part = { kind: 'synth', bars: beats / 4, notes };
  assert.deepEqual(validateSong({ parts: [part] }).problems, []);
  assert.equal(
    normalizeSong({ parts: [part] }).parts[0].notes.length,
    new Set(notes.map((n) => `${n[0]}:${n[2]}`)).size,
  );
}

describe('seeded randomness', () => {
  it('the same seed gives the same numbers; these numbers are the same in every runtime', () => {
    const random = seeded(42);
    const first = [random(), random(), random()];
    assert.deepEqual(first, [0.4813160905614495, 0.9852536325342953, 0.7379171899519861]);
    assert.notDeepEqual([seeded(43)(), seeded(43)()], first.slice(0, 2));
    assert.ok(Array.from({ length: 1000 }, seeded(1)).every((x) => x >= 0 && x < 1));
    assert.equal(seeded()(), seeded(1)());
    assert.equal(seeded('x')(), seeded(0)(), 'a seed that is not a number is 0');
  });
});

describe('bass lines', () => {
  it('roots: one long note per chord, low', () => {
    const line = bassLine(CHORDS);
    assert.deepEqual(line, [
      [0, 3.8, 45, 0.85],
      [4, 3.8, 41, 0.85],
      [8, 3.8, 36, 0.85],
      [12, 3.8, 43, 0.85],
    ]);
    assert.deepEqual(
      pitches(bassLine(progression('C', 'major', 'C/E F/A'))),
      [40, 45],
      'a slash chord plays its bass',
    );
    assert.equal(
      bassLine(CHORDS, { beats: 8 }).length,
      8,
      'a long chord is struck again every bar',
    );
    assert.deepEqual(pitches(bassLine(CHORDS, { octave: 1 })), [33, 29, 24, 31]);
  });

  it('octaves, walking and syncopated lines stay on their chords where it matters', () => {
    for (const style of BASS_STYLES) {
      const line = bassLine(CHORDS, { style, seed: 5 });
      assertPlayable(line);
      for (const chord of [0, 1, 2, 3]) {
        const first = line.find((note) => note[0] === chord * 4);
        assert.equal(first[2] % 12, CHORDS[chord].root, `${style}: the chord starts on its root`);
      }
      assert.ok(
        pitches(line).every((pitch) => pitch >= 24 && pitch <= 72),
        `${style}: in a bass's range`,
      );
    }
    const octaves = bassLine(CHORDS, { style: 'octaves' });
    assert.deepEqual(pitches(octaves).slice(0, 4), [45, 57, 45, 57]);
    assert.equal(octaves.length, 32, 'eighth notes');
    const walking = bassLine(CHORDS, { style: 'walking' });
    assert.equal(walking.length, 32);
    // The last eighth of every chord is a semitone from the root that follows.
    for (const chord of [0, 1, 2, 3]) {
      const lead = walking[chord * 8 + 7][2];
      const goal = walking[((chord + 1) % 4) * 8][2];
      assert.equal(Math.abs(lead - goal), 1, `into chord ${chord + 1}`);
    }
    assert.ok(
      new Set(pitches(walking.slice(0, 8))).size >= 5,
      'it walks: not the same note over and over',
    );
  });

  it('is the same for the same seed and another line for another', () => {
    const line = (seed) => JSON.stringify(bassLine(CHORDS, { style: 'syncopated', seed }));
    assert.equal(line(3), line(3));
    assert.ok(new Set([1, 2, 3, 4, 5, 6].map(line)).size > 3);
    assert.ok(
      bassLine(CHORDS, { style: 'syncopated', seed: 1 }).some((note) => note[0] % 1 !== 0),
      'off the beat',
    );
    assert.deepEqual(bassLine([]), []);
    assert.deepEqual(bassLine(null, { style: 'walking' }), []);
  });
});

describe('pads and arpeggios', () => {
  it('pads hold each chord, voiced to move little', () => {
    const pad = padNotes(CHORDS);
    assertPlayable(pad);
    assert.deepEqual(
      pad.slice(0, 6).map((note) => [note[0], note[2]]),
      [
        [0, 57],
        [0, 60],
        [0, 64],
        [4, 57],
        [4, 60],
        [4, 65],
      ],
    );
    assert.ok(pad.every((note) => note[1] === 3.95 && note[3] === 0.6));
    assert.deepEqual(padNotes(CHORDS, { beats: 2, gap: 0.5, velocity: 0.4 })[3], [2, 1.5, 57, 0.4]);
    assert.ok(pitches(padNotes(CHORDS, { center: 72 })).every((pitch) => pitch > 62 && pitch < 84));
  });

  it('arpeggios run through the chord: up, down, up and down, or at random', () => {
    const run = (mode, more) => pitches(arpeggio(CHORDS.slice(0, 1), { mode, ...more }));
    assert.deepEqual(run('up'), [69, 72, 76, 69, 72, 76, 69, 72]);
    assert.deepEqual(run('down'), [76, 72, 69, 76, 72, 69, 76, 72]);
    assert.deepEqual(run('updown'), [69, 72, 76, 72, 69, 72, 76, 72]);
    assert.deepEqual(run('up', { octaves: 2, rate: 4 }).slice(0, 7), [69, 72, 76, 81, 84, 88, 69]);
    assert.equal(run('up', { rate: 4 }).length, 16, 'sixteenths');
    const random = run('random', { seed: 9, octaves: 2, rate: 4 });
    assert.deepEqual(random, run('random', { seed: 9, octaves: 2, rate: 4 }));
    assert.notDeepEqual(random, run('random', { seed: 10, octaves: 2, rate: 4 }));
    assert.ok(
      random.every((pitch, i) => i === 0 || pitch !== random[i - 1]),
      'never the same note twice in a row',
    );
    for (const mode of ARP_MODES) {
      const notes = arpeggio(CHORDS, { mode, rate: 4, seed: 2 });
      assertPlayable(notes);
      assert.ok(
        notes.every((note) => classes(under(note[0])).includes(note[2] % 12)),
        `${mode}: only chord notes`,
      );
    }
  });
});

describe('melody', () => {
  it('stays in the key, moves mostly by step, and ends each phrase long, on the chord', () => {
    for (const seed of [1, 2, 3, 7, 20, 99]) {
      const line = melody(CHORDS, { key: 'A', scale: 'minor', seed });
      assertPlayable(line);
      assert.ok(
        pitches(line).every((pitch) => inScale(pitch, 'A', 'minor')),
        'in the key',
      );
      assert.ok(
        pitches(line).every((pitch) => pitch >= 65 && pitch <= 88),
        'in a range one can sing',
      );
      const leaps = line.filter(
        (note, i) => i > 0 && Math.abs(note[2] - line[i - 1][2]) > 4,
      ).length;
      assert.ok(
        leaps <= line.length * 0.35,
        `seed ${seed}: ${leaps} leaps in ${line.length} notes`,
      );
      // Two-chord phrases: the notes at beats 6 and 14 close them.
      for (const close of [6, 14]) {
        const last = line.find((note) => note[0] === close);
        assert.ok(
          last && last[1] >= 1,
          `seed ${seed}: a long note closes the phrase at beat ${close}`,
        );
        assert.ok(classes(under(close)).includes(last[2] % 12), 'on a note of its chord');
        assert.ok(!line.some((note) => note[0] > close && note[0] < close + 2), 'then a breath');
      }
      for (const note of line.filter((entry) => entry[0] % 4 === 0)) {
        assert.ok(
          classes(under(note[0])).includes(note[2] % 12),
          `a chord note where the chord begins (beat ${note[0]})`,
        );
      }
    }
  });

  it('is the same for the same seed, another tune for another', () => {
    const tune = (seed, more) =>
      JSON.stringify(melody(CHORDS, { key: 'A', scale: 'minor', seed, ...more }));
    assert.equal(tune(4), tune(4));
    assert.equal(new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => tune(seed))).size, 8);
    assert.notEqual(tune(4, { octave: 4 }), tune(4));
    assert.deepEqual(melody([], { seed: 1 }), []);
    assert.deepEqual(melody(CHORDS, { key: 'H' }), []);
  });
});

describe('named beats', () => {
  it('the seven patterns, each a bar of lanes with a fill', () => {
    assert.deepEqual(Object.keys(BEATS), [
      'fourOnTheFloor',
      'backbeat',
      'boomBap',
      'halfTime',
      'breakbeat',
      'trap',
      'bossa',
    ]);
    for (const [name, beat] of Object.entries(BEATS)) {
      assert.ok(beat.label && beat.description && beat.bpm[0] < beat.bpm[1], name);
      for (const lane of [...Object.values(beat.lanes), ...Object.values(beat.fill)]) {
        assert.equal(lane.length, beat.steps, `${name}: every lane is one bar`);
        assert.match(lane, /^[.oxX]+$/);
      }
      assert.ok(beat.lanes.kick && Object.keys(beat.fill).length >= 2, name);
      assert.notDeepEqual(beat.fill, beat.lanes);
    }
    assert.equal(BEATS.fourOnTheFloor.lanes.kick, 'X...X...X...X...');
    assert.ok(BEATS.boomBap.swing > 0 && BEATS.trap.steps === 32);
  });

  it('drumPart: a pattern as a part, the fill every so many bars', () => {
    const part = drumPart('backbeat', { kit: '909', bars: 4, fillEvery: 4 });
    assert.deepEqual(
      [part.kind, part.kit, part.steps, part.bars, part.name],
      ['drums', '909', 16, 4, 'Backbeat'],
    );
    const { lanes, fill } = BEATS.backbeat;
    assert.equal(part.lanes.snare, lanes.snare.repeat(3) + fill.snare);
    assert.equal(part.lanes.hat, lanes.hat.repeat(4), 'a drum the fill does not name plays on');
    assert.equal(
      part.lanes.tomLow,
      '.'.repeat(48) + fill.tomLow,
      'a drum only the fill has rests before it',
    );
    assert.deepEqual(validateSong({ parts: [part] }).problems, []);
    assert.deepEqual(drumPart('backbeat').lanes, lanes);
    assert.equal(
      drumPart('trap', { bars: 2, fillEvery: 1 }).lanes.hat,
      BEATS.trap.fill.hat.repeat(2),
    );
    assert.equal(drumPart('polka'), null);
  });
});
