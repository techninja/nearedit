import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSong, validateSong } from '#utils/music/index.js';
import { PRESETS, SYNTH_PARAMS, partParams, presetParams } from '#utils/music/index.js';
import * as edit from './noteEdit.js';
import * as sound from './soundEdit.js';
import { STARTERS, starterOf } from './starters.js';
import * as write from './writeNotes.js';

const LOOP = 8;
const notes = () => [
  [0, 1, 60, 0.8],
  [1, 0.5, 64, 0.8],
  [2, 2, 67, 0.5],
];
const starts = (list) => list.map(([beat, , pitch]) => `${beat}:${pitch}`);

describe('note edits', () => {
  it('knows a note by where it starts', () => {
    assert.equal(edit.noteKey([1.5, 1, 60, 0.8]), '1.5:60');
    assert.equal(edit.noteKey([1 / 3, 1, 60.2]), '0.333333:60');
    assert.equal(edit.snapTo(1.37, 0.25), 1.25);
    assert.equal(edit.snapTo(1.37, 0), 1.37);
  });

  it('adds a note in order, and keeps the one that already starts there', () => {
    const added = edit.addNote(notes(), { beat: 1.5, pitch: 62, length: 0.25 }, LOOP);
    assert.deepEqual(starts(added.notes), ['0:60', '1:64', '1.5:62', '2:67']);
    assert.deepEqual(added.keys, ['1.5:62']);
    assert.equal(added.notes[2][3], 0.8, 'the default velocity');
    const before = notes();
    const again = edit.addNote(before, { beat: 1, pitch: 64 }, LOOP);
    assert.equal(again.notes, before);
    assert.deepEqual(again.keys, ['1:64']);
    assert.deepEqual(
      edit.addNote(notes(), { beat: 9, pitch: 60 }, LOOP).keys,
      [],
      'outside the loop',
    );
  });

  it('removes notes and leaves nothing selected', () => {
    const left = edit.removeNotes(notes(), ['0:60', '2:67']);
    assert.deepEqual(starts(left.notes), ['1:64']);
    assert.deepEqual(left.keys, []);
  });

  it('moves the chosen notes together and tells where they are now', () => {
    const moved = edit.moveNotes(notes(), ['0:60', '1:64'], 0.5, 12, LOOP);
    assert.deepEqual(starts(moved.notes), ['0.5:72', '1.5:76', '2:67']);
    assert.deepEqual(moved.keys.sort(), ['0.5:72', '1.5:76']);
  });

  it('cuts a move short at the edges of the loop and of the keyboard', () => {
    const left = edit.moveNotes(notes(), ['1:64', '2:67'], -5, 0, LOOP);
    assert.deepEqual(starts(left.notes), ['0:60', '0:64', '1:67']);
    const right = edit.moveNotes(notes(), ['2:67'], 100, 100, LOOP);
    assert.ok(right.notes[2][0] < LOOP && right.notes[2][0] > LOOP - 0.001);
    assert.equal(right.notes[2][2], 127);
    assert.deepEqual(edit.moveNotes(notes(), ['7:7'], 1, 1, LOOP).keys, []);
  });

  it('lets a moved note replace the one it lands on', () => {
    const landed = edit.moveNotes(notes(), ['0:60'], 1, 4, LOOP);
    assert.deepEqual(starts(landed.notes), ['1:64', '2:67']);
    assert.equal(landed.notes[0][1], 1, 'the moved note, not the one that was there');
  });

  it('resizes with a shortest length, sets velocity, and finds notes in a box', () => {
    const longer = edit.resizeNotes(notes(), ['1:64'], 1, 0.25, LOOP);
    assert.equal(longer.notes[1][1], 1.5);
    assert.equal(edit.resizeNotes(notes(), ['1:64'], -9, 0.25, LOOP).notes[1][1], 0.25);
    assert.equal(edit.setVelocity(notes(), ['2:67'], 0, LOOP).notes[2][3], 0.01);
    assert.equal(edit.setVelocity(notes(), ['2:67'], 0.9, LOOP).notes[2][3], 0.9);
    const box = { beat0: 1.2, beat1: 2.5, pitch0: 70, pitch1: 62 };
    assert.deepEqual(edit.notesInBox(notes(), box), ['1:64', '2:67']);
    assert.deepEqual(edit.notesInBox(notes(), { ...box, pitch1: 66 }), ['2:67']);
  });
});

describe('writing notes', () => {
  const song = normalizeSong({ key: 'A', scale: 'minor', parts: [{ id: 's', kind: 'synth' }] });
  const [part] = song.parts;

  it('offers common progressions in the key, spelled out', () => {
    const minor = write.progressionChoices('A', 'minor');
    assert.deepEqual(minor[0], { sequence: 'i-VI-III-VII', names: 'Am F C G' });
    assert.equal(write.progressionChoices('C', 'major')[0].names, 'C G Am F');
    assert.equal(write.progressionChoices('D', 'dorian')[0].sequence, 'i-VI-III-VII');
    assert.deepEqual(write.chordNames('A', 'minor', 'Dm7 G7 ???'), ['Dm7', 'G7']);
  });

  it('writes a bass line, chords, an arpeggio and a melody, one chord to a bar', () => {
    const form = write.defaultWriteForm(song);
    assert.deepEqual(form, { what: 'bass', sequence: 'i-VI-III-VII', option: 'roots', seed: 1 });
    for (const what of Object.keys(write.WRITERS)) {
      const made = write.writePart(song, part, { ...form, what, sequence: 'Am F C G E' });
      assert.equal(made.problem, '', what);
      assert.equal(made.part.bars, 5, 'the loop is as long as the progression');
      assert.ok(made.part.notes.length >= 5, what);
      assert.equal(validateSong({ ...song, parts: [made.part] }).problems.length, 0, what);
      assert.ok(
        made.part.notes.every(([beat]) => beat < 20),
        what,
      );
    }
    const roots = write.writePart(song, part, form).part.notes;
    assert.deepEqual(
      roots.map((note) => note[2]),
      [45, 41, 36, 43],
      'A F C G in the bass',
    );
  });

  it('writes the same notes for the same seed and others for another', () => {
    const form = { ...write.defaultWriteForm(song), what: 'melody' };
    const one = write.writePart(song, part, form).part.notes;
    assert.deepEqual(write.writePart(song, part, form).part.notes, one);
    assert.notDeepEqual(write.writePart(song, part, { ...form, seed: 2 }).part.notes, one);
  });

  it('reads the option of the chosen writer and says why nothing was written', () => {
    assert.equal(
      write.writerOption({ what: 'arp', sequence: '', option: 'walking', seed: 1 }),
      'up',
    );
    assert.equal(write.writerOption({ what: 'pad', sequence: '', option: 'x', seed: 1 }), '');
    const form = write.defaultWriteForm(song);
    assert.match(write.writePart(song, part, { ...form, sequence: 'la la' }).problem, /No chord/);
    assert.equal(write.writePart(song, part, { ...form, sequence: '' }).part, part);
    assert.match(write.writePart(song, { kind: 'drums' }, form).problem, /synth/);
  });
});

describe('sound', () => {
  const part = normalizeSong({
    parts: [{ kind: 'synth', preset: 'bass', params: { cutoff: 900 } }],
  }).parts[0];

  it('lists every preset once, by category', () => {
    const groups = sound.presetGroups();
    assert.deepEqual(
      groups.map((group) => group.label),
      ['Bass', 'Keys', 'Pads', 'Leads'],
    );
    const names = groups.flatMap((group) => group.presets.map((preset) => preset.name));
    assert.deepEqual(names.sort(), Object.keys(PRESETS).sort());
  });

  it('stores only what differs from the preset', () => {
    const louder = sound.setParam(part, 'resonance', 0.8);
    assert.deepEqual(louder.params, { cutoff: 900, resonance: 0.8 });
    const back = sound.setParam(louder, 'cutoff', presetParams('bass').cutoff);
    assert.deepEqual(back.params, { resonance: 0.8 });
    assert.equal(sound.setParam(part, 'cutoff', 1e9).params.cutoff, 20000, 'inside its range');
    assert.equal(sound.setParam(part, 'osc1Wave', 'kazoo').params.osc1Wave, undefined);
    assert.equal(sound.setParam(part, 'warp', 1), part);
  });

  it('resets one parameter or all, and drops them with a new preset', () => {
    const two = sound.setParam(part, 'drive', 0.9);
    assert.deepEqual(sound.resetParams(two, 'cutoff').params, { drive: 0.9 });
    assert.deepEqual(sound.resetParams(two).params, {});
    assert.equal(sound.resetParams(two, 'glide'), two);
    assert.deepEqual(sound.setPreset(two, 'pad'), { ...two, preset: 'pad', params: {} });
    assert.equal(sound.setPreset(two, 'theremin'), two);
    assert.deepEqual(sound.setPreset(two, 'bass').params, {}, 'the same preset again resets');
  });

  it('builds a control for every parameter, grouped as the schema says', () => {
    const sections = sound.soundSections(part);
    const groups = [...new Set(Object.values(SYNTH_PARAMS).map((spec) => spec.group))];
    assert.deepEqual(
      sections.map((section) => section.title),
      groups,
    );
    const controls = sections.flatMap((section) => section.controls);
    assert.equal(controls.length, Object.keys(SYNTH_PARAMS).length);
    const cutoff = controls.find((control) => control.name === 'cutoff');
    assert.deepEqual([cutoff.path, cutoff.value, cutoff.spec.unit], ['params.cutoff', 900, 'Hz']);
    assert.equal(cutoff.value, partParams(part).cutoff);
    assert.equal(sections.find((section) => section.title === 'Filter').changed, 1);
  });
});

describe('starting points', () => {
  it('are an empty song, every named beat and six loops, all valid songs', () => {
    assert.equal(STARTERS.filter((starter) => starter.kind === 'beat').length, 7);
    assert.equal(STARTERS.filter((starter) => starter.kind === 'loop').length, 6);
    for (const starter of STARTERS) {
      const raw = starter.song();
      assert.deepEqual(validateSong(raw).problems, [], starter.id);
      assert.deepEqual(
        normalizeSong(raw),
        normalizeSong(starter.song()),
        `${starter.id}: the same`,
      );
    }
    assert.equal(starterOf('empty').song().parts.length, 1);
  });

  it('build a loop as drums, bass, chords and a line on top, a chord to a bar', () => {
    const song = normalizeSong(starterOf('loop:lofi').song());
    assert.deepEqual(
      [song.bpm, song.swing, song.key, song.scale, song.bars],
      [82, 0.3, 'D', 'dorian', 4],
    );
    assert.deepEqual(
      song.parts.map((each) => each.kind),
      ['drums', 'synth', 'synth', 'synth'],
    );
    assert.deepEqual(
      song.parts.map((each) => each.preset || each.kit),
      ['lofi', 'sub', 'keys', 'bell'],
    );
    assert.ok(song.parts.every((each) => each.bars === 4));
    const bass = song.parts[1].notes;
    assert.equal(bass[0][2] % 12, 2, 'the bass starts on D');
  });
});
