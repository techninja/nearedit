import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  ENGINE_VERSION,
  KEY_PATTERN,
  canonicalSong,
  checkMusic,
  cleanMusic,
  isMusicClip,
  isStaleMusic,
  musicDuration,
  normalizeSong,
  refitSong,
  songKey,
} from './index.js';

const SONG = {
  bpm: 110,
  bars: 4,
  key: 'D',
  scale: 'dorian',
  parts: [
    {
      id: 'drums',
      name: 'Beat',
      kind: 'drums',
      kit: '909',
      lanes: { kick: 'X...x...', hat: 'x.x.x.x.' },
    },
    {
      id: 'bass',
      name: 'Low',
      kind: 'synth',
      preset: 'bass',
      notes: [
        [0, 1, 38, 0.9],
        [2, 1, 41, 0.8],
      ],
    },
  ],
};

describe('songKey', () => {
  it('is 20 hex digits of the SHA-256 of the engine version and the canonical song', () => {
    const key = songKey(SONG);
    assert.match(key, KEY_PATTERN);
    assert.equal(key.length, 20);
    assert.equal(ENGINE_VERSION, 1);
    assert.equal(
      songKey({}),
      'af87dc7050f2083d809e',
      'the empty song: this key must never change by accident',
    );
    const sorted = (value) => {
      if (Array.isArray(value)) return value.map(sorted);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((name) => [name, sorted(value[name])]),
      );
    };
    const text = `1\n${JSON.stringify(sorted(canonicalSong(SONG)))}`;
    assert.equal(key, createHash('sha256').update(text).digest('hex').slice(0, 20));
  });

  it('is the same for the same song however it is written', () => {
    const key = songKey(SONG);
    assert.equal(songKey(normalizeSong(SONG)), key);
    assert.equal(songKey(JSON.parse(JSON.stringify(SONG))), key);
    const shuffled = {
      parts: SONG.parts.map((part) => Object.fromEntries(Object.entries(part).reverse())),
      bars: 4,
      bpm: 110,
    };
    assert.equal(songKey(shuffled), key, 'field order');
    const spelled = structuredClone(SONG);
    spelled.parts[0].lanes = { kick: 'X...|x...|....|....', hat: 'x.x.x.x.' };
    spelled.parts[1].notes = [
      [2, 1, 'F2', 0.8],
      [0, 1, 'D2', 0.9],
    ];
    spelled.parts[1].params = { cutoff: 180 };
    assert.equal(
      songKey(spelled),
      key,
      'bar lines, note names, note order, a parameter at its preset value',
    );
  });

  it('ignores what cannot be heard: names, ids, the key and scale of the editor', () => {
    const renamed = structuredClone(SONG);
    Object.assign(renamed, { key: 'F#', scale: 'major' });
    Object.assign(renamed.parts[0], { id: 'x', name: 'Other' });
    Object.assign(renamed.parts[1], { id: 'y', name: '' });
    assert.equal(songKey(renamed), songKey(SONG));
    const canonical = canonicalSong(SONG);
    assert.ok(!('key' in canonical) && !('scale' in canonical));
    assert.ok(canonical.parts.every((part) => !('id' in part) && !('name' in part)));
  });

  it('changes with anything that can be heard, and with the engine', () => {
    const base = songKey(SONG);
    const changed = (edit) => {
      const song = structuredClone(SONG);
      edit(song);
      return songKey(song);
    };
    const edits = [
      (s) => (s.bpm = 111),
      (s) => (s.swing = 0.1),
      (s) => (s.tail = 3),
      (s) => (s.bars = 5),
      (s) => (s.master = { volume: 0.7 }),
      (s) => (s.master = { reverb: { decay: 0.6 } }),
      (s) => (s.parts[0].kit = '808'),
      (s) => (s.parts[0].lanes.kick = 'X...x..x'),
      (s) => (s.parts[0].mute = true),
      (s) => (s.parts[0].play = [[0, 2]]),
      (s) => (s.parts[1].preset = 'sub'),
      (s) => (s.parts[1].params = { cutoff: 181 }),
      (s) => (s.parts[1].notes[0][3] = 0.8),
      (s) => (s.parts[1].transpose = 1),
      (s) => (s.parts[1].pan = 0.1),
      (s) => s.parts.reverse(),
    ];
    const keys = edits.map(changed);
    assert.ok(keys.every((key) => key !== base));
    assert.equal(new Set(keys).size, keys.length, 'each change has a key of its own');
    assert.notEqual(songKey(SONG, 2), base);
    assert.equal(songKey(SONG, 1), base);
  });
});

describe("a clip's music block", () => {
  const music = { song: normalizeSong(SONG), key: songKey(SONG) };

  it('isMusicClip: a clip that carries a song', () => {
    assert.ok(isMusicClip({ music }));
    assert.ok(isMusicClip({ music: { song: {} } }), '{} is a song');
    for (const clip of [
      null,
      undefined,
      {},
      { music: null },
      { music: {} },
      { music: { song: 'x' } },
      { music: { song: [] } },
    ]) {
      assert.equal(isMusicClip(clip), false);
    }
  });

  it("musicDuration: the length of the song; isStaleMusic: the key is not its song's", () => {
    assert.equal(musicDuration({ music }), (4 * 4 * 60) / 110 + 2);
    assert.equal(musicDuration({}), undefined);
    assert.equal(isStaleMusic({ music }), false);
    assert.equal(isStaleMusic({ music: { ...music, key: '' } }), true, 'never rendered');
    assert.equal(
      isStaleMusic({ music: { ...music, key: songKey({}) } }),
      true,
      'rendered from another song',
    );
    assert.equal(
      isStaleMusic({ music: { song: normalizeSong({ ...SONG, bpm: 111 }), key: music.key } }),
      true,
    );
    assert.equal(isStaleMusic({}), false, 'not a music clip');
  });

  it('cleanMusic normalises the song and keeps a key that looks like one', () => {
    assert.deepEqual(cleanMusic({ song: SONG, key: music.key, extra: 1 }), music);
    assert.deepEqual(cleanMusic({ song: {} }), { song: normalizeSong({}), key: '' });
    assert.equal(cleanMusic({ song: {}, key: 'XYZ' }).key, '');
    assert.equal(cleanMusic({ song: {}, key: 5 }).key, '');
    for (const junk of [null, 'x', [], {}, { song: null }, { song: [] }, { key: music.key }]) {
      assert.equal(cleanMusic(junk), null);
    }
  });

  it('checkMusic accepts exactly what cleanMusic makes, and says where anything else differs', () => {
    const found = (value) => {
      const problems = [];
      checkMusic(value, 'clip.music', (path, message) => problems.push(`${path}: ${message}`));
      return problems;
    };
    assert.deepEqual(found(undefined), []);
    assert.deepEqual(found(music), []);
    assert.deepEqual(found({ song: normalizeSong({}), key: '' }), []);
    assert.deepEqual(found('x'), ['clip.music: must be an object']);
    assert.deepEqual(found({ ...music, title: 'x' }), [
      'clip.music.title: is not a field of a music clip',
    ]);
    assert.deepEqual(found({ ...music, key: 'abc' }), [
      "clip.music.key: must be '' or the 20 hex digits of a rendering's key",
    ]);
    assert.deepEqual(found({ key: '' }), ['clip.music.song: must be an object']);
    const loud = { ...music, song: { ...music.song, bpm: 999 } };
    assert.deepEqual(found(loud), [
      'clip.music.song.bpm: is not what a normalised song holds (see normalizeSong)',
    ]);
    assert.deepEqual(found({ song: {}, key: '' }), [
      'clip.music.song.bpm: is not what a normalised song holds (see normalizeSong)',
    ]);
    const extra = {
      ...music,
      song: { ...music.song, parts: [{ ...music.song.parts[0], wow: 1 }, music.song.parts[1]] },
    };
    assert.deepEqual(found(extra), [
      'clip.music.song.parts[0].wow: is not what a normalised song holds (see normalizeSong)',
    ]);
  });

  it('refitSong: a clip that showed the whole song follows it; a trimmed one keeps its window', () => {
    const clip = (sourceIn, sourceOut, start = 10) => ({
      sourceIn,
      sourceOut,
      timelineStart: start,
      timelineEnd: start + sourceOut - sourceIn,
    });
    // A song of 10.727 s is 321 whole frames at 30 fps: 10.7 s.
    assert.deepEqual(refitSong(clip(0, 10.7), 10.727, 20.5, 30), {
      sourceIn: 0,
      sourceOut: 20.5,
      timelineEnd: 30.5,
    });
    const grown = refitSong(clip(0, 10.7), 10.727, 19.4545, 30);
    assert.ok(Math.abs(grown.sourceOut - 583 / 30) < 1e-9, 'whole frames, never past the end');
    assert.ok(
      Math.abs(refitSong(clip(0, 10.7), 10.727, 5.01, 30).sourceOut - 5) < 1e-9,
      'a shorter song shortens it',
    );
    assert.deepEqual(refitSong(clip(2, 6), 10.727, 20, 30), {
      sourceIn: 2,
      sourceOut: 6,
      timelineEnd: 14,
    });
    assert.deepEqual(
      refitSong(clip(0, 6), 10.727, 20, 30),
      { sourceIn: 0, sourceOut: 6, timelineEnd: 16 },
      'trimmed at the end',
    );
    const cut = refitSong(clip(2, 9), 10.727, 5, 30);
    assert.ok(
      cut.sourceIn === 2 && Math.abs(cut.sourceOut - 5) < 1e-9,
      'brought inside a shorter song',
    );
    const beyond = refitSong(clip(8, 10), 10.727, 5, 30);
    assert.ok(beyond.sourceOut <= 5 + 1e-9 && beyond.sourceOut - beyond.sourceIn >= 1 / 30 - 1e-9);
  });
});
