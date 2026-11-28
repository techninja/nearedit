import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRUMS,
  DRUM_NAMES,
  KITS,
  LANE_VELOCITIES,
  PRESETS,
  PRESET_CATEGORIES,
  SYNTH_PARAMS,
  encodeWav,
  fitLane,
  isSilentLane,
  laneFromVelocities,
  laneLength,
  laneVelocities,
  partLabel,
  partParams,
  pcm16,
  presetParams,
  songLabel,
  validateSong,
  wavHeader,
} from './index.js';

describe('drum lanes as strings', () => {
  it('fitLane: exactly as many steps as asked for, only the four characters', () => {
    assert.equal(fitLane('X...x', 8), 'X...x...');
    assert.equal(fitLane('X...x...X...x...', 8), 'X...x...');
    assert.equal(fitLane('X.o.|x-_q|9X', 12), 'X.o.x....X..');
    assert.equal(fitLane(' X . x ', 4), 'X.x.');
    assert.equal(fitLane(null, 3), '...');
    assert.equal(fitLane('', 0), '');
  });

  it('velocities and back', () => {
    assert.deepEqual(laneVelocities('.oxX'), [0, 0.4, 0.75, 1]);
    assert.deepEqual(LANE_VELOCITIES, { '.': 0, o: 0.4, x: 0.75, X: 1 });
    assert.equal(laneFromVelocities([0, 0.4, 0.75, 1]), '.oxX');
    assert.equal(laneFromVelocities([-1, 0.01, 0.57, 0.58, 0.87, 0.88, 5, NaN]), '.ooxxXX.');
    assert.equal(laneFromVelocities(laneVelocities('X..x.o.X')), 'X..x.o.X');
    assert.equal(laneFromVelocities('nope'), '');
    assert.equal(laneLength('X...|x... '), 8);
    assert.ok(isSilentLane('....') && isSilentLane('') && isSilentLane(7) && !isSilentLane('...o'));
  });
});

describe('the catalogs', () => {
  it('every kit has the thirteen drums, each with settings the engine can read', () => {
    assert.deepEqual(Object.keys(KITS), ['808', '909', 'acoustic', 'lofi']);
    assert.equal(DRUMS.length, 13);
    assert.deepEqual(
      DRUMS.map((drum) => drum.name),
      [...DRUM_NAMES],
    );
    assert.equal(new Set(DRUMS.map((drum) => drum.gm)).size, 13);
    for (const [name, kit] of Object.entries(KITS)) {
      assert.equal(kit.name, name);
      assert.ok(kit.label && kit.description);
      assert.deepEqual(Object.keys(kit.drums), [...DRUM_NAMES]);
      for (const drum of Object.values(kit.drums)) {
        assert.ok(drum.level > 0 && Math.abs(drum.pan) <= 1 && drum.tones.length <= 2);
        assert.ok(drum.tones.length || drum.noise || drum.metal, 'it makes a sound');
        assert.ok(!drum.metal || drum.metal.freqs.length <= 6);
        assert.ok(Object.isFrozen(drum) && Object.isFrozen(drum.tones));
      }
    }
  });

  it('every synth parameter is a number or a choice, with a label, a group and a default in range', () => {
    for (const [name, spec] of Object.entries(SYNTH_PARAMS)) {
      assert.ok(spec.label && spec.group, name);
      if (spec.type === 'number') {
        assert.ok(
          spec.min < spec.max &&
            spec.step > 0 &&
            spec.default >= spec.min &&
            spec.default <= spec.max,
          name,
        );
      } else {
        assert.equal(spec.type, 'select', name);
        assert.ok(spec.options.includes(spec.default), name);
      }
    }
    assert.ok(Object.keys(SYNTH_PARAMS).length >= 30);
  });

  it('every preset names itself, has a category, and sets only parameters that exist, in range', () => {
    assert.deepEqual(Object.keys(PRESETS), [
      'bass',
      'sub',
      'acid',
      'pluck',
      'keys',
      'organ',
      'pad',
      'strings',
      'lead',
      'bell',
      'arp',
    ]);
    for (const [name, preset] of Object.entries(PRESETS)) {
      assert.equal(preset.name, name);
      assert.ok(preset.label && preset.description && PRESET_CATEGORIES.includes(preset.category));
      const part = { kind: 'synth', preset: name, params: preset.params };
      assert.deepEqual(validateSong({ parts: [part] }).problems, [], name);
      assert.deepEqual(partParams({ preset: name }), presetParams(name));
      assert.equal(Object.keys(presetParams(name)).length, Object.keys(SYNTH_PARAMS).length);
    }
    assert.equal(
      partParams({ preset: 'bass', params: { cutoff: 5, voices: '3', osc1Wave: 'x' } }).cutoff,
      20,
    );
    assert.equal(partParams({ preset: 'bass', params: { voices: '3' } }).voices, 3);
    assert.equal(
      partParams({ preset: 'bass', params: { osc1Wave: 'x' } }).osc1Wave,
      'saw',
      "an unusable value is the preset's",
    );
    assert.deepEqual(presetParams('nope'), presetParams('keys'));
  });

  it('labels: a part by its name, else its kit or preset; a song by its parts', () => {
    assert.equal(partLabel({ kind: 'drums', kit: '909' }), '909 drums');
    assert.equal(partLabel({ kind: 'synth', preset: 'strings' }), 'Strings');
    assert.equal(partLabel({ kind: 'synth', name: ' Hook ' }), 'Hook');
    assert.equal(partLabel(null), 'Keys');
    assert.equal(songLabel({}), 'Music');
    assert.equal(
      songLabel({
        parts: [
          { kind: 'drums' },
          { kind: 'synth', preset: 'bass' },
          { kind: 'synth', preset: 'bass' },
        ],
      }),
      '808 drums, Bass',
    );
    const many = {
      parts: ['pad', 'strings', 'lead', 'bell', 'arp', 'organ'].map((preset) => ({
        kind: 'synth',
        preset,
      })),
    };
    assert.equal(songLabel(many), 'Pad, Strings, Lead, Bell, Arp, Organ');
    assert.equal(songLabel(many, 20), 'Pad, Strings, Lead…');
  });
});

describe('WAV', () => {
  it('pcm16: little-endian, rounded to the nearest, clipped, never a NaN', () => {
    const bytes = pcm16(
      Float32Array.of(0, 1, -1, 0.5, -0.5, 2, -2, NaN, 1 / 32767, 0.4 / 32767, 0.6 / 32767),
    );
    const view = new DataView(bytes.buffer);
    const values = Array.from({ length: 11 }, (_, i) => view.getInt16(i * 2, true));
    assert.deepEqual(values, [0, 32767, -32767, 16384, -16383, 32767, -32767, 0, 1, 0, 1]);
    assert.deepEqual([...pcm16([0.25])], [0x00, 0x20]);
  });

  it('a header that says what follows; a whole file from chunks', () => {
    const header = wavHeader(48000, 48000);
    const view = new DataView(header.buffer);
    const word = (at) => String.fromCharCode(...header.subarray(at, at + 4));
    assert.deepEqual([word(0), word(8), word(12), word(36)], ['RIFF', 'WAVE', 'fmt ', 'data']);
    assert.deepEqual(
      [
        view.getUint32(4, true),
        view.getUint16(20, true),
        view.getUint16(22, true),
        view.getUint32(24, true),
      ],
      [36 + 192000, 1, 2, 48000],
    );
    assert.deepEqual(
      [
        view.getUint32(28, true),
        view.getUint16(32, true),
        view.getUint16(34, true),
        view.getUint32(40, true),
      ],
      [192000, 4, 16, 192000],
    );
    const chunks = [Float32Array.of(0.5, -0.5), Float32Array.of(1, -1, 0, 0)];
    const file = encodeWav(chunks, 44100);
    assert.equal(file.length, 44 + 12);
    assert.deepEqual(file.subarray(0, 44), wavHeader(3, 44100));
    assert.deepEqual(file.subarray(44), pcm16(Float32Array.of(0.5, -0.5, 1, -1, 0, 0)));
    assert.deepEqual(
      encodeWav(Float32Array.of(0.5, -0.5)),
      encodeWav([Float32Array.of(0.5, -0.5)], 48000),
    );
    assert.equal(encodeWav([]).length, 44);
  });
});
