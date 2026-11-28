import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseMidi } from './index.js';
import { END, file, tempo, text, track, u32 } from './testkit.js';

describe('parseMidi', () => {
  it('reads a format 0 file: tempo, time signature, notes with their lengths', () => {
    const midi = parseMidi(
      file(0, 96, [
        track([
          tempo(100),
          [0, 0xff, 0x58, 4, 6, 3, 24, 8],
          [0, 0xff, 0x03, 4, ...text('Lead')],
          [0, 0xc0, 81],
          [0, 0x90, 60, 100],
          [96, 0x80, 60, 0],
          [0, 0x90, 64, 50],
          [48, 0x80, 64, 64],
          END,
        ]),
      ]),
    );
    assert.deepEqual(
      [midi.format, midi.division, midi.tracks, midi.warnings],
      [0, 96, [{ name: 'Lead' }], []],
    );
    assert.deepEqual(midi.tempos, [{ tick: 0, bpm: 100 }]);
    assert.deepEqual(midi.signatures, [{ tick: 0, numerator: 6, denominator: 8 }]);
    assert.deepEqual(midi.notes, [
      { track: 0, channel: 0, pitch: 60, velocity: 100, tick: 0, ticks: 96, program: 81 },
      { track: 0, channel: 0, pitch: 64, velocity: 50, tick: 96, ticks: 48, program: 81 },
    ]);
  });

  it('follows running status, and takes a note-on with velocity 0 as the end of a note', () => {
    const midi = parseMidi(
      file(0, 480, [
        track([
          [0, 0x93, 60, 90],
          [240, 60, 0],
          [0, 62, 80],
          [240, 62, 0],
          [0, 64, 70],
          [480, 64, 0],
          END,
        ]),
      ]),
    );
    assert.deepEqual(
      midi.notes.map((n) => [n.channel, n.pitch, n.velocity, n.tick, n.ticks]),
      [
        [3, 60, 90, 0, 240],
        [3, 62, 80, 240, 240],
        [3, 64, 70, 480, 480],
      ],
    );
  });

  it('reads the tracks of a format 1 file side by side, long deltas and all', () => {
    const midi = parseMidi(
      file(1, 480, [
        track([tempo(140), [1920, 0xff, 0x51, 3, 0x07, 0xa1, 0x20], END]),
        track([
          [0, 0xff, 0x03, 4, ...text('Bass')],
          [0, 0xc1, 38],
          [1920, 0x91, 36, 127],
          [960, 0x81, 36, 0],
          END,
        ]),
        track([
          [0, 0x99, 36, 110],
          [120, 0x89, 36, 0],
          [16384, 0x99, 38, 90],
          [10, 0x89, 38, 0],
          END,
        ]),
      ]),
    );
    assert.equal(midi.tracks.length, 3);
    assert.deepEqual(
      midi.tempos.map((t) => Math.round(t.bpm)),
      [140, 120],
    );
    assert.deepEqual(
      midi.notes.map((n) => [n.track, n.channel, n.pitch, n.tick, n.ticks, n.program]),
      [
        [2, 9, 36, 0, 120, 0],
        [1, 1, 36, 1920, 960, 38],
        [2, 9, 38, 16504, 10, 0],
      ],
    );
  });

  it('pairs repeated notes first in, first out, and ends a note that is never let go', () => {
    const midi = parseMidi(
      file(0, 100, [
        track([
          [0, 0x90, 60, 100],
          [50, 0x90, 60, 90],
          [50, 0x80, 60, 0],
          [100, 0x80, 60, 0],
          [0, 0x90, 72, 60],
          [300, ...END.slice(1)],
        ]),
      ]),
    );
    assert.deepEqual(
      midi.notes.map((n) => [n.pitch, n.tick, n.ticks]),
      [
        [60, 0, 100],
        [60, 50, 150],
        [72, 200, 300],
      ],
    );
  });

  it('steps over what it does not need: sysex, controllers, pitch bend, unknown chunks, stray bytes', () => {
    const noisy = track([
      [0, 0xf0, 3, 1, 2, 0xf7],
      [0, 0xb0, 7, 100],
      [0, 0xe0, 0, 64],
      [0, 0xd0, 50],
      [0, 0xa0, 60, 9],
      [0, 0xff, 0x7f, 2, 9, 9],
      [0, 0xf2, 1, 2],
      [0, 0xf8],
      [0, 0x90, 60, 100],
      [10, 0x80, 60, 0],
      END,
    ]);
    const junk = [...text('XFIH'), ...u32(3), 1, 2, 3];
    const bytes = Uint8Array.from([
      9,
      9,
      9,
      ...file(1, 480, [noisy]).slice(0, 14),
      ...junk,
      ...noisy,
    ]);
    const midi = parseMidi(bytes);
    assert.deepEqual(
      midi.notes.map((n) => [n.pitch, n.tick, n.ticks]),
      [[60, 0, 10]],
    );
    const stray = parseMidi(
      file(0, 480, [track([[0, 5, 5], [0, 0x90, 60, 100], [10, 0x80, 60, 0], END])]),
    );
    assert.equal(stray.notes.length, 1, 'data bytes before any status are skipped');
  });

  it('takes what it can from a damaged file, and never throws', () => {
    const whole = file(1, 480, [
      track([tempo(120), END]),
      track([[0, 0x90, 60, 100], [480, 0x80, 60, 0], [0, 0x90, 62, 100], [480, 0x80, 62, 0], END]),
    ]);
    for (let length = 0; length <= whole.length; length++) {
      const midi = parseMidi(whole.subarray(0, length));
      assert.ok(
        midi === null || (Array.isArray(midi.notes) && midi.notes.every((n) => n.ticks >= 1)),
        `cut at ${length}`,
      );
    }
    assert.match(parseMidi(whole.subarray(0, whole.length - 6)).warnings.join(), /cut short/);
    for (const junk of [
      null,
      undefined,
      'MThd',
      5,
      {},
      [],
      new Uint8Array(0),
      new Uint8Array(1000),
      [77, 84, 104, 100],
    ]) {
      assert.equal(parseMidi(junk), null);
    }
    const garbage = Uint8Array.from({ length: 4000 }, (_, i) => (i * 7919 + 13) % 256);
    garbage.set(file(1, 480, []).subarray(0, 14), 100);
    garbage.set(text('MTrk'), 114);
    assert.doesNotThrow(() => parseMidi(garbage));
    assert.deepEqual(parseMidi(whole.buffer).notes.length, 2, 'an ArrayBuffer works too');
    assert.match(parseMidi(file(1, 0xe728, [])).warnings[0], /frames/);
  });
});
