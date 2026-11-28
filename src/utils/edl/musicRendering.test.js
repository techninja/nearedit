import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSong, songKey, songSeconds } from '#utils/music/index.js';
import {
  clipKind,
  insertMusicClip,
  isStaleMusic,
  newClipIds,
  setMusicRendering,
  splitClips,
  staleMusicClips,
  updateSong,
} from './index.js';
import { assertValid, clipOf, deepFreeze, layout, testClip, testEdl } from './testkit.js';

/** Four bars at 120 BPM and a two-second tail: ten seconds. */
const SONG = {
  bars: 4,
  parts: [
    { kind: 'drums', kit: '909', lanes: { kick: 'X...x...X...x...' } },
    { kind: 'synth', preset: 'bass', notes: [[0, 1, 33, 0.9]] },
  ],
};
const KEY = songKey(SONG);
const FILE = `/project/.nearedit/music/${KEY}.wav`;
/** A song whose length is no whole number of frames: 11.8969… s, 356 frames at 30 fps. */
const ODD = { ...SONG, bpm: 97 };

/** A document with one music clip; returns it with the clip's id. */
function withMusic(song = SONG, opts = {}, base = testEdl()) {
  const edl = deepFreeze(insertMusicClip(base, song, opts));
  const [id] = newClipIds(base, edl);
  return { edl, id };
}

/** The same, rendered. */
function rendered(song = SONG) {
  const { edl, id } = withMusic(song);
  const result = { file: FILE, key: songKey(song), duration: songSeconds(song) };
  return { edl: deepFreeze(setMusicRendering(edl, id, result)), id };
}

describe('setMusicRendering', () => {
  it('points the clip at the rendering and makes it an audio clip', () => {
    const { edl, id } = rendered();
    const clip = clipOf(edl, id);
    assertValid(edl);
    assert.deepEqual([clip.sourceFile, clip.placeholder], [FILE, false]);
    assert.deepEqual(clip.music, { song: normalizeSong(SONG), key: KEY });
    assert.equal(clipKind(clip, edl.tracks[1]), 'audio');
    assert.deepEqual([clip.sourceIn, clip.sourceOut, clip.timelineEnd], [0, 10, 10]);
    assert.equal(isStaleMusic(clip), false);
    assert.deepEqual(staleMusicClips(edl), []);
  });

  it('leaves a trimmed window alone, and each half its own clip', () => {
    const { edl, id } = withMusic();
    const halves = splitClips(edl, 3);
    const [rightId] = newClipIds(edl, halves);
    const done = setMusicRendering(halves, rightId, { file: FILE, key: KEY, duration: 10 });
    assertValid(done);
    assert.deepEqual([clipOf(done, rightId).sourceIn, clipOf(done, rightId).sourceOut], [3, 10]);
    assert.equal(clipOf(done, id).sourceFile, '');
  });

  it('plays a rendering of an earlier song without losing the length of the new one', () => {
    const { edl, id } = withMusic();
    const longer = { ...SONG, tail: 6 };
    const edited = updateSong(edl, id, longer);
    const late = setMusicRendering(edited, id, { file: FILE, key: KEY, duration: 10 });
    assertValid(late);
    assert.equal(clipOf(late, id).timelineEnd, 14, 'still the whole of the new song');
    assert.equal(isStaleMusic(clipOf(late, id)), true);
    const key = songKey(longer);
    const fresh = setMusicRendering(late, id, { file: `/p/${key}.wav`, key, duration: 14 });
    assertValid(fresh);
    assert.equal(isStaleMusic(clipOf(fresh, id)), false);
    assert.deepEqual(layout(fresh).a1, [`${id} 0-14`]);
  });

  it('never lets the window pass the song, whatever duration is reported', () => {
    for (const song of [SONG, ODD]) {
      const { edl, id } = withMusic(song);
      const length = songSeconds(song);
      for (const duration of [length + 5, length, length - 1e-5, length - 1, 0.01]) {
        const done = setMusicRendering(edl, id, { file: FILE, key: songKey(song), duration });
        assertValid(done);
        assert.ok(clipOf(done, id).sourceOut <= length + 1e-9);
      }
      const exact = setMusicRendering(edl, id, {
        file: FILE,
        key: songKey(song),
        duration: length,
      });
      assert.equal(
        clipOf(exact, id).timelineEnd,
        clipOf(edl, id).timelineEnd,
        'a whole clip stays whole',
      );
    }
  });

  it('changes nothing without a file, a key and a duration, or twice', () => {
    const { edl, id } = withMusic();
    const ok = { file: FILE, key: KEY, duration: 10 };
    for (const bad of [
      { file: '' },
      { key: 'xyz' },
      { key: '' },
      { duration: 0 },
      { duration: NaN },
    ]) {
      assert.equal(setMusicRendering(edl, id, { ...ok, ...bad }), edl);
    }
    for (const [clipId, result] of [
      [id, null],
      ['nope', ok],
    ])
      assert.equal(setMusicRendering(edl, clipId, result), edl);
    const once = setMusicRendering(edl, id, ok);
    assert.equal(setMusicRendering(once, id, ok), once);
    const plain = testEdl({ a1: [testClip('a', 0, 5)] });
    assert.equal(setMusicRendering(plain, 'a', ok), plain);
  });
});
