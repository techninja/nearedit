import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSong, songKey } from '#utils/music/index.js';
import { recipeKey } from '#utils/web/index.js';
import {
  applyDirectorResult,
  copyClips,
  createClip,
  duplicateClips,
  fromSavedDocument,
  insertMusicClip,
  isMusicClip,
  isStaleMusic,
  isTimed,
  isWebClip,
  moveClips,
  musicClips,
  newClipIds,
  normalizeEdl,
  pasteClips,
  setMusicRendering,
  slipClip,
  splitClips,
  toSavedDocument,
  trimClipEnd,
  trimClipStart,
  updateClip,
  validateEdl,
} from './index.js';
import { assertValid, clipOf, deepFreeze, testClip, testEdl } from './testkit.js';

const SONG = { bars: 4, parts: [{ kind: 'drums', lanes: { kick: 'X...x...' } }] };
const KEY = songKey(SONG);
const FILE = `/project/.nearedit/music/${KEY}.wav`;
const RECIPE = { url: 'https://example.com', steps: [{ do: 'wait', duration: 3.4 }] };

/** A document with one rendered music clip of ten seconds; returns it with the clip's id. */
function rendered(base = testEdl()) {
  const placed = insertMusicClip(base, SONG);
  const [id] = newClipIds(base, placed);
  return {
    edl: deepFreeze(setMusicRendering(placed, id, { file: FILE, key: KEY, duration: 10 })),
    id,
  };
}
/** A raw clip as a document on disk might hold it. */
const rawClip = (fields = {}) => ({
  clipId: 'm',
  timelineStart: 0,
  timelineEnd: 10,
  music: { song: SONG },
  ...fields,
});
const rawDoc = (clip, type = 'audio') => ({
  version: 3,
  fps: 30,
  tracks: [
    { type: 'video', clips: [] },
    { type, clips: [clip] },
  ],
});
const loaded = (clip) => normalizeEdl(rawDoc(clip)).tracks[1].clips[0];
const problemsOf = (edl) =>
  validateEdl(edl).problems.map((problem) => `${problem.path}: ${problem.message}`);

describe('music clips through the other operations', () => {
  it('both halves of a split keep the song and the key', () => {
    const { edl, id } = rendered();
    const halves = splitClips(edl, 3);
    const [rightId] = newClipIds(edl, halves);
    assertValid(halves);
    const [left, right] = [clipOf(halves, id), clipOf(halves, rightId)];
    assert.equal(left.music, clipOf(edl, id).music, 'the very same block');
    assert.equal(right.music, left.music);
    assert.deepEqual(
      [left.sourceOut, right.sourceIn, right.sourceOut, right.sourceFile],
      [3, 3, 10, FILE],
    );
    assert.equal(musicClips(halves).length, 2);
    assert.ok(!isStaleMusic(left) && !isStaleMusic(right));
  });

  it('copy and paste, and duplicate, keep the music block', () => {
    const { edl, id } = rendered();
    const pasted = pasteClips(edl, JSON.parse(JSON.stringify(copyClips(edl, [id]))), { time: 20 });
    assertValid(pasted);
    const [copyId] = newClipIds(edl, pasted);
    assert.deepEqual(clipOf(pasted, copyId).music, clipOf(edl, id).music);
    assert.equal(clipOf(pasted, copyId).sourceFile, FILE);
    assert.equal(isStaleMusic(clipOf(pasted, copyId)), false);
    const twice = duplicateClips(edl, [id]);
    assertValid(twice);
    assert.equal(musicClips(twice).length, 2);
    assert.deepEqual(clipOf(twice, newClipIds(edl, twice)[0]).music, clipOf(edl, id).music);
  });

  it('a move keeps it; updateClip cannot write the song or the rendering', () => {
    const { edl, id } = rendered();
    assert.equal(clipOf(moveClips(edl, [id], { delta: 4 }), id).music, clipOf(edl, id).music);
    const patched = updateClip(edl, id, {
      ...{ label: 'Theme', volume: 0.5, sourceFile: '/etc/passwd', sourceIn: 99 },
      music: { song: { bpm: 200 }, key: '' },
      web: { recipe: RECIPE },
    });
    assertValid(patched);
    const clip = clipOf(patched, id);
    assert.deepEqual([clip.label, clip.volume], ['Theme', 0.5]);
    assert.equal(clip.music, clipOf(edl, id).music);
    assert.deepEqual([clip.sourceFile, clip.sourceIn, 'web' in clip], [FILE, 0, false]);
    const plain = testEdl({ a1: [testClip('a', 0, 5)] });
    assert.ok(
      !('music' in clipOf(updateClip(plain, 'a', { music: { song: {} } }), 'a')),
      'nor give one to another clip',
    );
  });

  it('trim and slip stop at the ends of the song, with no map of durations', () => {
    const { edl, id } = rendered();
    assert.ok(isTimed(clipOf(edl, id), edl.tracks[1]));
    assert.equal(clipOf(trimClipEnd(edl, id, 30), id).timelineEnd, 10, 'no longer than the song');
    assert.equal(clipOf(trimClipStart(edl, id, -5), id).timelineStart, 0);
    const inner = trimClipEnd(trimClipStart(edl, id, 2), id, 6);
    assert.deepEqual([clipOf(inner, id).sourceIn, clipOf(inner, id).sourceOut], [2, 6]);
    assert.equal(
      clipOf(slipClip(inner, id, 50), id).sourceOut,
      10,
      'slipped to the end, not past it',
    );
    assert.equal(clipOf(slipClip(inner, id, -50), id).sourceIn, 0);
    assertValid(slipClip(inner, id, 50));
    const unrendered = insertMusicClip(testEdl(), SONG);
    const [raw] = newClipIds(testEdl(), unrendered);
    assert.equal(
      clipOf(trimClipEnd(unrendered, raw, 30), raw).timelineEnd,
      10,
      'also before it is rendered',
    );
  });
});

describe('the music field on load and save', () => {
  it('is absent on every clip that is not a music clip', () => {
    assert.ok(!('music' in createClip()));
    for (const music of [null, 5, 'x', [], {}, { song: 'x' }, { key: KEY }, { song: [SONG] }]) {
      assert.ok(
        !('music' in loaded(rawClip({ music, sourceFile: '/a.wav' }))),
        JSON.stringify(music),
      );
    }
    const plain = normalizeEdl(testEdl({ v1: [testClip('a', 0, 5)], a1: [testClip('b', 0, 5)] }));
    for (const track of plain.tracks) for (const clip of track.clips) assert.ok(!('music' in clip));
  });

  it('keeps the block of a music clip, the song normalised, the key when it is one', () => {
    assert.deepEqual(loaded(rawClip({ music: { song: SONG, key: KEY, more: 1 } })).music, {
      song: normalizeSong(SONG),
      key: KEY,
    });
    assert.deepEqual(loaded(rawClip({ music: { song: {}, key: 'nope' } })).music, {
      song: normalizeSong({}),
      key: '',
    });
    const hostile = JSON.parse(
      '{"song":{"bpm":1e99,"parts":[{"lanes":{"kick":"X","__proto__":"x"}}],"__proto__":{"bars":9}},"key":7}',
    );
    const clip = loaded(rawClip({ music: hostile }));
    assert.deepEqual([clip.music.song.bpm, clip.music.song.bars, clip.music.key], [240, 4, '']);
    assertValid(normalizeEdl(rawDoc(rawClip({ music: hostile }))));
  });

  it('brings the window inside the song; a clip written without an end lasts to the end of it', () => {
    const open = loaded(rawClip({ timelineEnd: undefined, timelineStart: 2 }));
    assert.deepEqual(
      [open.timelineStart, open.timelineEnd, open.sourceIn, open.sourceOut],
      [2, 12, 0, 10],
    );
    const long = loaded(rawClip({ timelineEnd: 60, sourceOut: 60 }));
    assert.deepEqual([long.timelineEnd, long.sourceOut], [10, 10]);
    const late = loaded(rawClip({ sourceIn: 50, sourceOut: 55, timelineEnd: 5 }));
    assert.ok(late.sourceIn >= 0 && late.sourceOut <= 10 + 1e-9);
    assertValid(normalizeEdl(rawDoc(rawClip({ sourceIn: -3, timelineEnd: 99 }))));
  });

  it('a clip is a web clip or a music clip, never both: the web block wins', () => {
    const both = loaded(
      rawClip({ web: { recipe: RECIPE, key: recipeKey(RECIPE, 30) }, timelineEnd: 5 }),
    );
    assert.ok(isWebClip(both) && !isMusicClip(both) && !('music' in both));
    const blank = loaded(rawClip({ web: { recipe: { steps: [] } } }));
    assert.ok('web' in blank && !('music' in blank), 'also a web block that has no address yet');
    const { edl, id } = rendered();
    const forced = {
      ...edl,
      tracks: edl.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => ({ ...clip, web: both.web })),
      })),
    };
    assert.equal(
      problemsOf(forced)[0],
      'tracks[1].clips[0].music: a clip is a web clip or a music clip, not both',
    );
    assert.ok(!('music' in clipOf(normalizeEdl(forced), id)), 'normalising settles it');
  });

  it('validateEdl checks the shape of the block and the bounds of the window', () => {
    const { edl, id } = rendered();
    const withMusic = (music, more = {}) => ({
      ...edl,
      tracks: edl.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => (clip.clipId === id ? { ...clip, music, ...more } : clip)),
      })),
    });
    assert.deepEqual(problemsOf(edl), []);
    assert.deepEqual(problemsOf(withMusic('song')), [
      'tracks[1].clips[0].music: must be an object',
    ]);
    assert.deepEqual(problemsOf(withMusic({ song: SONG, key: KEY })), [
      'tracks[1].clips[0].music.song.bpm: is not what a normalised song holds (see normalizeSong)',
    ]);
    assert.deepEqual(problemsOf(withMusic({ song: normalizeSong(SONG), key: 'short' })), [
      "tracks[1].clips[0].music.key: must be '' or the 20 hex digits of a rendering's key",
    ]);
    const past = withMusic(clipOf(edl, id).music, { sourceOut: 14, timelineEnd: 14 });
    assert.deepEqual(problemsOf(past), [
      'tracks[1].clips[0].sourceOut: exceeds the source duration (invariant 2)',
    ]);
    assert.match(
      problemsOf(withMusic(clipOf(edl, id).music, { sourceIn: -1, sourceOut: 9 }))[0],
      /must not be negative/,
    );
  });

  it('survives saving and loading, and a fragment from the director, unchanged', () => {
    const { edl, id } = rendered();
    const saved = JSON.parse(JSON.stringify(toSavedDocument(edl, {})));
    assert.deepEqual(clipOf(fromSavedDocument(saved).edl, id), clipOf(edl, id));
    assert.deepEqual(normalizeEdl(edl), edl, 'a valid document is left as it is');
    const result = {
      mode: 'append',
      tracks: [{ type: 'audio', clips: [rawClip({ clipId: 'score' })] }],
    };
    const applied = applyDirectorResult(testEdl(), result);
    assertValid(applied);
    assert.deepEqual(clipOf(applied, 'score').music, { song: normalizeSong(SONG), key: '' });
    assert.equal(clipOf(applied, 'score').timelineEnd, 10);
  });
});
