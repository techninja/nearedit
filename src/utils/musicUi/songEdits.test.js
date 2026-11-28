import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deepFreeze } from '#utils/edl/testkit.js';
import { normalizeSong, validateSong } from '#utils/music/index.js';
import { BEATS } from '#utils/music/theory/beats.js';
import { addFill, applyBeat, beatChoices, beatOf } from './drumBeats.js';
import * as drums from './drumEdit.js';
import { fieldTarget, setField } from './fieldRoutes.js';
import * as parts from './partEdit.js';
import { paintPlay, playBars, rangesOf } from './playStrip.js';
import { changePart, partOf, setSongField, songField } from './songEdit.js';

const song = () =>
  deepFreeze(
    normalizeSong({
      bars: 4,
      parts: [
        { id: 'd', kind: 'drums', lanes: { kick: 'X...x...X...x...', hat: 'x.x.x.x.x.x.x.x.' } },
        {
          id: 's',
          kind: 'synth',
          preset: 'bass',
          bars: 2,
          notes: [
            [0, 1, 36, 0.9],
            [4.5, 0.5, 43],
          ],
        },
      ],
    }),
  );
const stored = (next) => normalizeSong(next);

describe('song fields', () => {
  it('sets a field by the name a control reports, inside its range', () => {
    assert.equal(setSongField(song(), 'bpm', 96).bpm, 96);
    assert.equal(setSongField(song(), 'bpm', 900).bpm, 240);
    assert.equal(setSongField(song(), 'bars', '7.6').bars, 8);
    assert.equal(setSongField(song(), 'key', 'F#').key, 'F#');
    const before = song();
    const mixed = setSongField(before, 'master.reverb.size', 0.9);
    assert.equal(mixed.master.reverb.size, 0.9);
    assert.equal(mixed.master.reverb.decay, 0.5, 'the fields beside it are kept');
    assert.equal(
      mixed.master.delay,
      before.master.delay,
      'what was not touched is the same object',
    );
    assert.equal(songField(mixed, 'master.reverb.size'), 0.9);
  });

  it('leaves the song alone for an unknown field or an unusable value', () => {
    const before = song();
    assert.equal(setSongField(before, 'parts', []), before);
    assert.equal(setSongField(before, 'bpm', 'fast'), before);
    assert.equal(setSongField(before, 'key', 4), before);
    assert.equal(
      changePart(before, 'nobody', (part) => ({ ...part, mute: true })),
      before,
    );
    assert.equal(
      changePart(before, 'd', (part) => part),
      before,
    );
  });
});

describe('parts', () => {
  it('adds a drum part on the kit in use, and a synth part as long as the song', () => {
    const base = changePart(song(), 'd', (part) => ({ ...part, kit: '909' }));
    const withDrums = parts.addPart(base, 'drums');
    const added = partOf(stored(withDrums.song), withDrums.partId);
    assert.deepEqual([added.kind, added.kit, added.bars, added.steps], ['drums', '909', 1, 16]);
    const withSynth = parts.addPart(withDrums.song, 'synth');
    assert.deepEqual([withSynth.partId, partOf(stored(withSynth.song), 'p2').bars], ['p2', 4]);
    assert.equal(validateSong(withSynth.song).problems.length, 0);
  });

  it('stops at sixteen parts', () => {
    let full = song();
    while (full.parts.length < 16) full = parts.addPart(full, 'synth').song;
    assert.deepEqual(parts.addPart(full, 'drums'), { song: full, partId: '' });
    assert.equal(parts.duplicatePart(full, 'd').partId, '');
  });

  it('duplicates after the original, removes, and moves within the list', () => {
    const copied = parts.duplicatePart(song(), 'd');
    assert.deepEqual(
      copied.song.parts.map((part) => part.id),
      ['d', copied.partId, 's'],
    );
    assert.equal(partOf(copied.song, copied.partId).name, '808 drums copy');
    assert.deepEqual(partOf(copied.song, copied.partId).lanes, partOf(song(), 'd').lanes);
    assert.deepEqual(
      parts.removePart(song(), 'd').parts.map((part) => part.id),
      ['s'],
    );
    assert.deepEqual(
      parts.movePart(song(), 's', -1).parts.map((part) => part.id),
      ['s', 'd'],
    );
    const before = song();
    assert.equal(parts.movePart(before, 's', 1), before, 'already last');
    assert.equal(parts.removePart(before, 'nobody'), before);
  });

  it('sets the mix of a part inside its ranges, by the name a control reports', () => {
    const next = setField(song(), 'part.s.pan', -3);
    assert.equal(partOf(next, 's').pan, -1);
    assert.equal(partOf(setField(song(), 'part.s.mute', true), 's').mute, true);
    assert.equal(partOf(setField(song(), 'name', 'Low end', 's'), 's').name, 'Low end');
    assert.equal(partOf(setField(song(), 'transpose', 12.4, 's'), 's').transpose, 12);
    assert.equal(setField(song(), 'bpm', 90, 's').bpm, 90, 'a field of the song is the song’s');
    const before = song();
    assert.equal(setField(before, 'part.s.volume', 'loud'), before);
    assert.equal(setField(before, 'part.s.kind', 'drums'), before);
    assert.equal(setField(before, 'part.nobody.pan', 1), before);
    assert.equal(setField(before, 'pan', 1), before, 'no part is showing');
  });

  it('routes what only one kind of part has to that kind', () => {
    assert.deepEqual(fieldTarget('part.p-2.params.cutoff', 'd'), {
      partId: 'p-2',
      field: 'params.cutoff',
    });
    assert.deepEqual(fieldTarget('steps', 'd'), { partId: 'd', field: 'steps' });
    assert.deepEqual(fieldTarget('master.volume', 'd'), { partId: '', field: 'master.volume' });
    assert.equal(partOf(setField(song(), 'kit', 'lofi', 'd'), 'd').kit, 'lofi');
    assert.equal(partOf(setField(song(), 'steps', '32', 'd'), 'd').steps, 32);
    const synth = setField(song(), 'params.cutoff', 900, 's');
    assert.deepEqual(partOf(synth, 's').params, { cutoff: 900 });
    assert.deepEqual(partOf(setField(synth, 'params', null, 's'), 's').params, {}, 'reset all');
    assert.equal(partOf(setField(synth, 'preset', 'pad', 's'), 's').preset, 'pad');
    const before = song();
    assert.equal(setField(before, 'preset', 'pad', 'd'), before, 'drums have no preset');
    assert.equal(setField(before, 'kit', 'lofi', 's'), before, 'a synth has no kit');
  });

  it('repeats what a part plays when its loop gets longer, and cuts when shorter', () => {
    const longer = stored(setField(song(), 'part.d.bars', 2));
    assert.equal(partOf(longer, 'd').lanes.kick, 'X...x...X...x...X...x...X...x...');
    const synth = partOf(stored(setField(song(), 'part.s.bars', 4)), 's');
    assert.deepEqual(
      synth.notes.map((note) => note[0]),
      [0, 4.5, 8, 12.5],
    );
    const shorter = partOf(stored(setField(song(), 'part.s.bars', 1)), 's');
    assert.deepEqual(
      shorter.notes.map((note) => note[0]),
      [0],
    );
  });
});

describe('where a part plays', () => {
  it('reads the strip and writes it back as ranges', () => {
    assert.deepEqual(playBars(song(), partOf(song(), 'd')), [true, true, true, true]);
    assert.deepEqual(rangesOf([true, true, true]), [], 'everywhere stores nothing');
    assert.deepEqual(rangesOf([true, false, true, true]), [
      [0, 1],
      [2, 4],
    ]);
    const off = paintPlay(song(), 'd', [1, 2], false);
    assert.deepEqual(partOf(off, 'd').play, [
      [0, 1],
      [3, 4],
    ]);
    assert.deepEqual(playBars(off, partOf(off, 'd')), [true, false, false, true]);
    assert.deepEqual(partOf(paintPlay(off, 'd', [1, 2], true), 'd').play, []);
  });

  it('never leaves a part nowhere to play, and changes nothing for nothing', () => {
    const before = song();
    assert.equal(paintPlay(before, 'd', [0, 1, 2, 3], false), before);
    assert.equal(paintPlay(before, 'd', [2], true), before);
    assert.equal(paintPlay(before, 'd', [9], false), before);
  });
});

describe('drum grid', () => {
  const kept = partOf(song(), 'd');
  const part = () => kept;

  it('cycles a step: rest, hit, accent, soft, rest', () => {
    assert.deepEqual(['.', 'x', 'X', 'o'].map(drums.nextStep), ['x', 'X', 'o', '.']);
    const hit = drums.paintSteps(part(), 'snare', [4, 12], 'x');
    assert.equal(hit.lanes.snare, '....x.......x...');
    assert.equal(drums.laneOf(part(), 'clap'), '................');
  });

  it('paints a run, and forgets a lane that has no hit left', () => {
    const painted = drums.paintSteps(part(), 'kick', [0, 1, 2, 99], 'o');
    assert.equal(painted.lanes.kick, 'ooo.x...X...x...');
    const cleared = drums.paintSteps(part(), 'kick', [0, 4, 8, 12], '.');
    assert.deepEqual(Object.keys(cleared.lanes), ['hat']);
    assert.equal(drums.clearLane(part(), 'kick').lanes.kick, undefined);
    assert.equal(drums.clearLane(part(), 'clap'), part(), 'nothing to clear: the same part');
    assert.equal(drums.paintSteps(part(), 'triangle', [0], 'x'), part(), 'not a drum');
  });

  it('shifts a lane around the loop and fills every nth step', () => {
    assert.equal(drums.shiftLane(part(), 'kick', 1).lanes.kick, '.X...x...X...x..');
    assert.equal(drums.shiftLane(part(), 'kick', -1).lanes.kick, '...x...X...x...X');
    assert.equal(drums.shiftLane(part(), 'kick', 16), part());
    assert.equal(drums.fillLane(part(), 'hat', 4).lanes.hat, 'x...x...x...x...');
    assert.equal(drums.fillLane(part(), 'ride', 1, 'o').lanes.ride, 'o'.repeat(16));
  });

  it('keeps every hit where it falls when the grid changes', () => {
    assert.equal(drums.regridLane('X...x...', 8, 16), 'X.......x.......');
    assert.equal(drums.regridLane('X.x.o.X.', 16, 8), 'XxoX');
    assert.equal(drums.regridLane('xX', 16, 8), 'X', 'where two meet the harder stays');
    const finer = drums.setSteps(part(), 32);
    assert.equal(finer.steps, 32);
    assert.equal(finer.lanes.kick, 'X.......x.......X.......x.......');
    assert.equal(drums.setSteps(part(), 7), part(), 'not a grid a bar can have');
    assert.equal(drums.setKit(part(), 'lofi').kit, 'lofi');
    assert.equal(drums.setKit(part(), 'tin cans'), part());
  });
});

describe('named beats', () => {
  const part = () => partOf(song(), 'd');

  it('replaces the lanes with a beat in every bar and names the part after it', () => {
    assert.equal(beatChoices().length, Object.keys(BEATS).length);
    const two = { ...part(), bars: 2 };
    const beat = applyBeat(two, 'trap');
    assert.equal(beat.steps, 32);
    assert.equal(beat.lanes.clap, BEATS.trap.lanes.clap.repeat(2));
    assert.equal(beat.name, 'Trap');
    assert.equal(applyBeat({ ...two, name: 'My kit' }, 'bossa').name, 'My kit');
    assert.equal(applyBeat(two, 'polka'), two);
  });

  it('finds the beat of a part again by name, else by its lanes', () => {
    assert.equal(beatOf(applyBeat(part(), 'boomBap')), 'boomBap');
    assert.equal(beatOf({ ...applyBeat(part(), 'breakbeat'), name: 'Break' }), 'breakbeat');
    assert.equal(beatOf({ ...part(), lanes: {} }), 'backbeat');
  });

  it('writes the fill into the last bar, giving a one-bar loop four bars first', () => {
    const filled = addFill(song(), applyBeat(part(), 'backbeat'));
    assert.equal(filled.bars, 4);
    const { lanes, fill } = BEATS.backbeat;
    assert.equal(filled.lanes.snare, lanes.snare.repeat(3) + fill.snare);
    assert.equal(filled.lanes.tomLow, '.'.repeat(48) + fill.tomLow);
    assert.equal(
      filled.lanes.hat,
      lanes.hat.repeat(4),
      'a drum the fill does not name keeps its bar',
    );
    const two = addFill(song(), { ...applyBeat(part(), 'backbeat'), bars: 2, lanes: {} });
    assert.equal(two.bars, 2);
    assert.equal(two.lanes.kick, '.'.repeat(16) + fill.kick);
    assert.equal(validateSong({ parts: [filled] }).problems.length, 0);
  });
});
