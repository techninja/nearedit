import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KITS } from '#utils/music/catalog/kits.js';
import { songKey } from '#utils/music/key.js';
import { SONG_LIMITS } from '#utils/music/limits.js';
import { normalizeSong } from '#utils/music/normalize.js';
import { presetParams } from '#utils/music/params.js';
import { songSeconds } from '#utils/music/timing.js';
import { validateSong } from '#utils/music/validate.js';
import { chordClasses } from './harmony.js';
import { STYLES } from './styles.js';
import { makeScore } from './testing/make.js';
import { barNotes, clashes, downbeats, rangeOf, silentParts } from './testing/read.js';
import { MELODY_SPAN, ROLE_RANGE } from './tidy.js';

/** Every style at several seeds, energies and lengths. */
function* everySong() {
  for (const style of STYLES) {
    for (let seed = 1; seed <= 8; seed++) {
      const energy = [0.15, 0.5, 1][seed % 3];
      yield { ...makeScore(style.id, { seed, energy, seconds: 22 + seed * 9 }), seed, energy };
    }
  }
}
const at = (made) => `${made.style.id}, seed ${made.seed}, energy ${made.energy}`;
/** The chord of every bar: the progression from the top of each section, then the cadence. */
function chordOfBar(made) {
  const { sections, harmony, song } = made;
  return (bar) => {
    if (bar === song.bars - 1) return harmony.tonic;
    const section = sections.find((s) => bar >= s.from && bar < s.to);
    const turn = section === sections.at(-1) ? song.bars - 2 : section.to - 1;
    if (bar === turn) return harmony.turn;
    return harmony.chords[(bar - section.from) % harmony.chords.length];
  };
}

test('the same input gives the same song; another seed gives another take', () => {
  for (const style of STYLES) {
    const again = () => makeScore(style.id, { seed: 5, energy: 0.6, seconds: 48 });
    assert.deepEqual(again().raw, again().raw, style.id);
    const keys = new Set();
    for (let seed = 1; seed <= 12; seed++) keys.add(songKey(makeScore(style.id, { seed }).song));
    assert.ok(keys.size >= 10, `${style.id}: ${keys.size} different songs from 12 seeds`);
    const takes = [1, 2, 3, 4, 5, 6].map((seed) => makeScore(style.id, { seed }).harmony);
    assert.ok(new Set(takes.map((h) => `${h.key} ${h.numerals}`)).size >= 3, style.id);
  }
});

test('a generated song is a valid, complete song of the engine', () => {
  for (const made of everySong()) {
    assert.deepEqual(validateSong(made.raw).problems, [], at(made));
    assert.deepEqual(normalizeSong(made.song), made.song, at(made));
    const { song, style, fit } = made;
    assert.ok(song.parts.length >= 3 && song.parts.length <= SONG_LIMITS.parts, at(made));
    assert.equal(new Set(song.parts.map((part) => part.id)).size, song.parts.length, at(made));
    assert.deepEqual(
      [song.bpm, song.bars, song.beatsPerBar],
      [fit.bpm, fit.bars, style.beatsPerBar],
    );
    assert.deepEqual([song.scale, song.swing], [style.scale, style.swing]);
    assert.ok(style.keys.includes(song.key), at(made));
    assert.ok(songSeconds(song) >= fit.seconds + fit.rest + 1, 'the tail reaches past the span');
    // Nothing was cut by a limit: every note and lane the generator wrote is in the song.
    made.raw.parts.forEach((part, i) => {
      assert.equal(song.parts[i].notes?.length, part.notes?.length, `${at(made)}: ${part.name}`);
      assert.deepEqual(song.parts[i].play, part.play, `${at(made)}: ${part.name}`);
    });
  }
});

test('no part is silent, and every part that plays begins with its section', () => {
  for (const made of everySong()) {
    const { song, sections } = made;
    assert.deepEqual(silentParts(song), [], at(made));
    const starts = sections.map((section) => section.from);
    const turns = sections.map((section) => section.to - 1);
    for (const part of song.parts) {
      assert.ok(part.play.length > 0, `${at(made)}: ${part.name} would play everywhere`);
      for (const [from] of part.play) {
        const where = `${at(made)}: ${part.name} from bar ${from}`;
        // Loops begin on a section line; fills and the cadence on the bar before one.
        const closing = /cadence$|^Fill$/.test(part.name);
        if (closing) assert.ok(turns.includes(from) || from === song.bars - 2 || from === 0, where);
        else assert.ok(starts.includes(from), where);
      }
    }
  }
});

test('reading the notes: nothing grinds, every part in range, melodies within a twelfth', () => {
  for (const made of everySong()) {
    const { song, style } = made;
    assert.deepEqual(clashes(song), [], `${at(made)}: held semitones between parts`);
    for (const spec of style.parts) {
      for (const name of [spec.name, `${spec.name} cadence`]) {
        const range = rangeOf(song, name);
        if (!range.length) continue;
        const [low, high] = ROLE_RANGE[spec.role];
        assert.ok(range[0] >= low && range[1] <= high, `${at(made)}: ${name} plays ${range}`);
        if (spec.role === 'lead') {
          assert.ok(range[1] - range[0] <= MELODY_SPAN, `${at(made)}: ${name} spans ${range}`);
        }
      }
    }
  }
});

test('the bass is on the root of the chord at the start of every bar it plays', () => {
  for (const made of everySong()) {
    const chord = chordOfBar(made);
    const basses = made.style.parts.filter((part) => part.role === 'bass');
    for (const name of basses.flatMap((part) => [part.name, `${part.name} cadence`])) {
      for (const [bar, pitchClass] of downbeats(made.song, name)) {
        assert.equal(pitchClass, chord(bar).bass, `${at(made)}: ${name} in bar ${bar}`);
      }
    }
    // Every other note that begins a bar belongs to that bar's chord.
    for (const part of made.style.parts.filter((spec) => spec.role !== 'lead')) {
      for (const [bar, pitchClass] of downbeats(made.song, part.name)) {
        if (pitchClass < 0) continue;
        assert.ok(
          chordClasses(chord(bar)).includes(pitchClass),
          `${at(made)}: ${part.name} ${bar}`,
        );
      }
    }
  }
});

test('the last bar resolves to the tonic chord, with the key note in the bass', () => {
  for (const made of everySong()) {
    const { song, harmony } = made;
    const last = barNotes(song, song.bars - 1);
    assert.ok(last.length >= 3, `${at(made)}: ${last.length} notes in the last bar`);
    const tonic = chordClasses(harmony.tonic);
    for (const note of last)
      assert.ok(tonic.includes(note.pitch % 12), `${at(made)}: ${note.pitch}`);
    assert.ok(
      last.every((note) => note.beat === (song.bars - 1) * song.beatsPerBar),
      at(made),
    );
    const lowest = last.reduce((a, b) => (b.pitch < a.pitch ? b : a));
    assert.equal(lowest.pitch % 12, harmony.tonic.root, at(made));
    assert.equal(harmony.tonic.root, chordClasses(harmony.tonic)[0]);
    // The bar before it is the turnaround, on every instrument that plays it.
    if (song.bars < 2) continue;
    const turn = chordClasses(harmony.turn);
    for (const note of barNotes(song, song.bars - 2)) {
      assert.ok(turn.includes(note.pitch % 12), `${at(made)}: ${note.part} ${note.pitch}`);
    }
  }
});

test('bass and kick are never both below 40 Hz', () => {
  const hertz = (pitch) => 440 * 2 ** ((pitch - 69) / 12);
  assert.ok(hertz(ROLE_RANGE.bass[0]) > 40, 'the lowest bass note is E1, 41 Hz');
  for (const kit of Object.values(KITS)) {
    assert.ok(
      kit.drums.kick.tones.every((tone) => tone.freq >= 40),
      kit.name,
    );
  }
});

test('a key and a tempo that were asked for are used; brightness opens the filters', () => {
  const asked = makeScore('house', { key: 'F#', bpm: 121, seconds: 30 });
  assert.deepEqual([asked.song.key, asked.song.bpm, asked.harmony.key], ['F#', 121, 'F#']);
  // The rest of the take does not change with the key.
  assert.equal(
    asked.harmony.numerals,
    makeScore('house', { bpm: 121, seconds: 30 }).harmony.numerals,
  );
  assert.equal(makeScore('house', { key: 'H' }).song.key, makeScore('house').song.key);
  const cutoff = (made, name) => {
    const part = made.song.parts.find((entry) => entry.name === name);
    return part.params.cutoff ?? presetParams(part.preset).cutoff;
  };
  const [dark, plain, bright] = [0, 0.5, 1].map((b) => makeScore('house', { brightness: b }));
  assert.equal(cutoff(plain, 'Pad'), presetParams('pad').cutoff);
  assert.equal(cutoff(dark, 'Pad'), presetParams('pad').cutoff / 2);
  assert.equal(cutoff(bright, 'Pad'), presetParams('pad').cutoff * 2);
  assert.equal(cutoff(bright, 'Pad cadence'), cutoff(bright, 'Pad'));
  assert.deepEqual(validateSong(bright.raw).problems, []);
  assert.deepEqual(
    dark.song.parts.map((part) => part.notes),
    bright.song.parts.map((part) => part.notes),
    'the notes stay the same',
  );
});

test('songs of one and two bars are an ending: the cadence alone', () => {
  const one = makeScore('house', { seconds: 2, bpm: 120 });
  assert.equal(one.song.bars, 1);
  assert.deepEqual(
    one.song.parts.map((part) => [part.name, part.bars, part.play]),
    [
      ['Pad cadence', 1, [[0, 1]]],
      ['Bass cadence', 1, [[0, 1]]],
    ],
  );
  const two = makeScore('house', { seconds: 4, bpm: 120 });
  assert.deepEqual(
    two.song.parts.map((part) => [part.name, part.play]),
    [
      ['Fill', [[0, 2]]],
      ['Pad cadence', [[0, 2]]],
      ['Bass cadence', [[0, 2]]],
    ],
  );
  for (const made of [one, two]) assert.deepEqual(validateSong(made.raw).problems, []);
});
