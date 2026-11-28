import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deepFreeze } from '#utils/edl/testkit.js';
import { createRenderer, normalizeSong, songKey, songSeconds, validateSong } from './index.js';

/** Everything a hostile or broken document might put where a value belongs. */
const NASTY = [
  ...[
    null,
    undefined,
    NaN,
    Infinity,
    -Infinity,
    -0,
    1e308,
    -1e308,
    2 ** 53,
    '',
    ' ',
    '1e999',
    '0x10',
  ],
  ...[
    true,
    false,
    [],
    [[]],
    {},
    { length: 5 },
    () => 1,
    Symbol('s'),
    10n,
    new Date(0),
    /x/,
    new Map(),
  ],
  ...['__proto__', 'constructor', '\u0000', '💥'.repeat(1000), 'x'.repeat(100000)],
];

/** A song with one value everywhere a value can be. */
function riddled(value) {
  const part = {
    ...{
      id: value,
      name: value,
      kind: value,
      mute: value,
      volume: value,
      pan: value,
      reverb: value,
    },
    ...{ delay: value, bars: value, play: value, kit: value, steps: value, lanes: value },
    ...{ preset: value, params: value, transpose: value, notes: value },
  };
  return {
    ...{ bpm: value, beatsPerBar: value, bars: value, swing: value, key: value, scale: value },
    tail: value,
    master: {
      volume: value,
      reverb: { size: value, decay: value },
      delay: { beats: value, feedback: value },
    },
    parts: [
      part,
      {
        ...part,
        kind: 'drums',
        lanes: { kick: value, [String(value)]: 'x' },
        play: [[value, value], value],
      },
      {
        ...part,
        kind: 'synth',
        params: { cutoff: value, osc1Wave: value },
        notes: [[value, value, value, value], value],
      },
      value,
    ],
  };
}

/** True for plain, finite, JSON-safe data. */
function plain(value) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(plain);
  return Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(plain);
}

describe('normalizeSong and hostile input', () => {
  it('never throws, and always answers with a complete, plain, valid song', () => {
    for (const value of NASTY) {
      for (const raw of [
        value,
        riddled(value),
        { parts: value },
        { master: value },
        { parts: [value, [value]] },
      ]) {
        const song = normalizeSong(raw);
        assert.ok(plain(song), `plain data for ${String(value).slice(0, 20)}`);
        assert.deepEqual(normalizeSong(song), song);
        assert.deepEqual(validateSong(song), { valid: true, problems: [] });
        assert.ok(songSeconds(raw) > 0 && songSeconds(raw) <= 1200);
        assert.match(songKey(raw), /^[0-9a-f]{20}$/);
        assert.ok(Array.isArray(validateSong(raw).problems));
      }
    }
  });

  it('never changes what it is given', () => {
    for (const value of [0.5, 'x', [1, 2], { a: 1 }]) {
      const raw = deepFreeze(riddled(value));
      assert.doesNotThrow(() => normalizeSong(raw));
    }
  });

  it('reads nothing from prototypes and copies no dangerous keys', () => {
    const inherited = Object.create({ bpm: 200, parts: [{ kind: 'drums', lanes: { kick: 'X' } }] });
    assert.deepEqual(
      normalizeSong(inherited),
      normalizeSong({}),
      'an object with a prototype is not a song',
    );
    const raw = JSON.parse(
      '{"__proto__": {"bpm": 200}, "constructor": 1, "parts": [{"lanes": {"__proto__": "x", "kick": "X"},' +
        ' "params": {"__proto__": {"cutoff": 50}, "constructor": 5}}], "master": {"__proto__": {"volume": 0}}}',
    );
    const song = normalizeSong(raw);
    assert.equal(song.bpm, 120);
    assert.equal(song.master.volume, 0.8);
    assert.deepEqual(Object.keys(song.parts[0].lanes), ['kick']);
    assert.equal({}.bpm, undefined, 'nothing was written to Object.prototype');
  });

  it('survives getters that throw and objects that are not what they seem', () => {
    const trap = new Proxy(
      {},
      {
        get: () => {
          throw new Error('trap');
        },
        ownKeys: () => {
          throw new Error('trap');
        },
      },
    );
    const getter = Object.defineProperty({}, 'bpm', {
      enumerable: true,
      get: () => {
        throw new Error('getter');
      },
    });
    class Song {
      bpm = 200;
    }
    for (const raw of [new Song(), { parts: [new Song()] }, { master: new Song() }]) {
      assert.equal(normalizeSong(raw).bpm, 120, 'class instances are not read');
    }
    // A plain object whose getter throws is the one thing that can make reading fail: it must not hang.
    for (const raw of [trap, getter]) {
      try {
        assert.ok(plain(normalizeSong(raw)));
      } catch (error) {
        assert.match(String(error.message), /trap|getter/);
      }
    }
  });

  it('is not slowed down by size: huge lists are looked at only as far as they can matter', () => {
    const cycle = {};
    cycle.self = cycle;
    cycle.parts = [cycle];
    const notes = Array.from({ length: 300000 }, (_, i) => [i % 4, 1, 60 + (i % 12), 0.5]);
    const huge = {
      parts: [...Array.from({ length: 5000 }, () => ({ kind: 'synth', notes })), cycle],
      master: cycle,
    };
    const started = Date.now();
    const song = normalizeSong(huge);
    assert.ok(Date.now() - started < 4000, `took ${Date.now() - started} ms`);
    assert.equal(song.parts.length, 16);
    assert.ok(song.parts.every((part) => part.notes.length <= 4000));
    const long = normalizeSong({ parts: [{ lanes: { kick: 'x'.repeat(5e6) } }] });
    assert.ok(long.parts[0].lanes.kick.length <= 512 * 32);
  });

  it('a hostile song still renders: the engine takes anything the normaliser lets through', () => {
    for (const value of [1e308, -1, 'x', [], null]) {
      const renderer = createRenderer({ ...riddled(value), bars: 1, tail: 0.1, bpm: 240 });
      const samples = renderer.render();
      assert.ok(samples.every((x) => Number.isFinite(x) && Math.abs(x) <= 1));
    }
  });
});
