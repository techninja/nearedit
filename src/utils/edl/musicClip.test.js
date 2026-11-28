import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { drumPart, normalizeSong, songKey, songSeconds } from '#utils/music/index.js';
import {
  clipKind,
  insertMusicClip,
  isMusicClip,
  isStaleMusic,
  musicClips,
  musicDuration,
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

describe('insertMusicClip', () => {
  it('adds a placeholder as long as the song on an audio track, carrying the normalised song', () => {
    const { edl, id } = withMusic(SONG, { time: 2 });
    const clip = clipOf(edl, id);
    assertValid(edl);
    assert.deepEqual(layout(edl), { v1: [], a1: [`${id} 2-12`] });
    assert.deepEqual([clip.sourceIn, clip.sourceOut], [0, 10]);
    assert.deepEqual(clip.music, { song: normalizeSong(SONG), key: '' });
    assert.equal(clip.label, '909 drums, Bass');
    assert.deepEqual([clip.placeholder, clip.sourceFile, clip.intent], [true, '', 'music']);
    assert.equal(clipKind(clip, edl.tracks[1]), 'placeholder');
    assert.ok(isMusicClip(clip) && isStaleMusic(clip));
    assert.ok(!('web' in clip));
  });

  it('takes the first audio track that is free there and unlocked, else makes a new one', () => {
    const base = testEdl({ a1: [testClip('talk', 0, 20)], a2: [testClip('late', 30, 40)], a3: [] });
    const { edl, id } = withMusic(SONG, { time: 5 }, base);
    assertValid(edl);
    assert.deepEqual(layout(edl), {
      v1: [],
      a1: ['talk 0-20'],
      a2: [`${id} 5-15`, 'late 30-40'],
      a3: [],
    });
    const busy = testEdl({ a1: [testClip('talk', 0, 20)], a2: [testClip('bed', 0, 20)] });
    const made = withMusic(SONG, { time: 5 }, busy);
    assert.equal(made.edl.tracks.length, 4, 'a new audio track, at the bottom');
    assert.deepEqual(
      made.edl.tracks[3].clips.map((clip) => clip.clipId),
      [made.id],
    );
    assert.deepEqual(layout(made.edl).a1, ['talk 0-20'], 'what was there is left alone');
    const locked = {
      ...testEdl(),
      tracks: testEdl().tracks.map((track) => ({ ...track, locked: true })),
    };
    const beside = insertMusicClip(locked, SONG);
    assert.equal(beside.tracks.length, 3);
    assert.equal(musicClips(beside)[0].track, beside.tracks[2]);
  });

  it('goes to the track it is told, under the normal overlap rules', () => {
    const base = testEdl({ a1: [testClip('talk', 0, 8)], a2: [] });
    const { edl, id } = withMusic(SONG, { time: 6, trackId: 'a1', label: 'Score' }, base);
    assertValid(edl);
    assert.deepEqual(layout(edl).a1, ['talk 0-8', `${id} 6-16`]);
    assert.ok(Math.abs(clipOf(edl, id).fadeIn - 2) < 1e-9, 'a cross-fade');
    assert.equal(clipOf(edl, id).label, 'Score');
    const cut = insertMusicClip(base, SONG, { time: 6, trackId: 'a1', autoCrossfade: false });
    assert.deepEqual(layout(cut).a1[0], 'talk 0-6');
    const video = insertMusicClip(base, SONG, { trackId: 'v1' });
    assert.deepEqual(layout(video).v1, [], 'never on a video track');
    assert.equal(layout(video).a1.length + layout(video).a2.length, 2);
  });

  it('shows whole frames of a song whose length is between two', () => {
    for (const fps of [24, 25, 30, 60]) {
      const base = testEdl({}, { fps });
      const edl = insertMusicClip(base, ODD, { time: 1 / 3 });
      const clip = clipOf(edl, newClipIds(base, edl)[0]);
      assertValid(edl);
      const frames = (clip.timelineEnd - clip.timelineStart) * fps;
      assert.ok(
        Math.abs(frames - Math.floor(songSeconds(ODD) * fps)) < 1e-6,
        `${fps} fps: ${frames} frames`,
      );
      assert.ok(clip.sourceOut <= musicDuration(clip) + 1e-9, 'never more than there is');
    }
  });

  it('takes anything for a song: what is not one is the empty song', () => {
    for (const song of [{}, null, 'tune', 7, []]) {
      const { edl, id } = withMusic(song);
      assertValid(edl);
      assert.deepEqual(clipOf(edl, id).music.song, normalizeSong({}));
      assert.deepEqual([clipOf(edl, id).timelineEnd, clipOf(edl, id).label], [10, 'Music']);
    }
  });
});

describe('updateSong', () => {
  const longer = { ...SONG, bars: 8 };
  const shorter = { ...SONG, bars: 1 };

  it('a clip that showed the whole song follows the new one', () => {
    const { edl, id } = withMusic(SONG, { time: 1 });
    const grown = updateSong(edl, id, longer);
    assertValid(grown);
    assert.deepEqual(layout(grown).a1, [`${id} 1-19`]);
    assert.deepEqual(clipOf(grown, id).music.song, normalizeSong(longer));
    const cut = updateSong(grown, id, shorter);
    assertValid(cut);
    assert.deepEqual(layout(cut).a1, [`${id} 1-5`]);
    assert.deepEqual([clipOf(cut, id).sourceIn, clipOf(cut, id).sourceOut], [0, 4]);
  });

  it('follows from one odd length to another, again and again', () => {
    const placed = withMusic(ODD);
    const { id } = placed;
    let { edl } = placed;
    for (const bpm of [101, 83, 97.3, 140, 61]) {
      edl = updateSong(edl, id, (song) => ({ ...song, bpm }));
      assertValid(edl);
      const clip = clipOf(edl, id);
      const whole = Math.floor(musicDuration(clip) * 30 + 1e-6) / 30;
      assert.ok(
        Math.abs(clip.timelineEnd - whole) < 1e-9,
        `${bpm} BPM: ${clip.timelineEnd} of ${whole}`,
      );
    }
  });

  it('a trimmed clip keeps its window, brought inside the new song', () => {
    const { edl, id } = withMusic();
    const halves = deepFreeze(splitClips(edl, 3));
    const [rightId] = newClipIds(edl, halves);
    const left = updateSong(halves, id, longer);
    assert.deepEqual(layout(left).a1[0], `${id} 0-3`, 'the left part keeps its three seconds');
    const right = updateSong(halves, rightId, shorter);
    assertValid(right);
    const clip = clipOf(right, rightId);
    assert.ok(clip.sourceOut <= 4 + 1e-9 && clip.sourceIn >= 0 && clip.timelineStart === 3);
  });

  it('keeps the old rendering and its key, so the clip is stale, not empty', () => {
    const { edl, id } = rendered();
    assert.equal(isStaleMusic(clipOf(edl, id)), false);
    const changed = updateSong(edl, id, longer);
    const clip = clipOf(changed, id);
    assertValid(changed);
    assert.deepEqual([clip.sourceFile, clip.music.key, clip.placeholder], [FILE, KEY, false]);
    assert.equal(isStaleMusic(clip), true);
    assert.equal(clip.timelineEnd, 18, 'the length already follows the new song');
    assert.deepEqual(
      staleMusicClips(changed).map((ref) => ref.clip.clipId),
      [id],
    );
  });

  it('takes a function of the current song', () => {
    const { edl, id } = withMusic();
    const swung = updateSong(edl, id, (song) => ({
      ...song,
      swing: 0.3,
      parts: [...song.parts, drumPart('bossa')],
    }));
    assert.equal(clipOf(swung, id).music.song.swing, 0.3);
    assert.equal(clipOf(swung, id).music.song.parts.length, 3);
    assert.deepEqual(layout(swung), layout(edl));
  });

  it('returns the same document when nothing changes or nothing can', () => {
    const { edl, id } = withMusic();
    assert.equal(updateSong(edl, id, SONG), edl);
    assert.equal(updateSong(edl, id, normalizeSong(SONG)), edl);
    assert.equal(
      updateSong(edl, id, (song) => song),
      edl,
    );
    assert.equal(updateSong(edl, 'nope', longer), edl);
    const plain = testEdl({ a1: [testClip('a', 0, 5)] });
    assert.equal(updateSong(plain, 'a', longer), plain, 'not a music clip');
    const locked = { ...edl, tracks: edl.tracks.map((track) => ({ ...track, locked: true })) };
    assert.equal(updateSong(locked, id, longer), locked);
  });

  it('a clip that grows over its neighbour behaves like a trimmed one', () => {
    const base = testEdl({ a1: [testClip('next', 12, 30)] });
    const { edl, id } = withMusic(SONG, { trackId: 'a1' }, base);
    const faded = updateSong(edl, id, longer);
    assertValid(faded);
    assert.deepEqual(layout(faded).a1, [`${id} 0-18`, 'next 12-30']);
    assert.ok(Math.abs(clipOf(faded, id).fadeOut - 6) < 1e-9, 'a cross-fade');
    const cut = updateSong(edl, id, longer, { autoCrossfade: false });
    assertValid(cut);
    assert.deepEqual(layout(cut).a1, [`${id} 0-18`, 'next 18-30']);
  });
});
