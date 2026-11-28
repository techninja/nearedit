import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHORD_QUALITIES,
  KEY_NAMES,
  NOTE_NAMES,
  SCALES,
  chord,
  degree,
  inScale,
  noteName,
  noteNumber,
  pitchClass,
  progression,
  scaleNotes,
  snapToScale,
  spelling,
  voiceLead,
} from './index.js';

const names = (chords) => chords.map((c) => c.name).join(' ');

describe('notes and scales', () => {
  it('note names and numbers: middle C is C4 = 60', () => {
    assert.equal(noteNumber('C4'), 60);
    assert.equal(noteNumber('A4'), 69);
    assert.deepEqual(
      ['C-1', 'G9', 'F#2', 'Bb3', 'e♭5', 'B#3', 'Cb4'].map(noteNumber),
      [0, 127, 42, 58, 75, 60, 59],
    );
    assert.ok(['H4', 'C', '', null, 60, 'C4x'].every((name) => Number.isNaN(noteNumber(name))));
    assert.deepEqual([60, 69, 0, 127, 61.4].map(noteName), ['C4', 'A4', 'C-1', 'G9', 'C#4']);
    assert.equal(noteName(NaN), '');
    for (let pitch = 0; pitch <= 127; pitch++) assert.equal(noteNumber(noteName(pitch)), pitch);
    assert.deepEqual(
      ['C', 'c#', 'Db', 'B', 'Cb', 'E#', 'F##', 'A4'].map(pitchClass),
      [0, 1, 1, 11, 11, 5, 7, 9],
    );
    assert.deepEqual(['H', '', 3, null].map(pitchClass), [-1, -1, -1, -1]);
    assert.equal(NOTE_NAMES.length, 12);
    assert.deepEqual(new Set(KEY_NAMES.map(pitchClass)).size, 12);
  });

  it('scales, upwards from the key note', () => {
    assert.deepEqual(scaleNotes('C', 'major'), [60, 62, 64, 65, 67, 69, 71, 72]);
    assert.deepEqual(scaleNotes('A', 'minor', 3), [57, 59, 60, 62, 64, 65, 67, 69]);
    assert.deepEqual(
      scaleNotes('Eb', 'minorPentatonic', 2, 2),
      [39, 42, 44, 46, 49, 51, 54, 56, 58, 61, 63],
    );
    assert.deepEqual(scaleNotes('X', 'major'), []);
    assert.deepEqual(
      scaleNotes('C', 'nope'),
      scaleNotes('C', 'minor'),
      'an unknown scale is the minor one',
    );
    assert.ok(scaleNotes('G', 'major', 9).every((note) => note <= 127));
    for (const [name, { label, steps }] of Object.entries(SCALES)) {
      assert.ok(
        label && steps[0] === 0 && steps.every((step, i) => i === 0 || step > steps[i - 1]),
        name,
      );
    }
  });

  it('tells which notes belong, and finds the nearest that does', () => {
    assert.ok(inScale(62, 'C', 'major') && !inScale(61, 'C', 'major') && inScale(1, 'Db', 'major'));
    assert.deepEqual(
      [60, 61, 63, 66, 70].map((note) => snapToScale(note, 'C', 'major')),
      [60, 60, 62, 65, 69],
    );
    assert.equal(snapToScale(61, 'C', 'chromatic'), 61);
  });
});

describe('chords', () => {
  it('reads triads, sevenths, sus, add and slash chords, with sharps and flats', () => {
    assert.deepEqual(chord('C').notes, [48, 52, 55]);
    assert.deepEqual(chord('Am7').notes, [57, 60, 64, 67]);
    assert.deepEqual(chord('F#dim').steps, [0, 3, 6]);
    assert.deepEqual(chord('Bbmaj7').notes, [58, 62, 65, 69]);
    assert.deepEqual(chord('Ebsus4').steps, [0, 5, 7]);
    assert.deepEqual(chord('Dadd9').steps, [0, 4, 7, 14]);
    assert.deepEqual(chord('G7').steps, [0, 4, 7, 10]);
    const slash = chord('C/E');
    assert.deepEqual([slash.root, slash.bass, slash.bassNote, slash.name], [0, 4, 40, 'C/E']);
    assert.equal(chord('Am7/G').bass, 7);
    assert.equal(chord(' Dm ').name, 'Dm');
  });

  it('knows the other ways the same chord is written', () => {
    const same = [
      ['Cmaj7', 'CM7', 'CΔ'],
      ['Cm', 'Cmin', 'C-'],
      ['Cdim', 'C°'],
      ['Caug', 'C+'],
      ['Cm7b5', 'Cø'],
      ['Csus4', 'Csus'],
    ];
    for (const group of same) {
      for (const name of group) assert.deepEqual(chord(name).steps, chord(group[0]).steps, name);
    }
    assert.ok(Object.keys(CHORD_QUALITIES).length >= 20);
  });

  it('answers null for what is not a chord', () => {
    for (const junk of ['H', 'Cfoo', '', 'C/', 'C/H', null, 7, 'maj7'])
      assert.equal(chord(junk), null, String(junk));
  });
});

describe('Roman numerals', () => {
  it('upper case is major, lower case minor, on the steps of the key', () => {
    assert.equal(names(progression('A', 'minor', 'i-VI-III-VII')), 'Am F C G');
    assert.equal(names(progression('C', 'major', 'I-V-vi-IV')), 'C G Am F');
    assert.equal(names(progression('F', 'major', 'I vi ii7 V7')), 'F Dm Gm7 C7');
    assert.equal(names(progression('E', 'minor', 'i | iv | v | i')), 'Em Am Bm Em');
    assert.equal(names(progression('D', 'dorian', 'i IV')), 'Dm G');
    assert.deepEqual(degree('A', 'minor', 'i').notes, [57, 60, 64]);
    assert.equal(degree('C', 'major', 'vii°').name, 'Bdim');
    assert.equal(degree('C', 'major', 'Imaj7').name, 'Cmaj7');
    assert.equal(degree('C', 'major', 'Vsus4').name, 'Gsus4');
    assert.equal(degree('C', 'minor', 'iiø').name, 'Dm7b5');
    assert.equal(degree('A', 'minor', 'imaj7').name, 'AmMaj7');
  });

  it('spells with flats where sharps would use a letter twice', () => {
    assert.equal(names(progression('D', 'minor', 'i-VI-III-VII')), 'Dm Bb F C');
    assert.equal(names(progression('Eb', 'major', 'I-IV-V')), 'Eb Ab Bb');
    assert.equal(names(progression('E', 'major', 'I-IV-V')), 'E A B');
    assert.equal(names(progression('B', 'minor', 'i-VI-VII')), 'Bm G A');
    assert.equal(spelling('F', 'major')[10], 'Bb');
    assert.equal(spelling('G', 'major')[6], 'F#');
  });

  it('a sign counts from the major scale, as chord charts do', () => {
    assert.equal(names(progression('D', 'minor', 'i bVII bVI V7')), 'Dm C Bb A7');
    assert.equal(names(progression('C', 'major', 'I bVII IV')), 'C A# F');
    assert.equal(degree('C', 'major', 'bII').root, 1);
    assert.equal(degree('C', 'major', '#iv°').root, 6);
  });

  it('five-note scales count on the major or minor scale their third fits; chord names pass', () => {
    assert.equal(names(progression('A', 'minorPentatonic', 'i-VII-VI')), 'Am G F');
    assert.equal(names(progression('C', 'majorPentatonic', 'I-vi-IV')), 'C Am F');
    assert.equal(names(progression('C', 'major', 'Am, F, C/E, Gsus4')), 'Am F C/E Gsus4');
    assert.equal(names(progression('C', 'major', ['ii', 'V', 'I'])), 'Dm G C');
    assert.deepEqual(
      progression('C', 'major', 'I-nope-V').map((c) => c.name),
      ['C', 'G'],
      'what cannot be read is left out',
    );
    assert.deepEqual(progression('C', 'major', ''), []);
    assert.deepEqual(progression('C', 'major', null), []);
    assert.equal(degree('H', 'major', 'I'), null);
    assert.equal(degree('C', 'major', 'VIII'), null);
  });
});

describe('voice leading', () => {
  it('keeps the notes two chords share and moves the others the least', () => {
    const voiced = voiceLead(progression('A', 'minor', 'i-VI-III-VII'));
    assert.deepEqual(voiced, [
      [57, 60, 64],
      [57, 60, 65],
      [55, 60, 64],
      [55, 59, 62],
    ]);
    const moved = (a, b) => a.reduce((sum, note, i) => sum + Math.abs(note - b[i]), 0);
    const plain = progression('A', 'minor', 'i-VI-III-VII').map((c) => c.notes);
    for (let i = 1; i < voiced.length; i++) {
      assert.ok(moved(voiced[i - 1], voiced[i]) < moved(plain[i - 1], plain[i]), `chord ${i}`);
    }
  });

  it('holds every chord complete, ascending, and around its centre', () => {
    for (const center of [48, 60, 72]) {
      const chords = progression('C', 'major', 'Imaj7 vi7 ii7 V7 iii7 VI7 ii7 V7');
      const voiced = voiceLead(chords, { center });
      voiced.forEach((notes, i) => {
        const classes = new Set(notes.map((note) => note % 12));
        assert.deepEqual(
          [...classes].sort(),
          [...new Set(chords[i].steps.map((s) => (chords[i].root + s) % 12))].sort(),
        );
        assert.ok(notes.every((note, n) => n === 0 || note > notes[n - 1]));
        const middle = notes.reduce((a, b) => a + b) / notes.length;
        assert.ok(Math.abs(middle - center) <= 7, `chord ${i} drifted to ${middle}`);
      });
    }
    assert.deepEqual(voiceLead([]), []);
    assert.deepEqual(voiceLead(null), []);
  });
});
